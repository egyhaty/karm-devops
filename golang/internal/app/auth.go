package app

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"net/http"
	"strings"
	"time"

	"golang.org/x/oauth2"
)

const (
	sessionCookieName = "learning_session"
	stateCookieName   = "learning_state"
	csrfCookieName    = "learning_csrf"
)

type userContextKey struct{}

type User struct {
	Subject     string    `json:"subject"`
	Email       string    `json:"email"`
	DisplayName string    `json:"displayName"`
	IsAdmin     bool      `json:"isAdmin"`
	Disabled    bool      `json:"disabled"`
	CreatedAt   time.Time `json:"createdAt,omitempty"`
	LastSeenAt  time.Time `json:"lastSeenAt,omitempty"`
}

type session struct {
	user      User
	csrfHash  []byte
	expiresAt time.Time
}

type idClaims struct {
	Subject           string `json:"sub"`
	Email             string `json:"email"`
	Name              string `json:"name"`
	PreferredUsername string `json:"preferred_username"`
	Nonce             string `json:"nonce"`
	RealmAccess       struct {
		Roles []string `json:"roles"`
	} `json:"realm_access"`
}

type authRequest struct{ nonce, verifier, returnPath string }

// Only known local destinations can survive the identity-provider round trip.
func loginReturnPath(value string) string {
	if value == "/admin.html" {
		return value
	}
	return "/"
}

func (s *Server) adminEntry(w http.ResponseWriter, r *http.Request) {
	user, _, err := s.currentUser(r)
	if err != nil {
		http.Redirect(w, r, "/auth/login?next=/admin.html", http.StatusSeeOther)
		return
	}
	if !user.IsAdmin {
		http.Error(w, "Administrator access is required.", http.StatusForbidden)
		return
	}
	http.Redirect(w, r, "/admin.html", http.StatusSeeOther)
}

