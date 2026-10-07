package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/andreyfesunov/dino_lms/lms/internal/auth"
	"github.com/andreyfesunov/dino_lms/lms/internal/courses"
	"github.com/andreyfesunov/dino_lms/lms/internal/db"
	"github.com/andreyfesunov/dino_lms/lms/internal/kernel"
)

type fixture struct {
	t       *testing.T
	server  *Server
	handler http.Handler
}

func newFixture(t *testing.T) *fixture {
	t.Helper()
	root := t.TempDir()
	pool, err := db.Open(context.Background(), filepath.Join(root, "nested", "dino.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = pool.Close() })
	dir := filepath.Join(root, "courses", "sample", "chapter")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	files := map[string]string{
		filepath.Join(dir, "intro.md"): "# Intro\n\nHello",
		filepath.Join(dir, "clip.mp4"): "0123456789",
		filepath.Join(dir, "..", "config.toml"): `id = "sample"
title = "Sample"
[[chapters]]
id = "chapter"
title = "Chapter"
lessons = [{ id = "intro", title = "Intro" }]
`,
	}
	for name, content := range files {
		if err := os.WriteFile(name, []byte(content), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	catalog := courses.OpenCatalog(filepath.Join(root, "courses"))
	s := &Server{
		Auth:    auth.NewAuthService(auth.NewSqliteUserRepository(pool), auth.NewSqliteSessionRepository(pool), auth.Argon2Hasher{}),
		Catalog: catalog,
		Courses: courses.NewCourseService(catalog, courses.NewSqliteCourseRepository(pool)),
	}
	return &fixture{t: t, server: s, handler: NewMux(s)}
}

func (f *fixture) request(method, path, body string, cookie *http.Cookie, status int) *httptest.ResponseRecorder {
	f.t.Helper()
	r := httptest.NewRequest(method, path, strings.NewReader(body))
	if cookie != nil {
		r.AddCookie(cookie)
	}
	w := httptest.NewRecorder()
	f.handler.ServeHTTP(w, r)
	if w.Code != status {
		f.t.Fatalf("%s %s: %d, want %d: %s", method, path, w.Code, status, w.Body.String())
	}
	return w
}

func (f *fixture) admin() *http.Cookie {
	f.t.Helper()
	w := f.request("POST", "/api/setup", `{"login":"admin","password":"correct horse"}`, nil, 200)
	cookie := w.Result().Cookies()[0]
	f.request("POST", "/api/onboarding", `{"first_name":"Admin","last_name":"User"}`, cookie, 200)
	return cookie
}

func TestBootstrapSessionAndOnboarding(t *testing.T) {
	f := newFixture(t)
	w := f.request("GET", "/api/bootstrap", "", nil, 200)
	if !strings.Contains(w.Body.String(), `"has_admin":false`) {
		t.Fatal(w.Body.String())
	}
	w = f.request("POST", "/api/setup", `{"login":"admin","password":"correct horse"}`, nil, 200)
	cookie := w.Result().Cookies()[0]
	if !cookie.HttpOnly || cookie.Path != "/" {
		t.Fatal("unsafe session cookie")
	}
	if !strings.Contains(w.Body.String(), `"status":"pending"`) {
		t.Fatal(w.Body.String())
	}
	f.request("GET", "/api/courses", "", cookie, 403)
	f.request("POST", "/api/setup", `{"login":"other","password":"correct horse"}`, nil, 409)
	f.request("POST", "/api/onboarding", `{"first_name":"Admin","last_name":"User"}`, cookie, 200)
	f.request("GET", "/api/courses", "", cookie, 200)
	f.request("POST", "/api/logout", "", cookie, 200)
	f.request("GET", "/api/me", "", cookie, 401)
	f.request("POST", "/api/login", `{"login":"admin","password":"wrong"}`, nil, 401)
	f.request("POST", "/api/login", `{"login":"admin","password":"correct horse"}`, nil, 200)
}

func TestCourseAccessMediaAndProgress(t *testing.T) {
	f := newFixture(t)
	admin := f.admin()
	w := f.request("POST", "/api/students", `{"login":"student","password":"student password"}`, admin, 200)
	var student struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &student); err != nil {
		t.Fatal(err)
	}
	w = f.request("POST", "/api/login", `{"login":"student","password":"student password"}`, nil, 200)
	cookie := w.Result().Cookies()[0]
	f.request("GET", "/media/courses/sample/chapter/clip.mp4", "", cookie, 403)
	f.request("POST", "/api/onboarding", `{"first_name":"Student","last_name":"User"}`, cookie, 200)
	f.request("GET", "/api/users", "", cookie, 403)
	f.request("GET", "/api/courses/sample/chapter/intro", "", cookie, 403)
	f.request("POST", "/api/courses/sample/chapter/intro/progress", `{"done":true}`, cookie, 403)
	f.request("GET", "/media/courses/sample/chapter/clip.mp4", "", cookie, 403)
	f.request("POST", "/api/courses/sample/students/"+student.ID+"/chapters", `{"chapter_id":"missing","open":true}`, admin, 404)
	f.request("POST", "/api/courses/sample/students/"+student.ID+"/chapters", `{"chapter_id":"chapter","open":true}`, admin, 200)
	w = f.request("GET", "/api/courses/sample/chapter/intro", "", cookie, 200)
	if !strings.Contains(w.Body.String(), `"videos":[]`) || !strings.Contains(w.Body.String(), `"youtube":[]`) {
		t.Fatal(w.Body.String())
	}
	w = f.request("POST", "/api/courses/sample/chapter/intro/progress", `{"done":true}`, cookie, 200)
	if !strings.Contains(w.Body.String(), `"progress":100`) {
		t.Fatal(w.Body.String())
	}
	f.request("POST", "/api/courses/sample/chapter/missing/progress", `{"done":true}`, cookie, 404)
	r := httptest.NewRequest("GET", "/media/courses/sample/chapter/clip.mp4", nil)
	r.AddCookie(cookie)
	r.Header.Set("Range", "bytes=2-5")
	w = httptest.NewRecorder()
	f.handler.ServeHTTP(w, r)
	if w.Code != 206 || w.Body.String() != "2345" {
		t.Fatalf("range: %d %s", w.Code, w.Body.String())
	}
	f.request("POST", "/api/courses/sample/students/"+student.ID+"/chapters", `{"chapter_id":"chapter","open":false}`, admin, 200)
	f.request("GET", "/media/courses/sample/chapter/clip.mp4", "", cookie, 403)
}

func TestPartialUserUpdatePreservesRoleAndAdmin(t *testing.T) {
	f := newFixture(t)
	cookie := f.admin()
	w := f.request("GET", "/api/me", "", cookie, 200)
	var me struct {
		User userResponse `json:"user"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &me); err != nil {
		t.Fatal(err)
	}
	w = f.request("POST", "/api/users/"+me.User.ID, `{"first_name":"Changed"}`, cookie, 200)
	if !strings.Contains(w.Body.String(), `"role":"admin"`) || !strings.Contains(w.Body.String(), `"status":"active"`) {
		t.Fatal(w.Body.String())
	}
	f.request("POST", "/api/users/"+me.User.ID, `{"role":"student"}`, cookie, 403)
	f.request("POST", "/api/users/bulk-delete", `{"ids":["`+me.User.ID+`"]}`, cookie, 409)
	f.request("POST", "/api/users/not-a-uuid", `{}`, cookie, 400)
	f.request("POST", "/api/users/"+kernel.NewUserID().String(), `{}`, cookie, 409)
}

func TestUserNamesCanBeClearedAndBulkDeletePrevalidates(t *testing.T) {
	f := newFixture(t)
	cookie := f.admin()
	w := f.request("POST", "/api/students", `{"login":"student","password":"student password"}`, cookie, 200)
	var student struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &student); err != nil {
		t.Fatal(err)
	}
	f.request("POST", "/api/users/"+student.ID, `{"first_name":"First","last_name":"Last"}`, cookie, 200)
	w = f.request("POST", "/api/users/"+student.ID, `{"first_name":null}`, cookie, 200)
	if !strings.Contains(w.Body.String(), `"first_name":null`) || !strings.Contains(w.Body.String(), `"last_name":"Last"`) {
		t.Fatal(w.Body.String())
	}
	f.request("POST", "/api/users/bulk-delete", `{"ids":["`+student.ID+`","invalid"]}`, cookie, 400)
	w = f.request("GET", "/api/users", "", cookie, 200)
	if !strings.Contains(w.Body.String(), student.ID) {
		t.Fatal("invalid batch partially deleted users")
	}
	f.request("POST", "/api/users/bulk-delete", `{"ids":["`+student.ID+`","`+student.ID+`"]}`, cookie, 200)
}

func TestProfilePasswordUpdateIsAtomic(t *testing.T) {
	f := newFixture(t)
	cookie := f.admin()
	f.request("PUT", "/api/me/profile", `{"first_name":"Changed","last_name":"Name","current_password":"wrong","new_password":"new password"}`, cookie, 401)
	w := f.request("GET", "/api/me", "", cookie, 200)
	if !strings.Contains(w.Body.String(), `"first_name":"Admin"`) {
		t.Fatal("failed password check changed profile: " + w.Body.String())
	}
	f.request("PUT", "/api/me/profile", `{"first_name":"Changed","last_name":"Name","current_password":"correct horse","new_password":"  новый пароль  "}`, cookie, 200)
	f.request("POST", "/api/login", `{"login":"admin","password":"correct horse"}`, nil, 401)
	f.request("POST", "/api/login", `{"login":"admin","password":"  новый пароль  "}`, nil, 200)
}

func TestInvalidSetupAndUnknownAPI(t *testing.T) {
	f := newFixture(t)
	f.request("POST", "/api/setup", `{"login":"admin"}`, nil, 400)
	f.request("POST", "/api/setup", `{"login":" ","password":"correct horse"}`, nil, 400)
	f.request("GET", "/api/unknown", "", nil, 404)
}
