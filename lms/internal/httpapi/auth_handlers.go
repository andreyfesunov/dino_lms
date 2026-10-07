package httpapi

import (
	"encoding/base64"
	"net/http"
	"time"

	"github.com/andreyfesunov/dino_lms/lms/internal/auth"
	"github.com/andreyfesunov/dino_lms/lms/internal/kernel"
)

// base64RawURL encodes a token for cookie transport.
func base64RawURL(b []byte) string {
	return base64.RawURLEncoding.EncodeToString(b)
}

// decodeBase64Token decodes a cookie token.
func decodeBase64Token(value string) ([]byte, error) {
	return base64.RawURLEncoding.DecodeString(value)
}

// base64Token is the cookie encoder used by the session helpers.
func base64Token(token []byte) string { return base64RawURL(token) }

// bootstrapResponse feeds the client router: whether setup is needed and who
// is signed in.
type bootstrapResponse struct {
	HasAdmin bool          `json:"has_admin"`
	User     *userResponse `json:"user"`
}

type userResponse struct {
	ID          string  `json:"id"`
	Login       string  `json:"login"`
	Role        string  `json:"role"`
	Status      string  `json:"status"`
	FirstName   *string `json:"first_name"`
	LastName    *string `json:"last_name"`
	DisplayName string  `json:"display_name"`
	ShortName   string  `json:"short_name"`
}

func toUserResponse(u *auth.User) *userResponse {
	if u == nil {
		return nil
	}
	return &userResponse{
		ID:          u.ID.String(),
		Login:       u.Login,
		Role:        string(u.Role),
		Status:      string(u.Status),
		FirstName:   u.FirstName,
		LastName:    u.LastName,
		DisplayName: u.DisplayName(),
		ShortName:   u.ShortName(),
	}
}

// handleBootstrap answers GET /api/bootstrap.
func (s *Server) handleBootstrap(w http.ResponseWriter, r *http.Request) {
	hasAdmin, err := s.Auth.HasAdmin(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	_, user, err := s.currentUser(w, r)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, bootstrapResponse{HasAdmin: hasAdmin, User: toUserResponse(user)})
}

type credentialsRequest struct {
	Login     string  `json:"login"`
	Password  *string `json:"password"`
	FirstName *string `json:"first_name"`
	LastName  *string `json:"last_name"`
}

// handleSetup answers POST /api/setup (first admin) and starts a session.
func (s *Server) handleSetup(w http.ResponseWriter, r *http.Request) {
	var body credentialsRequest
	if err := decodeJSON(r, &body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"code": "bad_request"})
		return
	}
	if body.Password == nil || *body.Password == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"code": "bad_request"})
		return
	}
	result, err := s.Auth.BootstrapAdmin(r.Context(), auth.BootstrapAdminCommand{
		Login:     body.Login,
		Password:  body.Password,
		FirstName: body.FirstName,
		LastName:  body.LastName,
	})
	if err != nil {
		writeError(w, err)
		return
	}
	user, err := s.Auth.CurrentUser(r.Context(), kernel.NewActor(result.UserID, []kernel.Role{kernel.RoleAdmin}))
	if err != nil {
		writeError(w, err)
		return
	}
	if !s.startSession(w, r, result.UserID) {
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"user": toUserResponse(&user),
	})
}

// handleLogin answers POST /api/login and starts a session.
func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var body credentialsRequest
	if err := decodeJSON(r, &body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"code": "bad_request"})
		return
	}
	password := ""
	if body.Password != nil {
		password = *body.Password
	}
	result, err := s.Auth.Login(r.Context(), auth.LoginCommand{Login: body.Login, Password: password})
	if err != nil {
		writeError(w, err)
		return
	}
	if !s.startSession(w, r, result.User.ID) {
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"user": toUserResponse(&result.User)})
}

func (s *Server) startSession(w http.ResponseWriter, r *http.Request, userID kernel.UserID) bool {
	token := auth.NewSessionToken()
	expires := time.Now().Add(auth.SessionTTL)
	if err := s.Auth.PersistSession(r.Context(), userID, token, expires); err != nil {
		writeError(w, err)
		return false
	}
	setSessionCookie(w, token, expires)
	return true
}

// handleLogout answers POST /api/logout.
func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie(sessionCookieName)
	if err == nil && cookie.Value != "" {
		if token, err := decodeBase64Token(cookie.Value); err == nil {
			if err := s.Auth.DeleteSession(r.Context(), token); err != nil {
				writeError(w, err)
				return
			}
		}
	}
	clearSessionCookie(w)
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// handleMe answers GET /api/me.
func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	_, user, err := s.currentUser(w, r)
	if err != nil {
		writeError(w, err)
		return
	}
	if user == nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"code": "unauthorized"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"user": toUserResponse(user)})
}

type onboardingRequest struct {
	FirstName string `json:"first_name"`
	LastName  string `json:"last_name"`
}

// handleOnboarding answers POST /api/onboarding.
func (s *Server) handleOnboarding(w http.ResponseWriter, r *http.Request) {
	actor, _, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	var body onboardingRequest
	if err := decodeJSON(r, &body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"code": "bad_request"})
		return
	}
	user, err := s.Auth.CompleteOnboarding(r.Context(), *actor, auth.CompleteOnboardingCommand{
		FirstName: body.FirstName,
		LastName:  body.LastName,
	})
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"user": toUserResponse(&user)})
}

type profileRequest struct {
	FirstName       string `json:"first_name"`
	LastName        string `json:"last_name"`
	CurrentPassword string `json:"current_password"`
	NewPassword     string `json:"new_password"`
}

// handleProfileUpdate answers PUT /api/me/profile (names + optional password
// change).
func (s *Server) handleProfileUpdate(w http.ResponseWriter, r *http.Request) {
	actor, _, ok := s.requireOnboarded(w, r)
	if !ok {
		return
	}
	var body profileRequest
	if err := decodeJSON(r, &body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"code": "bad_request"})
		return
	}
	user, err := s.Auth.UpdateOwnProfile(r.Context(), *actor, auth.UpdateOwnProfileCommand{
		FirstName:       body.FirstName,
		LastName:        body.LastName,
		CurrentPassword: body.CurrentPassword,
		NewPassword:     body.NewPassword,
	})
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"user": toUserResponse(&user)})
}
