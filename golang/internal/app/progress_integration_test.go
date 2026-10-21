package app

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Only the explicitly supplied disposable test database is used. Each run owns
// a separate schema; no test connects to application configuration or production.
func TestCloudProgressMigrationPreservesLegacyAndSync(t *testing.T) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("set TEST_DATABASE_URL to a disposable PostgreSQL database")
	}
	ctx := context.Background()
	admin, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer admin.Close()
	schema := fmt.Sprintf("cloud_progress_%d", time.Now().UnixNano())
	if _, err := admin.Exec(ctx, "CREATE SCHEMA "+schema); err != nil {
		t.Fatal(err)
	}
	defer func() {
		if _, err := admin.Exec(ctx, "DROP SCHEMA "+schema+" CASCADE"); err != nil {
			t.Error(err)
		}
	}()
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		t.Fatal(err)
	}
	cfg.ConnConfig.RuntimeParams["search_path"] = schema
	db, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := db.Exec(ctx, `CREATE TABLE schema_migrations(version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`); err != nil {
		t.Fatal(err)
	}
	for _, version := range []string{"001_init.sql", "002_admin_audit.sql", "003_auth_return_path.sql"} {
		sql, err := migrationFiles.ReadFile("migrations/" + version)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := db.Exec(ctx, string(sql)); err != nil {
			t.Fatal(err)
		}
		if _, err := db.Exec(ctx, `INSERT INTO schema_migrations(version) VALUES($1)`, version); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := db.Exec(ctx, `INSERT INTO users(subject,email,is_admin) VALUES('legacy','legacy@example.invalid',true)`); err != nil {
		t.Fatal(err)
	}
	original := time.Now().UTC().Add(-time.Hour).Truncate(time.Microsecond)
	if _, err := db.Exec(ctx, `INSERT INTO learning_progress(subject,lesson_id,completed,updated_at) VALUES('legacy','lesson-01',true,$1)`, original); err != nil {
		t.Fatal(err)
	}
	if err := migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	if err := migrate(ctx, db); err != nil {
		t.Fatalf("migration is not idempotent: %v", err)
	}
	var email string
	var adminFlag, complete bool
	var stored time.Time
	if err := db.QueryRow(ctx, `SELECT email,is_admin FROM users WHERE subject='legacy'`).Scan(&email, &adminFlag); err != nil || email != "legacy@example.invalid" || !adminFlag {
		t.Fatalf("legacy user changed: %v", err)
	}
	if err := db.QueryRow(ctx, `SELECT completed,updated_at FROM learning_progress WHERE subject='legacy' AND lesson_id='lesson-01'`).Scan(&complete, &stored); err != nil || !complete || !stored.Equal(original) {
		t.Fatalf("legacy progress changed: %v", err)
	}
	server := &Server{db: db, logger: slog.New(slog.NewTextHandler(io.Discard, nil))}
	save := func(id string, done bool, at time.Time) int {
		req := httptest.NewRequest("PUT", "/api/progress/"+id, strings.NewReader(fmt.Sprintf(`{"completed":%t,"updatedAt":%q}`, done, at.Format(time.RFC3339Nano))))
		req.Header.Set("Content-Type", "application/json")
		req.SetPathValue("lessonID", id)
		req = req.WithContext(context.WithValue(req.Context(), userContextKey{}, User{Subject: "legacy"}))
		result := httptest.NewRecorder()
		server.saveProgress(result, req)
		return result.Code
	}
	ids := []string{"docker", "git", "network-policy", "lesson-13"}
	for _, track := range []string{"aws", "azure"} {
		for i := 1; i <= 7; i++ {
			ids = append(ids, fmt.Sprintf("%s-%02d", track, i))
		}
	}
	now := time.Now().UTC().Truncate(time.Microsecond)
	for _, id := range ids {
		if status := save(id, true, now); status != 204 {
			t.Fatalf("save %s: %d", id, status)
		}
	}
	if status := save("aws-01", false, now.Add(-time.Minute)); status != 204 {
		t.Fatal(status)
	}
	if err := db.QueryRow(ctx, `SELECT completed FROM learning_progress WHERE subject='legacy' AND lesson_id='aws-01'`).Scan(&complete); err != nil || !complete {
		t.Fatalf("stale write overwrote newer completion: %v", err)
	}
	if status := save("aws-01", false, now.Add(time.Second)); status != 204 {
		t.Fatal(status)
	}
	if err := db.QueryRow(ctx, `SELECT completed FROM learning_progress WHERE subject='legacy' AND lesson_id='aws-01'`).Scan(&complete); err != nil || complete {
		t.Fatalf("uncomplete failed: %v", err)
	}
	if status := save("aws-08", true, now); status != 400 {
		t.Fatalf("unexpected ID accepted: %d", status)
	}
	if _, err := db.Exec(ctx, `INSERT INTO learning_progress(subject,lesson_id,completed) VALUES('legacy','azure-99',true)`); err == nil {
		t.Fatal("database constraint accepted unknown module")
	}
	req := httptest.NewRequest("GET", "/api/progress", nil)
	req = req.WithContext(context.WithValue(req.Context(), userContextKey{}, User{Subject: "legacy"}))
	result := httptest.NewRecorder()
	server.getProgress(result, req)
	if result.Code != 200 || !strings.Contains(result.Body.String(), `"lessonId":"azure-07"`) || !strings.Contains(result.Body.String(), `"lessonId":"lesson-01"`) {
		t.Fatalf("progress pull missing records: %d", result.Code)
	}
}
