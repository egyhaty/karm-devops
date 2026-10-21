package app

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

var lessonIDPattern = regexp.MustCompile(`^(lesson-(0[1-9]|1[0-3])|docker|git|network-policy|(aws|azure)-0[1-7])$`)

type progressItem struct {
	LessonID  string    `json:"lessonId"`
	Completed bool      `json:"completed"`
	UpdatedAt time.Time `json:"updatedAt"`
}

func (s *Server) me(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"user": r.Context().Value(userContextKey{})})
}

func (s *Server) getProgress(w http.ResponseWriter, r *http.Request) {
	user := r.Context().Value(userContextKey{}).(User)
	rows, err := s.db.Query(r.Context(), `SELECT lesson_id,completed,updated_at FROM learning_progress WHERE subject=$1 ORDER BY lesson_id`, user.Subject)
	if err != nil {
		s.logger.Error("read progress", "error", err)
		writeJSONError(w, http.StatusInternalServerError, "unable to load progress")
		return
	}
	defer rows.Close()
	items := make([]progressItem, 0)
	for rows.Next() {
		var item progressItem
		if err := rows.Scan(&item.LessonID, &item.Completed, &item.UpdatedAt); err != nil {
			writeJSONError(w, http.StatusInternalServerError, "unable to load progress")
			return
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "unable to load progress")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (s *Server) saveProgress(w http.ResponseWriter, r *http.Request) {
	user := r.Context().Value(userContextKey{}).(User)
	lessonID := r.PathValue("lessonID")
	if !lessonIDPattern.MatchString(lessonID) {
		writeJSONError(w, http.StatusBadRequest, "invalid lesson id")
		return
	}
	var input struct {
		Completed bool      `json:"completed"`
		UpdatedAt time.Time `json:"updatedAt"`
	}
	if err := decodeJSON(w, r, &input); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	now := time.Now().UTC()
	updatedAt := input.UpdatedAt
	if updatedAt.IsZero() || updatedAt.After(now.Add(time.Minute)) || updatedAt.Before(now.AddDate(-1, 0, 0)) {
		updatedAt = now
	}
	_, err := s.db.Exec(r.Context(), `INSERT INTO learning_progress(subject,lesson_id,completed,updated_at) VALUES($1,$2,$3,$4) ON CONFLICT(subject,lesson_id) DO UPDATE SET completed=EXCLUDED.completed,updated_at=EXCLUDED.updated_at WHERE learning_progress.updated_at <= EXCLUDED.updated_at`, user.Subject, lessonID, input.Completed, updatedAt)
	if err != nil {
		s.logger.Error("save progress", "error", err)
		writeJSONError(w, http.StatusInternalServerError, "unable to save progress")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) adminOverview(w http.ResponseWriter, r *http.Request) {
	var users, activeUsers, admins, completed int64
	var lessons int64
	err := s.db.QueryRow(r.Context(), `SELECT count(*), count(*) FILTER (WHERE disabled=false), count(*) FILTER (WHERE is_admin=true AND disabled=false) FROM users`).Scan(&users, &activeUsers, &admins)
	if err == nil {
		err = s.db.QueryRow(r.Context(), `SELECT count(*), count(DISTINCT lesson_id) FROM learning_progress WHERE completed=true`).Scan(&completed, &lessons)
	}
	if err != nil {
		s.logger.Error("read admin overview", "error", err)
		writeJSONError(w, http.StatusInternalServerError, "unable to load dashboard")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"users": users, "activeUsers": activeUsers, "admins": admins, "completedLessons": completed, "lessonsWithCompletions": lessons})
}

func (s *Server) listUsers(w http.ResponseWriter, r *http.Request) {
	limit := 100
	rows, err := s.db.Query(r.Context(), `SELECT u.subject,u.email,u.display_name,u.is_admin,u.disabled,u.created_at,u.last_seen_at, count(p.lesson_id) FILTER (WHERE p.completed=true) AS completed FROM users u LEFT JOIN learning_progress p ON p.subject=u.subject GROUP BY u.subject ORDER BY u.last_seen_at DESC LIMIT $1`, limit)
	if err != nil {
		s.logger.Error("list users", "error", err)
		writeJSONError(w, http.StatusInternalServerError, "unable to load users")
		return
	}
	defer rows.Close()
	type adminUser struct {
		User
		Completed int64 `json:"completedLessons"`
	}
	users := make([]adminUser, 0)
	for rows.Next() {
		var u adminUser
		if err := rows.Scan(&u.Subject, &u.Email, &u.DisplayName, &u.IsAdmin, &u.Disabled, &u.CreatedAt, &u.LastSeenAt, &u.Completed); err != nil {
			writeJSONError(w, http.StatusInternalServerError, "unable to load users")
			return
		}
		users = append(users, u)
	}
	if err := rows.Err(); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "unable to load users")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"users": users})
}

