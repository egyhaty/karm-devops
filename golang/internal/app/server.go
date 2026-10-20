package app

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"golang.org/x/oauth2"
)

type Server struct {
	cfg      Config
	db       *pgxpool.Pool
	logger   *slog.Logger
	provider *oidc.Provider
	verifier *oidc.IDTokenVerifier
	oauth    oauth2.Config
	registry *prometheus.Registry
	requests *prometheus.CounterVec
	latency  *prometheus.HistogramVec
	web      http.Handler
}

func New(ctx context.Context, cfg Config, logger *slog.Logger) (*Server, error) {
	poolCfg, err := pgxpool.ParseConfig(cfg.DatabaseURL)
	if err != nil {
		return nil, errors.New("invalid database configuration")
	}
	poolCfg.MaxConns = 10
	poolCfg.MinConns = 1
	poolCfg.MaxConnLifetime = 30 * time.Minute
	poolCfg.MaxConnIdleTime = 5 * time.Minute
	db, err := pgxpool.NewWithConfig(ctx, poolCfg)
	if err != nil {
		return nil, errors.New("connect to database")
	}
	pingCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	if err := db.Ping(pingCtx); err != nil {
		db.Close()
		return nil, fmt.Errorf("database is not ready: %w", err)
	}
	if err := migrate(pingCtx, db); err != nil {
		db.Close()
		return nil, fmt.Errorf("apply database migrations: %w", err)
	}

	provider := (&oidc.ProviderConfig{IssuerURL: cfg.OIDCIssuer, AuthURL: cfg.OIDCIssuer + "/protocol/openid-connect/auth", TokenURL: cfg.OIDCInternalIssuer + "/protocol/openid-connect/token", JWKSURL: cfg.OIDCInternalIssuer + "/protocol/openid-connect/certs"}).NewProvider(ctx)

	registry := prometheus.NewRegistry()
	requests := prometheus.NewCounterVec(prometheus.CounterOpts{Name: "learning_lab_http_requests_total", Help: "HTTP requests handled by the learning platform."}, []string{"method", "route", "status"})
	latency := prometheus.NewHistogramVec(prometheus.HistogramOpts{Name: "learning_lab_http_request_duration_seconds", Help: "HTTP request duration in seconds.", Buckets: prometheus.DefBuckets}, []string{"method", "route"})
	registry.MustRegister(requests, latency, prometheus.NewGoCollector(), prometheus.NewProcessCollector(prometheus.ProcessCollectorOpts{}))

	server := &Server{
		cfg: cfg, db: db, logger: logger, provider: provider,
		verifier: provider.Verifier(&oidc.Config{ClientID: cfg.OIDCClientID}),
		oauth: oauth2.Config{
			ClientID: cfg.OIDCClientID,
			Endpoint: provider.Endpoint(), RedirectURL: cfg.CallbackURL,
			Scopes: []string{oidc.ScopeOpenID, "profile", "email"},
		},
		registry: registry, requests: requests, latency: latency,
		web: http.FileServer(http.Dir(cfg.WebDirectory)),
	}
	return server, nil
}

func (s *Server) Close() { s.db.Close() }

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok\n"))
	})
	mux.HandleFunc("GET /readyz", s.ready)
	mux.HandleFunc("GET /auth/login", s.login)
	mux.HandleFunc("GET /admin", s.adminEntry)
	mux.HandleFunc("GET /api/auth/callback", s.callback)
	mux.HandleFunc("POST /api/auth/logout", s.requireUser(s.withCSRF(s.logout)))
	mux.HandleFunc("GET /api/me", s.requireUser(s.me))
	mux.HandleFunc("GET /api/progress", s.requireUser(s.getProgress))
	mux.HandleFunc("PUT /api/progress/{lessonID}", s.requireUser(s.withCSRF(s.saveProgress)))
	mux.HandleFunc("GET /api/admin/overview", s.requireAdmin(s.adminOverview))
	mux.HandleFunc("GET /api/admin/users", s.requireAdmin(s.listUsers))
	mux.HandleFunc("GET /api/admin/audit", s.requireAdmin(s.adminAudit))
	mux.HandleFunc("PATCH /api/admin/users/{subject}", s.requireAdmin(s.withCSRF(s.updateUser)))
	mux.Handle("/", s.web)

	return s.securityHeaders(s.metricsMiddleware(mux))
}

func (s *Server) MetricsHandler() http.Handler {
	return promhttp.HandlerFor(s.registry, promhttp.HandlerOpts{})
}

func (s *Server) ready(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	if err := s.db.Ping(ctx); err != nil {
		http.Error(w, "database unavailable", http.StatusServiceUnavailable)
		return
	}
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte("ready\n"))
}

func (s *Server) securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		header := w.Header()
		header.Set("X-Content-Type-Options", "nosniff")
		header.Set("X-Frame-Options", "DENY")
		header.Set("Referrer-Policy", "strict-origin-when-cross-origin")
		header.Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
		header.Set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'")
		if s.cfg.CookieSecure {
			header.Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) metricsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		started := time.Now()
		rw := &statusWriter{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rw, r)
		route := r.Pattern
		if route == "" {
			route = "unmatched"
		}
		s.requests.WithLabelValues(r.Method, route, http.StatusText(rw.status)).Inc()
		s.latency.WithLabelValues(r.Method, route).Observe(time.Since(started).Seconds())
	})
}

type statusWriter struct {
	http.ResponseWriter
	status int
}

func (w *statusWriter) WriteHeader(status int) {
	w.status = status
	w.ResponseWriter.WriteHeader(status)
}
