package httpapi

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/andreyfesunov/dino_lms/lms/internal/auth"
	"github.com/andreyfesunov/dino_lms/lms/internal/kernel"
)

type inviteRequest struct {
	Emails []string `json:"emails"`
}

type invitedAccount struct {
	ID                string `json:"id"`
	Login             string `json:"login"`
	TemporaryPassword string `json:"temporary_password"`
}

// handleUsersList answers GET /api/users?query=&status=.
func (s *Server) handleUsersList(w http.ResponseWriter, r *http.Request) {
	actor, _, ok := s.requirePermission(w, r, kernel.PermissionManageUsers)
	if !ok {
		return
	}
	cmd := auth.ListUsersCommand{}
	if query := strings.TrimSpace(r.URL.Query().Get("query")); query != "" {
		cmd.Query = &query
	}
	if status := r.URL.Query().Get("status"); status != "" {
		parsed, err := auth.ParseUserStatus(status)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"code": "bad_request"})
			return
		}
		cmd.Status = &parsed
	}
	users, err := s.Auth.ListUsers(r.Context(), *actor, cmd)
	if err != nil {
		writeError(w, err)
		return
	}
	out := make([]*userResponse, 0, len(users))
	for i := range users {
		out = append(out, toUserResponse(&users[i]))
	}
	writeJSON(w, http.StatusOK, map[string]any{"users": out})
}

// handleInvite answers POST /api/users/invite (spec 0002: temporary
// passwords are generated immediately and returned once).
func (s *Server) handleInvite(w http.ResponseWriter, r *http.Request) {
	actor, _, ok := s.requirePermission(w, r, kernel.PermissionManageUsers)
	if !ok {
		return
	}
	var body inviteRequest
	if err := decodeJSON(r, &body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"code": "bad_request"})
		return
	}
	result, err := s.Auth.InviteUsers(r.Context(), *actor, auth.InviteUsersCommand{Emails: body.Emails})
	if err != nil {
		writeError(w, err)
		return
	}
	created := make([]invitedAccount, 0, len(result.Created))
	for _, invited := range result.Created {
		created = append(created, invitedAccount{
			ID:                invited.UserID.String(),
			Login:             invited.Login,
			TemporaryPassword: invited.TemporaryPassword,
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"created": created,
		"skipped": result.Skipped,
	})
}

type updateUserRequest struct {
	FirstName json.RawMessage `json:"first_name"`
	LastName  json.RawMessage `json:"last_name"`
	Role      *string         `json:"role"`
	Status    *string         `json:"status"`
}

// handleUserUpdate answers POST /api/users/{id}.
func (s *Server) handleUserUpdate(w http.ResponseWriter, r *http.Request) {
	actor, _, ok := s.requirePermission(w, r, kernel.PermissionManageUsers)
	if !ok {
		return
	}
	userID, ok := parseUserID(w, r.PathValue("id"))
	if !ok {
		return
	}
	var body updateUserRequest
	if err := decodeJSON(r, &body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"code": "bad_request"})
		return
	}
	cmd := auth.UpdateUserCommand{UserID: userID}
	if body.Role != nil {
		role, err := kernel.ParseRole(*body.Role)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"code": "bad_request"})
			return
		}
		cmd.Role = role
	}
	if body.Status != nil {
		status, err := auth.ParseUserStatus(*body.Status)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"code": "bad_request"})
			return
		}
		cmd.Status = status
	}
	for _, field := range []struct {
		raw   json.RawMessage
		value **string
		clear *bool
	}{
		{body.FirstName, &cmd.FirstName, &cmd.ClearFirstName},
		{body.LastName, &cmd.LastName, &cmd.ClearLastName},
	} {
		if len(field.raw) == 0 {
			continue
		}
		if strings.TrimSpace(string(field.raw)) == "null" {
			*field.clear = true
			continue
		}
		var name string
		if err := json.Unmarshal(field.raw, &name); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"code": "bad_request"})
			return
		}
		name = strings.TrimSpace(name)
		*field.value = &name
	}
	user, err := s.Auth.UpdateUser(r.Context(), *actor, cmd)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"user": toUserResponse(&user)})
}

type passwordResponse struct {
	Login             string `json:"login"`
	TemporaryPassword string `json:"temporary_password"`
}

// handleUserPassword answers POST /api/users/{id}/password.
func (s *Server) handleUserPassword(w http.ResponseWriter, r *http.Request) {
	actor, _, ok := s.requirePermission(w, r, kernel.PermissionManageUsers)
	if !ok {
		return
	}
	userID, ok := parseUserID(w, r.PathValue("id"))
	if !ok {
		return
	}
	result, err := s.Auth.GenerateUserPassword(r.Context(), *actor, auth.GeneratePasswordCommand{UserID: userID})
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, passwordResponse{
		Login:             result.Login,
		TemporaryPassword: result.TemporaryPassword,
	})
}

type bulkDeleteRequest struct {
	IDs []string `json:"ids"`
}

// handleBulkDelete answers POST /api/users/bulk-delete. The acting admin is
// protected implicitly: their id fails with self_delete.
func (s *Server) handleBulkDelete(w http.ResponseWriter, r *http.Request) {
	actor, _, ok := s.requirePermission(w, r, kernel.PermissionManageUsers)
	if !ok {
		return
	}
	var body bulkDeleteRequest
	if err := decodeJSON(r, &body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"code": "bad_request"})
		return
	}
	ids := make([]kernel.UserID, 0, len(body.IDs))
	seen := map[kernel.UserID]bool{}
	for _, raw := range body.IDs {
		userID, valid := parseUserID(w, raw)
		if !valid {
			return
		}
		if userID == actor.UserID {
			writeJSON(w, http.StatusConflict, map[string]string{"code": auth.CodeSelfDelete})
			return
		}
		if seen[userID] {
			continue
		}
		if _, err := s.Auth.GetUser(r.Context(), *actor, userID); err != nil {
			writeError(w, err)
			return
		}
		seen[userID] = true
		ids = append(ids, userID)
	}
	deleted := 0
	for _, userID := range ids {
		if err := s.Auth.DeleteUser(r.Context(), *actor, auth.DeleteUserCommand{UserID: userID}); err != nil {
			writeError(w, err)
			return
		}
		deleted++
	}
	writeJSON(w, http.StatusOK, map[string]int{"deleted": deleted})
}

type createStudentRequest struct {
	Login    string  `json:"login"`
	Password *string `json:"password"`
}

// handleStudentCreate answers POST /api/students.
func (s *Server) handleStudentCreate(w http.ResponseWriter, r *http.Request) {
	actor, _, ok := s.requirePermission(w, r, kernel.PermissionManageUsers)
	if !ok {
		return
	}
	var body createStudentRequest
	if err := decodeJSON(r, &body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"code": "bad_request"})
		return
	}
	result, err := s.Auth.CreateStudent(r.Context(), *actor, auth.CreateStudentCommand{
		Login:    body.Login,
		Password: body.Password,
	})
	if err != nil {
		writeError(w, err)
		return
	}
	out := map[string]any{"id": result.UserID.String(), "login": result.Login}
	if result.TemporaryPassword != nil {
		out["temporary_password"] = *result.TemporaryPassword
	}
	writeJSON(w, http.StatusOK, out)
}

func parseUserID(w http.ResponseWriter, raw string) (kernel.UserID, bool) {
	id, err := kernel.ParseUserID(raw)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"code": "bad_request"})
		return kernel.UserID{}, false
	}
	return id, true
}
