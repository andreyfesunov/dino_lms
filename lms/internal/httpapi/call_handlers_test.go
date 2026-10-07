package httpapi

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/andreyfesunov/dino_lms/lms/internal/calls"
)

func TestCallAPIAuthenticationPermissionsAndConflicts(t *testing.T) {
	f := newFixture(t)
	admin := f.admin()
	dir := filepath.Join(f.server.Catalog.Root(), "call-course")
	if err := os.MkdirAll(dir, 0700); err != nil {
		t.Fatal(err)
	}
	raw := `id="call-course"
title="Calls"
[[chapters]]
id="chapter"
title="Chapter"
open_by_default=true
lessons=[{id="call",title="Call",type="call"}]
`
	if err := os.WriteFile(filepath.Join(dir, "config.toml"), []byte(raw), 0600); err != nil {
		t.Fatal(err)
	}
	create := func(login, role string) (string, *http.Cookie) {
		w := f.request("POST", "/api/students", fmt.Sprintf(`{"login":%q,"password":"call password"}`, login), admin, 200)
		var out struct {
			ID string `json:"id"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
			t.Fatal(err)
		}
		f.request("POST", "/api/users/"+out.ID, fmt.Sprintf(`{"role":%q,"status":"active","first_name":"Test","last_name":"User"}`, role), admin, 200)
		w = f.request("POST", "/api/login", fmt.Sprintf(`{"login":%q,"password":"call password"}`, login), nil, 200)
		return out.ID, w.Result().Cookies()[0]
	}
	teacherID, teacher := create("teacher", "teacher")
	studentID, student := create("student", "student")
	_, other := create("other", "student")
	path := "/api/courses/call-course/chapter/call/calls"
	f.request("GET", "/api/calls", "", nil, 401)
	f.request("GET", "/api/calls/teachers", "", student, 403)
	f.request("GET", "/api/calls/teachers", "", admin, 200)
	f.request("PUT", path+"/settings", `{"duration_min":30,"timezone":"UTC"}`, student, 403)
	start := time.Now().Add(24 * time.Hour).Truncate(time.Minute).Unix()
	settings := fmt.Sprintf(`{"teacher_id":%q,"duration_min":30,"timezone":"UTC","version":0,"windows":[{"starts_at":%d,"ends_at":%d}]}`, teacherID, start, start+3600)
	f.request("PUT", path+"/settings", settings, admin, 200)
	f.request("PUT", path+"/settings", settings, admin, 409)
	f.request("GET", path+fmt.Sprintf("/slots?from=%d&to=%d", start, start+86400), "", student, 200)
	f.request("GET", path+"/slots?from=invalid&to=invalid", "", student, 400)
	w := f.request("POST", path, fmt.Sprintf(`{"starts_at":%d}`, start), student, 201)
	var c calls.Call
	if err := json.Unmarshal(w.Body.Bytes(), &c); err != nil {
		t.Fatal(err)
	}
	f.request("POST", path, fmt.Sprintf(`{"starts_at":%d}`, start), other, 409)
	f.request("POST", "/api/calls/"+c.ID, `{"action":"cancel","version":1}`, other, 403)
	f.request("POST", "/api/courses/call-course/chapter/call/progress", `{"done":true}`, student, 403)
	// Lifecycle errors have a stable conflict response instead of exposing SQL errors.
	f.request("POST", "/api/users/"+teacherID, `{"role":"student"}`, admin, 409)
	f.request("POST", "/api/users/bulk-delete", fmt.Sprintf(`{"ids":[%q]}`, studentID), admin, 409)
	f.request("POST", "/api/calls/"+c.ID, `{"action":"link","version":1,"meeting_url":"https://meet.example/call"}`, teacher, 200)
	f.request("POST", "/api/calls/"+c.ID, `{"action":"cancel","version":1}`, student, 409)
	f.request("POST", "/api/calls/"+c.ID, `{"action":"cancel","version":2}`, student, 200)
	f.request("POST", path, fmt.Sprintf(`{"starts_at":%d}`, start), student, 201)
}
