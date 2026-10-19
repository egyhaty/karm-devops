package app

import (
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	ListenAddress      string
	DatabaseURL        string
	OIDCIssuer         string
	OIDCInternalIssuer string
	OIDCClientID       string
	CallbackURL        string
	CookieSecure       bool
	SessionTTL         time.Duration
	WebDirectory       string
}

func LoadConfig() (Config, error) {
	secure, err := strconv.ParseBool(env("COOKIE_SECURE", "true"))
	if err != nil {
		return Config{}, fmt.Errorf("COOKIE_SECURE: %w", err)
	}
	ttl, err := time.ParseDuration(env("SESSION_TTL", "8h"))
	if err != nil || ttl < time.Hour || ttl > 24*time.Hour {
		return Config{}, errors.New("SESSION_TTL must be between 1h and 24h")
	}

	cfg := Config{
		ListenAddress:      env("LISTEN_ADDRESS", ":8080"),
		DatabaseURL:        strings.TrimSpace(os.Getenv("DATABASE_URL")),
		OIDCIssuer:         strings.TrimRight(strings.TrimSpace(os.Getenv("OIDC_ISSUER")), "/"),
		OIDCInternalIssuer: strings.TrimRight(strings.TrimSpace(os.Getenv("OIDC_INTERNAL_ISSUER")), "/"),
		OIDCClientID:       strings.TrimSpace(os.Getenv("OIDC_CLIENT_ID")),
		CallbackURL:        strings.TrimSpace(os.Getenv("OIDC_CALLBACK_URL")),
		CookieSecure:       secure,
		SessionTTL:         ttl,
		WebDirectory:       env("WEB_DIRECTORY", "web"),
	}
	for name, value := range map[string]string{
		"DATABASE_URL": cfg.DatabaseURL, "OIDC_ISSUER": cfg.OIDCIssuer, "OIDC_INTERNAL_ISSUER": cfg.OIDCInternalIssuer,
		"OIDC_CLIENT_ID":    cfg.OIDCClientID,
		"OIDC_CALLBACK_URL": cfg.CallbackURL,
	} {
		if value == "" {
			return Config{}, fmt.Errorf("%s is required", name)
		}
	}
	return cfg, nil
}

func env(name, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(name)); value != "" {
		return value
	}
	return fallback
}
