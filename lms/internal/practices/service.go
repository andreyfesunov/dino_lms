// Package practices stores student practice submissions and review decisions.
package practices

import (
	"context"
	"database/sql"
	"errors"
	"net/url"
	"strings"
	"time"

	"github.com/andreyfesunov/dino_lms/lms/internal/kernel"
)

const (
	StatusSubmitted         = "submitted"
	StatusRevisionRequested = "revision_requested"
	StatusAccepted          = "accepted"
)

var (
	ErrForbidden = errors.New("forbidden")
	ErrNotFound  = errors.New("not_found")
	ErrConflict  = errors.New("conflict")
	ErrInvalid   = errors.New("bad_request")
)

type Key struct {
	CourseID  string
	ChapterID string
	LessonID  string
}

type Attempt struct {
	ID            string  `json:"id"`
	StudentID     string  `json:"student_id"`
	StudentName   string  `json:"student_name"`
	StudentLogin  string  `json:"student_login"`
	CourseID      string  `json:"course_id"`
	CourseTitle   string  `json:"course_title,omitempty"`
	ChapterID     string  `json:"chapter_id"`
	ChapterTitle  string  `json:"chapter_title,omitempty"`
	LessonID      string  `json:"lesson_id"`
	LessonTitle   string  `json:"lesson_title,omitempty"`
	AttemptNumber int     `json:"attempt_number"`
	RepositoryURL string  `json:"repository_url"`
	Report        string  `json:"report"`
	Message       string  `json:"message"`
	Status        string  `json:"status"`
	Feedback      string  `json:"feedback"`
	SubmittedAt   int64   `json:"submitted_at"`
	ReviewedBy    *string `json:"reviewed_by"`
	ReviewerName  *string `json:"reviewer_name"`
	ReviewedAt    *int64  `json:"reviewed_at"`
}

type Submission struct {
	RepositoryURL string `json:"repository_url"`
	Report        string `json:"report"`
	Message       string `json:"message"`
}

type Review struct {
	Decision string `json:"decision"`
	Feedback string `json:"feedback"`
}

type Service struct{ db *sql.DB }

type Student struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Login string `json:"login"`
}

func New(db *sql.DB) *Service { return &Service{db: db} }

