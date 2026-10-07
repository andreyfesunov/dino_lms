package httpapi

import (
	"log"
	"net/http"
)

// NewMux combines API, media and optional client routes.
func NewMux(server *Server) http.Handler {
	mux := http.NewServeMux()

	// Bootstrap and session lifecycle.
	mux.HandleFunc("GET /api/bootstrap", server.handleBootstrap)
	mux.HandleFunc("POST /api/setup", server.handleSetup)
	mux.HandleFunc("POST /api/login", server.handleLogin)
	mux.HandleFunc("POST /api/logout", server.handleLogout)

	// Own account.
	mux.HandleFunc("GET /api/me", server.handleMe)
	mux.HandleFunc("POST /api/onboarding", server.handleOnboarding)
	mux.HandleFunc("PUT /api/me/profile", server.handleProfileUpdate)
	mux.HandleFunc("GET /api/me/sessions", server.handleSessionsList)
	mux.HandleFunc("DELETE /api/me/sessions/{id}", server.handleSessionRevoke)
	mux.HandleFunc("POST /api/me/sessions/revoke-others", server.handleSessionsRevokeOthers)

	// Users administration.
	mux.HandleFunc("GET /api/users", server.handleUsersList)
	mux.HandleFunc("POST /api/users/invite", server.handleInvite)
	mux.HandleFunc("POST /api/users/bulk-delete", server.handleBulkDelete)
	mux.HandleFunc("POST /api/users/{id}", server.handleUserUpdate)
	mux.HandleFunc("POST /api/users/{id}/password", server.handleUserPassword)
	mux.HandleFunc("POST /api/students", server.handleStudentCreate)

	// Courses.
	mux.HandleFunc("GET /api/calls", server.handleCalls)
	mux.HandleFunc("GET /api/calls/teachers", server.handleCallTeachers)
	mux.HandleFunc("POST /api/calls/{id}", server.handleCallChange)
	mux.HandleFunc("GET /api/courses/{course}/{chapter}/{lesson}/calls/settings", server.handleCallSettings)
	mux.HandleFunc("PUT /api/courses/{course}/{chapter}/{lesson}/calls/settings", server.handleCallSettings)
	mux.HandleFunc("GET /api/courses/{course}/{chapter}/{lesson}/calls/slots", server.handleCallSlots)
	mux.HandleFunc("POST /api/courses/{course}/{chapter}/{lesson}/calls", server.handleCallBook)
	mux.HandleFunc("GET /api/courses", server.handleCoursesList)
	mux.HandleFunc("GET /api/courses/{course}/students", server.handleCourseStudents)
	mux.HandleFunc("GET /api/courses/{course}/students/{user}/chapters", server.handleStudentChaptersGet)
	mux.HandleFunc("POST /api/courses/{course}/students/{user}/chapters", server.handleStudentChapterAccess)
	mux.HandleFunc("GET /api/courses/{course}/{chapter}/{lesson}", server.handleLesson)
	mux.HandleFunc("POST /api/courses/{course}/{chapter}/{lesson}/progress", server.handleProgress)
	mux.HandleFunc("GET /api/courses/{course}", server.handleCourseDetail)

	// Course media (videos, images inside bundles).
	mux.HandleFunc("GET /media/courses/{course}/{chapter}/{media}", server.handleMedia)
	mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusNotFound, map[string]string{"code": "not_found"})
	})
	mux.HandleFunc("/media/", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusNotFound, map[string]string{"code": "not_found"})
	})

	// Static Angular client bundle.
	if server.Static != nil {
		static := server.Static
		mux.Handle("/", static)
	}

	return logRequests(mux)
}

func logRequests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		log.Printf("%s %s", r.Method, r.URL.Path)
		next.ServeHTTP(w, r)
	})
}
