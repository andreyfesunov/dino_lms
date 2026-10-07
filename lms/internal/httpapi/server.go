// Package httpapi exposes the JSON API, media routes and the static client
// bundle.
package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/andreyfesunov/dino_lms/lms/internal/auth"
	"github.com/andreyfesunov/dino_lms/lms/internal/calls"
	"github.com/andreyfesunov/dino_lms/lms/internal/courses"
	"github.com/andreyfesunov/dino_lms/lms/internal/kernel"
)

// Server carries the wired services for the HTTP handlers.
type Server struct {
	Calls   *calls.Service
	Auth    *auth.AuthService
	Courses *courses.CourseService
	Catalog *courses.Catalog
	Static  http.Handler // client bundle (Angular dist); optional in dev
}

// The browser sends sid automatically; client JavaScript cannot read this HttpOnly cookie.
const (
	sessionCookieName = "sid"
	sessionCookiePath = "/"
)

// writeJSON sends a JSON body with the status code.
func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if payload != nil {
		_ = json.NewEncoder(w).Encode(payload)
	}
}

// writeError maps domain errors to `{code}` JSON bodies and status codes
// that the UI translates via fluent keys.
func writeError(w http.ResponseWriter, err error) {
	var authErr *auth.AuthError
	var coursesErr *courses.CoursesError
	var callErr *calls.Error

	switch {
	case strings.Contains(err.Error(), "calls_user_busy"):
		writeJSON(w, http.StatusConflict, map[string]string{"code": "calls_user_busy"})
	case errors.As(err, &callErr):
		status := http.StatusBadRequest
		switch callErr.Code {
		case "forbidden":
			status = http.StatusForbidden
		case "not_found":
			status = http.StatusNotFound
		case "conflict", "calls_teacher_busy", "calls_user_busy":
			status = http.StatusConflict
		}
		writeJSON(w, status, map[string]string{"code": callErr.Code})
	case errors.As(err, &authErr):
		status := http.StatusBadRequest
		switch authErr.Code {
		case auth.CodeInvalidCredentials:
			status = http.StatusUnauthorized
		case auth.CodeForbidden:
			status = http.StatusForbidden
		case auth.CodeAdminExists, auth.CodeSelfDelete, auth.CodeUserNotFound:
			status = http.StatusConflict
		}
		writeJSON(w, status, map[string]string{"code": authErr.Code})
	case errors.As(err, &coursesErr):
		status := http.StatusBadRequest
		switch coursesErr.Code {
		case courses.CodeCourseNotFound, courses.CodeChapterNotFound, courses.CodeLessonNotFound:
			status = http.StatusNotFound
		case courses.CodeForbidden, courses.CodeChapterLocked:
			status = http.StatusForbidden
		case courses.CodeStorage:
			status = http.StatusInternalServerError
		}
		writeJSON(w, status, map[string]string{"code": coursesErr.Code})
	default:
		writeJSON(w, http.StatusInternalServerError, map[string]string{"code": "internal"})
	}
}

// decodeJSON parses a JSON request body into dst.
func decodeJSON(r *http.Request, dst any) error {
	defer r.Body.Close()
	dec := json.NewDecoder(r.Body)
	return dec.Decode(dst)
}

// setSessionCookie issues the session cookie for a fresh token.
func setSessionCookie(w http.ResponseWriter, token []byte, expires time.Time) {
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    base64Token(token),
		Path:     sessionCookiePath,
		Expires:  expires,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})
}

// clearSessionCookie expires the session cookie.
func clearSessionCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    "",
		Path:     sessionCookiePath,
		Expires:  time.Unix(0, 0),
		MaxAge:   -1,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})
}

// currentActor resolves the actor from the session cookie.
func (s *Server) currentActor(r *http.Request) (*kernel.Actor, error) {
	cookie, err := r.Cookie(sessionCookieName)
	if err != nil || cookie.Value == "" {
		return nil, nil
	}
	token, err := decodeBase64Token(cookie.Value)
	if err != nil {
		return nil, nil
	}
	return s.Auth.ActorFromTokenHash(r.Context(), token)
}

// currentUser returns actor + user or (nil, nil) when signed out.
func (s *Server) currentUser(w http.ResponseWriter, r *http.Request) (*kernel.Actor, *auth.User, error) {
	actor, err := s.currentActor(r)
	if err != nil || actor == nil {
		return nil, nil, err
	}
	user, err := s.Auth.CurrentUser(r.Context(), *actor)
	if err != nil {
		if ae, ok := err.(*auth.AuthError); ok && ae.Code == auth.CodeSessionUserMissing {
			return nil, nil, nil
		}
		return nil, nil, err
	}
	return actor, &user, nil
}

// requireUser writes 401 and returns nil when signed out.
func (s *Server) requireUser(w http.ResponseWriter, r *http.Request) (*kernel.Actor, *auth.User, bool) {
	actor, user, err := s.currentUser(w, r)
	if err != nil {
		writeError(w, err)
		return nil, nil, false
	}
	if actor == nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"code": "unauthorized"})
		return nil, nil, false
	}
	return actor, user, true
}

// requireOnboarded keeps pending accounts out of course and management endpoints.
func (s *Server) requireOnboarded(w http.ResponseWriter, r *http.Request) (*kernel.Actor, *auth.User, bool) {
	actor, user, ok := s.requireUser(w, r)
	if !ok {
		return nil, nil, false
	}
	if user.NeedsOnboarding() {
		writeJSON(w, http.StatusForbidden, map[string]string{"code": "onboarding_required"})
		return nil, nil, false
	}
	return actor, user, true
}

// requirePermission checks the RBAC permission via the auth service.
func (s *Server) requirePermission(w http.ResponseWriter, r *http.Request, permission kernel.Permission) (*kernel.Actor, *auth.User, bool) {
	actor, user, ok := s.requireOnboarded(w, r)
	if !ok {
		return nil, nil, false
	}
	if !s.Auth.Permits(*actor, permission) {
		writeJSON(w, http.StatusForbidden, map[string]string{"code": "forbidden"})
		return nil, nil, false
	}
	return actor, user, true
}