func (s *Service) Students(ctx context.Context, courseID string) ([]Student, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT u.id,COALESCE(NULLIF(trim(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')),''),u.login),u.login
FROM course_access ca JOIN users u ON u.id=ca.user_id WHERE ca.course_id=? AND u.role='student' ORDER BY u.first_name,u.last_name,u.login`, courseID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []Student{}
	for rows.Next() {
		var item Student
		if err := rows.Scan(&item.ID, &item.Name, &item.Login); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Service) Completed(ctx context.Context, studentID, courseID string) ([]string, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT lesson_key FROM lesson_progress WHERE user_id=? AND course_id=?`, studentID, courseID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	keys := []string{}
	for rows.Next() {
		var key string
		if err := rows.Scan(&key); err != nil {
			return nil, err
		}
		keys = append(keys, key)
	}
	return keys, rows.Err()
}

func (s *Service) Submit(ctx context.Context, studentID string, key Key, in Submission) (Attempt, error) {
	parsed, err := url.ParseRequestURI(strings.TrimSpace(in.RepositoryURL))
	if err != nil || (parsed.Scheme != "https" && parsed.Scheme != "http") || parsed.Host == "" {
		return Attempt{}, ErrInvalid
	}
	in.RepositoryURL = strings.TrimSpace(in.RepositoryURL)
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return Attempt{}, err
	}
	defer tx.Rollback()

	var previousStatus string
	var previousNumber int
	err = tx.QueryRowContext(ctx, `SELECT status, attempt_number FROM practice_attempts
WHERE student_id=? AND course_id=? AND chapter_id=? AND lesson_id=?
ORDER BY attempt_number DESC LIMIT 1`, studentID, key.CourseID, key.ChapterID, key.LessonID).Scan(&previousStatus, &previousNumber)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return Attempt{}, err
	}
	if err == nil && previousStatus != StatusRevisionRequested {
		return Attempt{}, ErrConflict
	}
	attemptNumber := previousNumber + 1
	id := kernel.NewUserID().String()
	_, err = tx.ExecContext(ctx, `INSERT INTO practice_attempts
(id,student_id,course_id,chapter_id,lesson_id,attempt_number,repository_url,report,message,status,submitted_at)
VALUES(?,?,?,?,?,?,?,?,?,?,?)`, id, studentID, key.CourseID, key.ChapterID, key.LessonID, attemptNumber,
		in.RepositoryURL, in.Report, in.Message, StatusSubmitted, time.Now().Unix())
	if err != nil {
		return Attempt{}, err
	}
	if err := tx.Commit(); err != nil {
		return Attempt{}, err
	}
	return s.Get(ctx, id)
}

func (s *Service) Review(ctx context.Context, reviewerID, id string, in Review) (Attempt, error) {
	if in.Decision != StatusAccepted && in.Decision != StatusRevisionRequested {
		return Attempt{}, ErrInvalid
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return Attempt{}, err
	}
	defer tx.Rollback()

	var studentID, courseID, chapterID, lessonID, status string
	err = tx.QueryRowContext(ctx, `SELECT student_id,course_id,chapter_id,lesson_id,status FROM practice_attempts WHERE id=?`, id).
		Scan(&studentID, &courseID, &chapterID, &lessonID, &status)
	if errors.Is(err, sql.ErrNoRows) {
		return Attempt{}, ErrNotFound
	}
	if err != nil {
		return Attempt{}, err
	}
	if status != StatusSubmitted {
		return Attempt{}, ErrConflict
	}
	now := time.Now().Unix()
	result, err := tx.ExecContext(ctx, `UPDATE practice_attempts SET status=?, feedback=?, reviewed_by=?, reviewed_at=? WHERE id=? AND status=?`,
		in.Decision, strings.TrimSpace(in.Feedback), reviewerID, now, id, StatusSubmitted)
	if err != nil {
		return Attempt{}, err
	}
	changed, err := result.RowsAffected()
	if err != nil {
		return Attempt{}, err
	}
	if changed != 1 {
		return Attempt{}, ErrConflict
	}
	if in.Decision == StatusAccepted {
		_, err = tx.ExecContext(ctx, `INSERT INTO lesson_progress(user_id,course_id,lesson_key,completed_at)
VALUES(?,?,?,?) ON CONFLICT(user_id,course_id,lesson_key) DO NOTHING`, studentID, courseID, chapterID+"/"+lessonID, now)
		if err != nil {
			return Attempt{}, err
		}
	}
	if err := tx.Commit(); err != nil {
		return Attempt{}, err
	}
	return s.Get(ctx, id)
}

func (s *Service) Get(ctx context.Context, id string) (Attempt, error) {
	return scanAttempt(s.db.QueryRowContext(ctx, attemptSelect+` WHERE a.id=?`, id))
}

func (s *Service) List(ctx context.Context, studentID, courseID string) ([]Attempt, error) {
	query := attemptSelect
	args := []any{}
	conditions := []string{}
	if studentID != "" {
		conditions = append(conditions, "a.student_id=?")
		args = append(args, studentID)
	}
	if courseID != "" {
		conditions = append(conditions, "a.course_id=?")
		args = append(args, courseID)
	}
	if len(conditions) > 0 {
		query += " WHERE " + strings.Join(conditions, " AND ")
	}
	query += " ORDER BY a.submitted_at DESC, a.attempt_number DESC"
	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []Attempt{}
	for rows.Next() {
		item, err := scanAttempt(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

const attemptSelect = `SELECT a.id,a.student_id,COALESCE(NULLIF(trim(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')),''),u.login),u.login,
a.course_id,a.chapter_id,a.lesson_id,a.attempt_number,a.repository_url,a.report,a.message,a.status,a.feedback,a.submitted_at,
a.reviewed_by,ru.first_name || CASE WHEN ru.last_name IS NULL OR ru.last_name='' THEN '' ELSE ' ' || ru.last_name END,a.reviewed_at
FROM practice_attempts a JOIN users u ON u.id=a.student_id LEFT JOIN users ru ON ru.id=a.reviewed_by`

type scanner interface{ Scan(...any) error }

func scanAttempt(row scanner) (Attempt, error) {
	var item Attempt
	var reviewerID, reviewerName sql.NullString
	var reviewedAt sql.NullInt64
	err := row.Scan(&item.ID, &item.StudentID, &item.StudentName, &item.StudentLogin,
		&item.CourseID, &item.ChapterID, &item.LessonID, &item.AttemptNumber,
		&item.RepositoryURL, &item.Report, &item.Message, &item.Status, &item.Feedback, &item.SubmittedAt,
		&reviewerID, &reviewerName, &reviewedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return Attempt{}, ErrNotFound
	}
	if err != nil {
		return Attempt{}, err
	}
	if reviewerID.Valid {
		item.ReviewedBy = &reviewerID.String
	}
	if reviewerName.Valid {
		item.ReviewerName = &reviewerName.String
	}
	if reviewedAt.Valid {
		item.ReviewedAt = &reviewedAt.Int64
	}
	return item, nil
}
