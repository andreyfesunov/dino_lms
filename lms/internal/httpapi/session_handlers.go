package httpapi

import (
	"net/http"

	"github.com/andreyfesunov/dino_lms/lms/internal/auth"
)

type sessionResponse struct {
	ID        string `json:"id"`
	Current   bool   `json:"current"`
	CreatedAt int64  `json:"created_at"`
	ExpiresAt int64  `json:"expires_at"`
	UserAgent string `json:"user_agent"`
}

// These handlers only operate on the authenticated user's sessions.
func (s *Server) handleSessionsList(w http.ResponseWriter, r *http.Request) {
	actor, _, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	cookie, _ := r.Cookie(sessionCookieName)
	token, _ := decodeBase64Token(cookie.Value)
	records, err := s.Auth.ListOwnSessions(r.Context(), *actor)
	if err != nil {
		writeError(w, err)
		return
	}
	result := make([]sessionResponse, 0, len(records))
	for _, record := range records {
		result = append(result, sessionResponse{ID: record.TokenHash, Current: record.TokenHash == auth.HashToken(token), CreatedAt: record.CreatedAt, ExpiresAt: record.ExpiresAt, UserAgent: record.UserAgent})
	}
	writeJSON(w, http.StatusOK, map[string]any{"sessions": result})
}

func (s *Server) handleSessionRevoke(w http.ResponseWriter, r *http.Request) {
	actor, _, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	id := r.PathValue("id")
	if err := s.Auth.RevokeOwnSession(r.Context(), *actor, id); err != nil {
		writeError(w, err)
		return
	}
	cookie, _ := r.Cookie(sessionCookieName)
	token, _ := decodeBase64Token(cookie.Value)
	if id == auth.HashToken(token) {
		clearSessionCookie(w)
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) handleSessionsRevokeOthers(w http.ResponseWriter, r *http.Request) {
	actor, _, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	cookie, _ := r.Cookie(sessionCookieName)
	token, _ := decodeBase64Token(cookie.Value)
	if err := s.Auth.RevokeOtherSessions(r.Context(), *actor, token); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