func randomToken(size int) (string, error) {
	b := make([]byte, size)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

func digest(value string) []byte { sum := sha256.Sum256([]byte(value)); return sum[:] }

func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	state, err := randomToken(32)
	if err != nil {
		http.Error(w, "unable to start sign-in", http.StatusInternalServerError)
		return
	}
	nonce, err := randomToken(32)
	if err != nil {
		http.Error(w, "unable to start sign-in", http.StatusInternalServerError)
		return
	}
	verifier, err := randomToken(32)
	if err != nil {
		http.Error(w, "unable to start sign-in", http.StatusInternalServerError)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	if _, err := s.db.Exec(ctx, `DELETE FROM auth_requests WHERE expires_at < now()`); err != nil {
		s.logger.Error("clean auth requests", "error", err)
		http.Error(w, "sign-in is temporarily unavailable", http.StatusServiceUnavailable)
		return
	}
	if _, err := s.db.Exec(ctx, `DELETE FROM sessions WHERE expires_at < now()`); err != nil {
		s.logger.Warn("cleanup expired sessions", "error", err)
	}
	_, err = s.db.Exec(ctx, `INSERT INTO auth_requests (state_hash, nonce, pkce_verifier, expires_at, return_path) VALUES ($1,$2,$3,$4,$5)`, digest(state), nonce, verifier, time.Now().Add(10*time.Minute), loginReturnPath(r.URL.Query().Get("next")))
	if err != nil {
		s.logger.Error("store auth request", "error", err)
		http.Error(w, "sign-in is temporarily unavailable", http.StatusServiceUnavailable)
		return
	}
	s.setCookie(w, stateCookieName, state, 10*time.Minute, true)
	url := s.oauth.AuthCodeURL(state, oauth2.SetAuthURLParam("nonce", nonce), oauth2.S256ChallengeOption(verifier))
	http.Redirect(w, r, url, http.StatusFound)
}

func (s *Server) callback(w http.ResponseWriter, r *http.Request) {
	stateCookie, err := r.Cookie(stateCookieName)
	if err != nil || stateCookie.Value == "" || r.URL.Query().Get("state") == "" || subtle.ConstantTimeCompare([]byte(stateCookie.Value), []byte(r.URL.Query().Get("state"))) != 1 {
		s.clearCookie(w, stateCookieName, true)
		http.Error(w, "invalid sign-in state", http.StatusBadRequest)
		return
	}
	if providerErr := r.URL.Query().Get("error"); providerErr != "" {
		s.clearCookie(w, stateCookieName, true)
		http.Redirect(w, r, "/?signin=cancelled", http.StatusSeeOther)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()
	var request authRequest
	err = s.db.QueryRow(ctx, `DELETE FROM auth_requests WHERE state_hash=$1 AND expires_at > now() RETURNING nonce, pkce_verifier, return_path`, digest(stateCookie.Value)).Scan(&request.nonce, &request.verifier, &request.returnPath)
	s.clearCookie(w, stateCookieName, true)
	if err != nil {
		http.Error(w, "sign-in expired; please try again", http.StatusBadRequest)
		return
	}
	code := r.URL.Query().Get("code")
	if code == "" {
		http.Error(w, "missing authorization code", http.StatusBadRequest)
		return
	}
	token, err := s.oauth.Exchange(ctx, code, oauth2.VerifierOption(request.verifier))
	if err != nil {
		s.logger.Warn("OIDC code exchange failed", "error", err)
		http.Error(w, "sign-in failed", http.StatusUnauthorized)
		return
	}
	rawIDToken, ok := token.Extra("id_token").(string)
	if !ok || rawIDToken == "" {
		http.Error(w, "identity provider returned no ID token", http.StatusUnauthorized)
		return
	}
	idToken, err := s.verifier.Verify(ctx, rawIDToken)
	if err != nil {
		s.logger.Warn("OIDC token verification failed", "error", err)
		http.Error(w, "sign-in failed", http.StatusUnauthorized)
		return
	}
	var claims idClaims
	if err := idToken.Claims(&claims); err != nil || claims.Subject == "" || claims.Nonce == "" || subtle.ConstantTimeCompare([]byte(claims.Nonce), []byte(request.nonce)) != 1 {
		http.Error(w, "invalid identity response", http.StatusUnauthorized)
		return
	}
	name := strings.TrimSpace(claims.Name)
	if name == "" {
		name = claims.PreferredUsername
	}
	isAdmin := contains(claims.RealmAccess.Roles, "platform-admin")
	var disabled bool
	err = s.db.QueryRow(ctx, `INSERT INTO users (subject,email,display_name,is_admin,last_seen_at) VALUES ($1,$2,$3,$4,now()) ON CONFLICT(subject) DO UPDATE SET email=EXCLUDED.email, display_name=EXCLUDED.display_name, last_seen_at=now() RETURNING disabled`, claims.Subject, claims.Email, name, isAdmin).Scan(&disabled)
	if err != nil {
		s.logger.Error("upsert user", "error", err)
		http.Error(w, "account service unavailable", http.StatusServiceUnavailable)
		return
	}
	if disabled {
		http.Error(w, "this account is disabled", http.StatusForbidden)
		return
	}

	apiToken, err := randomToken(32)
	if err != nil {
		http.Error(w, "unable to create session", http.StatusInternalServerError)
		return
	}
	csrfToken, err := randomToken(32)
	if err != nil {
		http.Error(w, "unable to create session", http.StatusInternalServerError)
		return
	}
	expires := time.Now().Add(s.cfg.SessionTTL)
	_, err = s.db.Exec(ctx, `INSERT INTO sessions (token_hash,subject,csrf_hash,expires_at) VALUES ($1,$2,$3,$4)`, digest(apiToken), claims.Subject, digest(csrfToken), expires)
	if err != nil {
		s.logger.Error("create session", "error", err)
		http.Error(w, "unable to create session", http.StatusServiceUnavailable)
		return
	}
	s.setCookie(w, sessionCookieName, apiToken, s.cfg.SessionTTL, true)
	s.setCookie(w, csrfCookieName, csrfToken, s.cfg.SessionTTL, false)
	http.Redirect(w, r, loginReturnPath(request.returnPath), http.StatusSeeOther)
}

func (s *Server) logout(w http.ResponseWriter, r *http.Request) {
	if c, err := r.Cookie(sessionCookieName); err == nil {
		ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
		defer cancel()
		_, _ = s.db.Exec(ctx, `DELETE FROM sessions WHERE token_hash=$1`, digest(c.Value))
	}
	s.clearCookie(w, sessionCookieName, true)
	s.clearCookie(w, csrfCookieName, false)
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) requireUser(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user, sess, err := s.currentUser(r)
		if err != nil {
			writeJSONError(w, http.StatusUnauthorized, "sign-in required")
			return
		}
		ctx := context.WithValue(r.Context(), userContextKey{}, user)
		if err := s.touchSession(ctx, r); err != nil {
			s.logger.Warn("refresh user activity", "error", err)
		}
		_ = sess
		next.ServeHTTP(w, r.WithContext(ctx))
	}
}

func (s *Server) requireAdmin(next http.HandlerFunc) http.HandlerFunc {
	return s.requireUser(func(w http.ResponseWriter, r *http.Request) {
		user := r.Context().Value(userContextKey{}).(User)
		if !user.IsAdmin {
			writeJSONError(w, http.StatusForbidden, "administrator access required")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) withCSRF(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie(csrfCookieName)
		header := r.Header.Get("X-CSRF-Token")
		if err != nil || header == "" || subtle.ConstantTimeCompare([]byte(cookie.Value), []byte(header)) != 1 {
			writeJSONError(w, http.StatusForbidden, "invalid request token")
			return
		}
		_, sess, err := s.currentUser(r)
		if err != nil || subtle.ConstantTimeCompare(digest(cookie.Value), sess.csrfHash) != 1 {
			writeJSONError(w, http.StatusForbidden, "invalid request token")
			return
		}
		next.ServeHTTP(w, r)
	}
}

func (s *Server) currentUser(r *http.Request) (User, session, error) {
	cookie, err := r.Cookie(sessionCookieName)
	if err != nil || cookie.Value == "" {
		return User{}, session{}, errors.New("no session")
	}
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	var user User
	var sess session
	err = s.db.QueryRow(ctx, `SELECT u.subject,u.email,u.display_name,u.is_admin,u.disabled,u.created_at,u.last_seen_at,s.csrf_hash,s.expires_at FROM sessions s JOIN users u ON u.subject=s.subject WHERE s.token_hash=$1 AND s.expires_at>now()`, digest(cookie.Value)).Scan(&user.Subject, &user.Email, &user.DisplayName, &user.IsAdmin, &user.Disabled, &user.CreatedAt, &user.LastSeenAt, &sess.csrfHash, &sess.expiresAt)
	if err != nil || user.Disabled {
		return User{}, session{}, errors.New("invalid session")
	}
	sess.user = user
	return user, sess, nil
}

func (s *Server) touchSession(ctx context.Context, r *http.Request) error {
	cookie, err := r.Cookie(sessionCookieName)
	if err != nil {
		return err
	}
	_, err = s.db.Exec(ctx, `UPDATE users SET last_seen_at=now() WHERE subject=(SELECT subject FROM sessions WHERE token_hash=$1)`, digest(cookie.Value))
	return err
}

func (s *Server) setCookie(w http.ResponseWriter, name, value string, ttl time.Duration, httpOnly bool) {
	http.SetCookie(w, &http.Cookie{Name: name, Value: value, Path: "/", MaxAge: int(ttl.Seconds()), HttpOnly: httpOnly, Secure: s.cfg.CookieSecure, SameSite: http.SameSiteLaxMode})
}
func (s *Server) clearCookie(w http.ResponseWriter, name string, httpOnly bool) {
	http.SetCookie(w, &http.Cookie{Name: name, Value: "", Path: "/", MaxAge: -1, HttpOnly: httpOnly, Secure: s.cfg.CookieSecure, SameSite: http.SameSiteLaxMode})
}

func contains(items []string, want string) bool {
	for _, item := range items {
		if item == want {
			return true
		}
	}
	return false
}
