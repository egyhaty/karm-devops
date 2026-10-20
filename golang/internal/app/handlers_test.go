package app

import (
	"net/http/httptest"
	"strings"
	"testing"
)

func TestDecodeJSONRejectsAmbiguousOrUnexpectedInput(t *testing.T) {
	tests := []struct {
		name        string
		contentType string
		body        string
		wantErr     bool
	}{
		{name: "valid", contentType: "application/json", body: `{"completed":true}`},
		{name: "wrong content type", contentType: "text/plain", body: `{"completed":true}`, wantErr: true},
		{name: "unknown field", contentType: "application/json", body: `{"completed":true,"admin":true}`, wantErr: true},
		{name: "multiple values", contentType: "application/json", body: `{"completed":true} {"completed":false}`, wantErr: true},
		{name: "oversized", contentType: "application/json", body: `{"value":"` + strings.Repeat("x", (16<<10)+1) + `"}`, wantErr: true},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			req := httptest.NewRequest("PUT", "/", strings.NewReader(test.body))
			req.Header.Set("Content-Type", test.contentType)
			var payload struct {
				Completed bool `json:"completed"`
			}
			err := decodeJSON(httptest.NewRecorder(), req, &payload)
			if (err != nil) != test.wantErr {
				t.Fatalf("decodeJSON() error = %v, wantErr %v", err, test.wantErr)
			}
		})
	}
}

func TestLessonIDPattern(t *testing.T) {
	for _, id := range []string{"lesson-01", "lesson-09", "lesson-13"} {
		if !lessonIDPattern.MatchString(id) {
			t.Errorf("expected %q to match", id)
		}
	}
	for _, id := range []string{"lesson-00", "lesson-14", "lesson-99", "lesson-1", "lesson-100", "lesson-01/other", "lesson-aa", "../lesson-01"} {
		if lessonIDPattern.MatchString(id) {
			t.Errorf("expected %q not to match", id)
		}
	}
}

func TestLoginReturnPathRejectsExternalAndUnexpectedDestinations(t *testing.T) {
	for _, value := range []string{"", "/", "https://example.com", "//example.com", "/admin.html?next=https://example.com", "/admin.html/", "/api/admin/users"} {
		if got := loginReturnPath(value); got != "/" {
			t.Errorf("loginReturnPath(%q) = %q", value, got)
		}
	}
	if got := loginReturnPath("/admin.html"); got != "/admin.html" {
		t.Errorf("admin return destination = %q", got)
	}
}
