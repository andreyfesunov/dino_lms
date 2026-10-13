package httpapi

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestCourseAssignmentWithoutDefaultChapters(t *testing.T) {
	f := newFixture(t)
	admin := f.admin()
	w := f.request("POST", "/api/students", `{"login":"learner","password":"student password"}`, admin, 200)
	var student struct{ ID string }
	if err := json.Unmarshal(w.Body.Bytes(), &student); err != nil {
		t.Fatal(err)
	}
	w = f.request("POST", "/api/courses/sample/students/"+student.ID, "{}", admin, 200)
	if !strings.Contains(w.Body.String(), `"open_chapters":[]`) {
		t.Fatal(w.Body.String())
	}
	w = f.request("GET", "/api/courses/sample/students", "", admin, 200)
	if !strings.Contains(w.Body.String(), student.ID) {
		t.Fatal("assignment with no chapters must be retained", w.Body.String())
	}
}

func TestCourseAssignmentDefaultsOverridesAndRevocation(t *testing.T) {
	f := newFixture(t)
	admin := f.admin()
	config := `id="sample"
title="Sample"
[[chapters]]
id="chapter"
title="Default"
open_by_default=true
lessons=[{id="intro",title="Intro"}]
[[chapters]]
id="locked"
title="Locked"
lessons=[]
`
	if err := os.WriteFile(filepath.Join(f.server.Catalog.Root(), "sample", "config.toml"), []byte(config), 0600); err != nil {
		t.Fatal(err)
	}
	w := f.request("POST", "/api/students", `{"login":"learner","password":"student password"}`, admin, 200)
	var student struct{ ID string }
	if err := json.Unmarshal(w.Body.Bytes(), &student); err != nil {
		t.Fatal(err)
	}
	w = f.request("POST", "/api/login", `{"login":"learner","password":"student password"}`, nil, 200)
	cookie := w.Result().Cookies()[0]
	f.request("POST", "/api/onboarding", `{"first_name":"Test","last_name":"Student"}`, cookie, 200)
	assignment := "/api/courses/sample/students/" + student.ID
	assertCourses := func(want bool) {
		t.Helper()
		w := f.request("GET", "/api/courses", "", cookie, 200)
		if strings.Contains(w.Body.String(), `"id":"sample"`) != want {
			t.Fatal(w.Body.String())
		}
	}
	assertChapters := func(want string) {
		t.Helper()
		w := f.request("GET", assignment+"/chapters", "", admin, 200)
		if !strings.Contains(w.Body.String(), want) {
			t.Fatalf("access: %s, want %s", w.Body.String(), want)
		}
	}
	assertCourses(false)
	f.request("GET", "/api/courses/sample", "", cookie, 403)
	f.request("GET", "/api/courses/sample/chapter/intro", "", cookie, 403)
	f.request("GET", "/media/courses/sample/chapter/clip.mp4", "", cookie, 403)
	f.request("POST", assignment, "{}", cookie, 403)
	f.request("DELETE", assignment, "", cookie, 403)
	f.request("POST", assignment, "{}", admin, 200)
	assertCourses(true)
	assertChapters(`["chapter"]`)
	w = f.request("GET", "/api/courses/sample", "", cookie, 200)
	var detail courseDetailJSON
	if err := json.Unmarshal(w.Body.Bytes(), &detail); err != nil {
		t.Fatal(err)
	}
	if detail.Course.TotalChapters != 2 || detail.Chapters[0].State != "open" || detail.Chapters[1].State != "locked" {
		t.Fatal(w.Body.String())
	}
	f.request("POST", "/api/courses/sample/chapter/intro/progress", `{"done":true}`, cookie, 200)
	f.request("POST", assignment+"/chapters", `{"chapter_id":"chapter","open":false}`, admin, 200)
	assertChapters(`[]`)
	assertCourses(true)
	f.request("GET", "/api/courses/sample/chapter/intro", "", cookie, 403)
	f.request("GET", "/media/courses/sample/chapter/clip.mp4", "", cookie, 403)
	f.request("POST", assignment, "{}", admin, 200)
	assertChapters(`[]`)
	f.request("POST", assignment+"/chapters", `{"chapter_id":"locked","open":true}`, admin, 200)
	assertChapters(`["locked"]`)
	f.request("DELETE", assignment, "", admin, 200)
	assertCourses(false)
	f.request("GET", "/api/courses/sample", "", cookie, 403)
	f.request("POST", assignment, "{}", admin, 200)
	assertChapters(`["chapter"]`)
	w = f.request("GET", "/api/courses/sample/chapter/intro", "", cookie, 200)
	if !strings.Contains(w.Body.String(), `"done":true`) {
		t.Fatal("progress must survive revocation", w.Body.String())
	}
}
