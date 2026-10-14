package httpapi

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/andreyfesunov/dino_lms/lms/internal/practices"
)

func TestPracticeSubmissionReviewAndProgress(t *testing.T) {
	f := newFixture(t)
	admin := f.admin()
	created := f.request("POST", "/api/students", `{"login":"practice-student","password":"student password"}`, admin, http.StatusOK)
	var student struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(created.Body.Bytes(), &student); err != nil {
		t.Fatal(err)
	}
	f.request("POST", "/api/courses/practice-course/students/"+student.ID, `{}`, admin, http.StatusOK)
	login := f.request("POST", "/api/login", `{"login":"practice-student","password":"student password"}`, nil, http.StatusOK)
	studentCookie := login.Result().Cookies()[0]
	f.request("POST", "/api/onboarding", `{"first_name":"Practice","last_name":"Student"}`, studentCookie, http.StatusOK)

	lesson := f.request("GET", "/api/courses/practice-course/chapter/assignment", "", studentCookie, http.StatusOK)
	if !strings.Contains(lesson.Body.String(), `"type":"practice"`) || !strings.Contains(lesson.Body.String(), `"file":"brief.pdf"`) {
		t.Fatalf("practice lesson or material missing: %s", lesson.Body.String())
	}
	media := f.request("GET", "/media/courses/practice-course/chapter/brief.pdf", "", studentCookie, http.StatusOK)
	if media.Body.String() != "practice resource" {
		t.Fatalf("material contents: %q", media.Body.String())
	}
	f.request("POST", "/api/courses/practice-course/chapter/assignment/progress", `{"done":true}`, studentCookie, http.StatusForbidden)
	f.request("POST", "/api/courses/practice-course/chapter/assignment/practice/attempts", `{"repository_url":"ftp://example.com/project"}`, studentCookie, http.StatusBadRequest)
	f.request("POST", "/api/courses/practice-course/chapter/assignment/practice/attempts", `{"repository_url":"https://example.com/project"}`, nil, http.StatusUnauthorized)

	first := f.request("POST", "/api/courses/practice-course/chapter/assignment/practice/attempts", `{"repository_url":"https://example.com/project","message":"Here it is"}`, studentCookie, http.StatusCreated)
	var attempt1 practices.Attempt
	if err := json.Unmarshal(first.Body.Bytes(), &attempt1); err != nil {
		t.Fatal(err)
	}
	studentList := f.request("GET", "/api/courses/practice-course/chapter/assignment/practice", "", studentCookie, http.StatusOK)
	if !strings.Contains(studentList.Body.String(), `"can_submit":false`) || !strings.Contains(studentList.Body.String(), attempt1.ID) {
		t.Fatal(studentList.Body.String())
	}
	f.request("POST", "/api/courses/practice-course/chapter/assignment/practice/attempts", `{"repository_url":"https://example.com/again"}`, studentCookie, http.StatusConflict)
	f.request("GET", "/api/practices?course_id=practice-course", "", studentCookie, http.StatusForbidden)
	f.request("POST", "/api/practice-attempts/"+attempt1.ID+"/review", `{"decision":"accepted"}`, studentCookie, http.StatusForbidden)

	dashboard := f.request("GET", "/api/practices?course_id=practice-course", "", admin, http.StatusOK)
	if !strings.Contains(dashboard.Body.String(), `"pending":1`) || !strings.Contains(dashboard.Body.String(), student.ID) {
		t.Fatal(dashboard.Body.String())
	}
	f.request("POST", "/api/practice-attempts/"+attempt1.ID+"/review", `{"decision":"revision_requested","feedback":"Add a mobile layout"}`, admin, http.StatusOK)
	second := f.request("POST", "/api/courses/practice-course/chapter/assignment/practice/attempts", `{"repository_url":"https://example.com/project-v2","report":"Updated the mobile layout"}`, studentCookie, http.StatusCreated)
	var attempt2 practices.Attempt
	if err := json.Unmarshal(second.Body.Bytes(), &attempt2); err != nil {
		t.Fatal(err)
	}
	if attempt2.AttemptNumber != 2 {
		t.Fatalf("attempt number = %d", attempt2.AttemptNumber)
	}
	f.request("POST", "/api/practice-attempts/"+attempt2.ID+"/review", `{"decision":"accepted"}`, admin, http.StatusOK)
	f.request("POST", "/api/practice-attempts/"+attempt2.ID+"/review", `{"decision":"revision_requested"}`, admin, http.StatusConflict)

	progress := f.request("GET", "/api/courses/practice-course", "", studentCookie, http.StatusOK)
	if !strings.Contains(progress.Body.String(), `"progress":100`) {
		t.Fatalf("accepted practice did not complete: %s", progress.Body.String())
	}
	history := f.request("GET", "/api/practices/mine", "", studentCookie, http.StatusOK)
	if !strings.Contains(history.Body.String(), `"attempt_number":1`) || !strings.Contains(history.Body.String(), `"attempt_number":2`) || !strings.Contains(history.Body.String(), "Add a mobile layout") {
		t.Fatalf("attempt history missing: %s", history.Body.String())
	}
}

func TestPracticeDashboardAllowsTeachers(t *testing.T) {
	f := newFixture(t)
	admin := f.admin()
	created := f.request("POST", "/api/students", `{"login":"teacher-target","password":"student password"}`, admin, http.StatusOK)
	var user struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(created.Body.Bytes(), &user); err != nil {
		t.Fatal(err)
	}
	f.request("POST", "/api/users/"+user.ID, `{"role":"teacher"}`, admin, http.StatusOK)
	login := f.request("POST", "/api/login", `{"login":"teacher-target","password":"student password"}`, nil, http.StatusOK)
	teacher := login.Result().Cookies()[0]
	f.request("POST", "/api/onboarding", `{"first_name":"Test","last_name":"Teacher"}`, teacher, http.StatusOK)
	f.request("GET", "/api/practices?course_id=practice-course", "", teacher, http.StatusOK)
}
