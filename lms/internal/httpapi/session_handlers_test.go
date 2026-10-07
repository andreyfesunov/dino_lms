package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/andreyfesunov/dino_lms/lms/internal/auth"
)

func TestSessionManagement(t *testing.T) {
	f := newFixture(t)
	admin := f.admin()
	f.request("POST", "/api/students", `{"login":"student","password":"student password"}`, admin, 200)
	student := f.request("POST", "/api/login", `{"login":"student","password":"student password"}`, nil, 200).Result().Cookies()[0]
	login := func() *http.Cookie {
		return f.request("POST", "/api/login", `{"login":"admin","password":"correct horse"}`, nil, 200).Result().Cookies()[0]
	}
	second, third := login(), login()
	list := func(cookie *http.Cookie) []sessionResponse {
		w := f.request("GET", "/api/me/sessions", "", cookie, 200)
		var response struct {
			Sessions []sessionResponse `json:"sessions"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
			t.Fatal(err)
		}
		return response.Sessions
	}
	f.request("GET", "/api/me/sessions", "", nil, 401)
	f.request("DELETE", "/api/me/sessions/missing", "", nil, 401)
	f.request("POST", "/api/me/sessions/revoke-others", "", nil, 401)

	// Expired rows must never be shown.
	actor, err := f.server.currentActor(httptestRequest(admin))
	if err != nil || actor == nil {
		t.Fatalf("actor: %v", err)
	}
	if err := f.server.Auth.PersistSession(context.Background(), actor.UserID, auth.NewSessionToken(), time.Now().Add(-time.Hour)); err != nil {
		t.Fatal(err)
	}
	sessions := list(admin)
	if len(sessions) != 3 {
		t.Fatalf("sessions = %+v", sessions)
	}
	currentCount := 0
	for _, item := range sessions {
		if item.Current {
			currentCount++
		}
	}
	if currentCount != 1 {
		t.Fatalf("current sessions = %d", currentCount)
	}

	// Even an admin cannot revoke or list another account's sessions.
	studentSessions := list(student)
	if len(studentSessions) != 1 {
		t.Fatalf("student sessions = %+v", studentSessions)
	}
	f.request("DELETE", "/api/me/sessions/"+studentSessions[0].ID, "", admin, 200)
	f.request("GET", "/api/me", "", student, 200)
	token, _ := decodeBase64Token(second.Value)
	f.request("DELETE", "/api/me/sessions/"+auth.HashToken(token), "", student, 200)
	f.request("GET", "/api/me", "", second, 200)
	f.request("DELETE", "/api/me/sessions/"+auth.HashToken(token), "", admin, 200)
	f.request("GET", "/api/me", "", second, 401)

	f.request("POST", "/api/me/sessions/revoke-others", "", admin, 200)
	f.request("GET", "/api/me", "", third, 401)
	f.request("GET", "/api/me", "", student, 200)
	sessions = list(admin)
	if len(sessions) != 1 || !sessions[0].Current {
		t.Fatalf("remaining sessions = %+v", sessions)
	}
	w := f.request("DELETE", "/api/me/sessions/"+sessions[0].ID, "", admin, 200)
	if len(w.Result().Cookies()) != 1 || w.Result().Cookies()[0].MaxAge != -1 {
		t.Fatal("current cookie not cleared")
	}
	f.request("GET", "/api/me", "", admin, 401)
}

func httptestRequest(cookie *http.Cookie) *http.Request {
	r, _ := http.NewRequest("GET", "http://localhost/api/me", nil)
	r.AddCookie(cookie)
	return r
}