func (s *Server) updateUser(w http.ResponseWriter, r *http.Request) {
	actor := r.Context().Value(userContextKey{}).(User)
	target := r.PathValue("subject")
	if target == "" || len(target) > 255 {
		writeJSONError(w, http.StatusBadRequest, "invalid user")
		return
	}
	var input struct {
		IsAdmin  *bool `json:"isAdmin"`
		Disabled *bool `json:"disabled"`
	}
	if err := decodeJSON(w, r, &input); err != nil || (input.IsAdmin == nil && input.Disabled == nil) {
		writeJSONError(w, http.StatusBadRequest, "provide isAdmin or disabled")
		return
	}
	if target == actor.Subject && ((input.IsAdmin != nil && !*input.IsAdmin) || (input.Disabled != nil && *input.Disabled)) {
		writeJSONError(w, http.StatusConflict, "you cannot remove your own administrator access")
		return
	}

	tx, err := s.db.Begin(r.Context())
	if err != nil {
		writeJSONError(w, http.StatusServiceUnavailable, "unable to update account")
		return
	}
	defer tx.Rollback(r.Context())
	var oldAdmin, oldDisabled bool
	err = tx.QueryRow(r.Context(), `SELECT is_admin,disabled FROM users WHERE subject=$1 FOR UPDATE`, target).Scan(&oldAdmin, &oldDisabled)
	if errors.Is(err, pgx.ErrNoRows) {
		writeJSONError(w, http.StatusNotFound, "user not found")
		return
	}
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "unable to update account")
		return
	}
	newAdmin, newDisabled := oldAdmin, oldDisabled
	if input.IsAdmin != nil {
		newAdmin = *input.IsAdmin
	}
	if input.Disabled != nil {
		newDisabled = *input.Disabled
	}
	if oldAdmin && !oldDisabled && (!newAdmin || newDisabled) {
		if _, err := tx.Exec(r.Context(), `SELECT pg_advisory_xact_lock(741303)`); err != nil {
			writeJSONError(w, http.StatusInternalServerError, "unable to update account")
			return
		}
		var activeAdmins int
		if err := tx.QueryRow(r.Context(), `SELECT count(*) FROM users WHERE is_admin=true AND disabled=false`).Scan(&activeAdmins); err != nil {
			writeJSONError(w, http.StatusInternalServerError, "unable to update account")
			return
		}
		if activeAdmins <= 1 {
			writeJSONError(w, http.StatusConflict, "the last active administrator cannot be removed")
			return
		}
	}
	_, err = tx.Exec(r.Context(), `UPDATE users SET is_admin=$2,disabled=$3 WHERE subject=$1`, target, newAdmin, newDisabled)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "unable to update account")
		return
	}
	_, err = tx.Exec(r.Context(), `INSERT INTO admin_audit(actor_subject,target_subject,action,details) VALUES($1,$2,$3,jsonb_build_object('isAdmin',$4,'disabled',$5))`, actor.Subject, target, auditAction(oldAdmin, newAdmin, oldDisabled, newDisabled), newAdmin, newDisabled)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "unable to write audit record")
		return
	}
	if err = tx.Commit(r.Context()); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "unable to update account")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func decodeJSON(w http.ResponseWriter, r *http.Request, destination any) error {
	if !strings.HasPrefix(r.Header.Get("Content-Type"), "application/json") {
		return errors.New("content type must be application/json")
	}
	r.Body = http.MaxBytesReader(w, r.Body, 16<<10)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(destination); err != nil {
		return err
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return errors.New("body must contain one JSON value")
	}
	return nil
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
func writeJSONError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

func (s *Server) adminAudit(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.Query(r.Context(), `SELECT a.id,a.actor_subject,COALESCE(actor.email,''),a.target_subject,COALESCE(target.email,''),a.action,a.details,a.created_at FROM admin_audit a JOIN users actor ON actor.subject=a.actor_subject JOIN users target ON target.subject=a.target_subject ORDER BY a.created_at DESC LIMIT 50`)
	if err != nil {
		s.logger.Error("read admin audit", "error", err)
		writeJSONError(w, http.StatusInternalServerError, "unable to load audit history")
		return
	}
	defer rows.Close()
	type entry struct {
		ID            int64           `json:"id"`
		ActorSubject  string          `json:"actorSubject"`
		ActorEmail    string          `json:"actorEmail"`
		TargetSubject string          `json:"targetSubject"`
		TargetEmail   string          `json:"targetEmail"`
		Action        string          `json:"action"`
		Details       json.RawMessage `json:"details"`
		CreatedAt     time.Time       `json:"createdAt"`
	}
	entries := make([]entry, 0)
	for rows.Next() {
		var item entry
		if err := rows.Scan(&item.ID, &item.ActorSubject, &item.ActorEmail, &item.TargetSubject, &item.TargetEmail, &item.Action, &item.Details, &item.CreatedAt); err != nil {
			writeJSONError(w, http.StatusInternalServerError, "unable to load audit history")
			return
		}
		entries = append(entries, item)
	}
	if err := rows.Err(); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "unable to load audit history")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"entries": entries})
}

func auditAction(oldAdmin, newAdmin, oldDisabled, newDisabled bool) string {
	switch {
	case !oldAdmin && newAdmin:
		return "administrator_granted"
	case oldAdmin && !newAdmin:
		return "administrator_removed"
	case !oldDisabled && newDisabled:
		return "account_disabled"
	case oldDisabled && !newDisabled:
		return "account_enabled"
	default:
		return "account_updated"
	}
}
