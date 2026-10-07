package httpapi

import (
	"net/http"
	"strconv"

	"github.com/andreyfesunov/dino_lms/lms/internal/calls"
)

func callKey(r *http.Request) calls.Key {
	return calls.Key{CourseID: r.PathValue("course"), ChapterID: r.PathValue("chapter"), LessonID: r.PathValue("lesson")}
}
func (s *Server) handleCallSettings(w http.ResponseWriter, r *http.Request) {
	a, _, ok := s.requireOnboarded(w, r)
	if !ok {
		return
	}
	if r.Method == "PUT" {
		var in calls.Settings
		if decodeJSON(r, &in) != nil {
			writeJSON(w, 400, map[string]string{"code": "bad_request"})
			return
		}
		out, err := s.Calls.SaveSettings(r.Context(), *a, callKey(r), in)
		if err != nil {
			writeError(w, err)
			return
		}
		writeJSON(w, 200, out)
		return
	}
	out, err := s.Calls.Settings(r.Context(), *a, callKey(r))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, 200, out)
}
func (s *Server) handleCallTeachers(w http.ResponseWriter, r *http.Request) {
	a, _, ok := s.requireOnboarded(w, r)
	if !ok {
		return
	}
	out, err := s.Calls.Teachers(r.Context(), *a)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"teachers": out})
}
func (s *Server) handleCallSlots(w http.ResponseWriter, r *http.Request) {
	a, _, ok := s.requireOnboarded(w, r)
	if !ok {
		return
	}
	from, e1 := strconv.ParseInt(r.URL.Query().Get("from"), 10, 64)
	to, e2 := strconv.ParseInt(r.URL.Query().Get("to"), 10, 64)
	if e1 != nil || e2 != nil {
		writeJSON(w, 400, map[string]string{"code": "bad_request"})
		return
	}
	out, err := s.Calls.Slots(r.Context(), *a, callKey(r), from, to, r.URL.Query().Get("except"))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"slots": out})
}
func (s *Server) handleCalls(w http.ResponseWriter, r *http.Request) {
	a, _, ok := s.requireOnboarded(w, r)
	if !ok {
		return
	}
	out, err := s.Calls.List(r.Context(), *a)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"calls": out})
}
func (s *Server) handleCallBook(w http.ResponseWriter, r *http.Request) {
	a, _, ok := s.requireOnboarded(w, r)
	if !ok {
		return
	}
	var in struct {
		StartsAt int64 `json:"starts_at"`
	}
	if decodeJSON(r, &in) != nil {
		writeJSON(w, 400, map[string]string{"code": "bad_request"})
		return
	}
	out, err := s.Calls.Book(r.Context(), *a, callKey(r), in.StartsAt)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, 201, out)
}
func (s *Server) handleCallChange(w http.ResponseWriter, r *http.Request) {
	a, _, ok := s.requireOnboarded(w, r)
	if !ok {
		return
	}
	var in calls.Change
	if decodeJSON(r, &in) != nil {
		writeJSON(w, 400, map[string]string{"code": "bad_request"})
		return
	}
	out, err := s.Calls.Change(r.Context(), *a, r.PathValue("id"), in)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, 200, out)
}
