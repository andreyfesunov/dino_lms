package courses

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"hash"
	"os"
	"path/filepath"
	"time"
)

// SyncLessonVersions compares the deployed course catalog with the previous
// snapshot in SQLite. The first run establishes a baseline without badges.
func SyncLessonVersions(ctx context.Context, catalog *Catalog, pool *sql.DB) (map[string]string, error) {
	lessons := make(map[string]string)
	for _, course := range catalog.List() {
		for ci := range course.Chapters {
			chapter := &course.Chapters[ci]
			for li := range chapter.Lessons {
				lesson := &chapter.Lessons[li]
				fingerprint, err := lessonFingerprint(catalog.Root(), course.ID, chapter.ID, lesson)
				if err != nil {
					return nil, fmt.Errorf("fingerprint lesson %s/%s/%s: %w", course.ID, chapter.ID, lesson.ID, err)
				}
				lessons[LessonKey(course.ID+"/"+chapter.ID, lesson.ID)] = fingerprint
			}
		}
	}

	tx, err := pool.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	var initialized int
	err = tx.QueryRowContext(ctx, `SELECT 1 FROM lesson_version_state WHERE id = 1`).Scan(&initialized)
	if err != nil && err != sql.ErrNoRows {
		return nil, err
	}
	if err == sql.ErrNoRows {
		for key, fingerprint := range lessons {
			courseID, chapterID, lessonID, err := splitLessonVersionKey(key)
			if err != nil {
				return nil, err
			}
			if _, err := tx.ExecContext(ctx, `
INSERT INTO lesson_versions (course_id, chapter_id, lesson_id, current_hash, previous_hash, change_type, changed_at)
VALUES (?, ?, ?, ?, NULL, '', 0)`, courseID, chapterID, lessonID, fingerprint); err != nil {
				return nil, err
			}
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO lesson_version_state (id) VALUES (1)`); err != nil {
			return nil, err
		}
		if err := tx.Commit(); err != nil {
			return nil, err
		}
		return map[string]string{}, nil
	}

	type storedVersion struct {
		key         string
		fingerprint string
		changeType  string
	}
	rows, err := tx.QueryContext(ctx, `
SELECT course_id, chapter_id, lesson_id, current_hash, change_type
FROM lesson_versions`)
	if err != nil {
		return nil, err
	}
	stored := make(map[string]storedVersion)
	for rows.Next() {
		var courseID, chapterID, lessonID string
		var version storedVersion
		if err := rows.Scan(&courseID, &chapterID, &lessonID, &version.fingerprint, &version.changeType); err != nil {
			rows.Close()
			return nil, err
		}
		version.key = LessonKey(courseID+"/"+chapterID, lessonID)
		stored[version.key] = version
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return nil, err
	}
	if err := rows.Close(); err != nil {
		return nil, err
	}

	contentChanged := len(stored) != len(lessons)
	if !contentChanged {
		for key, fingerprint := range lessons {
			previous, exists := stored[key]
			if !exists || previous.fingerprint != fingerprint {
				contentChanged = true
				break
			}
		}
	}
	if contentChanged {
		// Badges describe only the delta from the immediately previous course
		// version. An unchanged process restart leaves the current release's
		// badges intact; any new course delta replaces them.
		if _, err := tx.ExecContext(ctx, `UPDATE lesson_versions SET change_type = '', changed_at = 0`); err != nil {
			return nil, err
		}
	}

	now := time.Now().Unix()
	changes := make(map[string]string)
	for key, fingerprint := range lessons {
		courseID, chapterID, lessonID, err := splitLessonVersionKey(key)
		if err != nil {
			return nil, err
		}
		previous, exists := stored[key]
		if !exists {
			if _, err := tx.ExecContext(ctx, `
INSERT INTO lesson_versions (course_id, chapter_id, lesson_id, current_hash, previous_hash, change_type, changed_at)
VALUES (?, ?, ?, ?, NULL, 'new', ?)`, courseID, chapterID, lessonID, fingerprint, now); err != nil {
				return nil, err
			}
			changes[key] = "new"
			continue
		}
		if previous.fingerprint != fingerprint {
			if _, err := tx.ExecContext(ctx, `
UPDATE lesson_versions
SET previous_hash = current_hash, current_hash = ?, change_type = 'updated', changed_at = ?
WHERE course_id = ? AND chapter_id = ? AND lesson_id = ?`, fingerprint, now, courseID, chapterID, lessonID); err != nil {
				return nil, err
			}
			changes[key] = "updated"
		} else if !contentChanged && previous.changeType != "" {
			changes[key] = previous.changeType
		}
		delete(stored, key)
	}

	// Remove deleted lessons so a lesson added again in a later deployment is
	// classified as new.
	for key := range stored {
		courseID, chapterID, lessonID, err := splitLessonVersionKey(key)
		if err != nil {
			return nil, err
		}
		if _, err := tx.ExecContext(ctx, `DELETE FROM lesson_versions WHERE course_id = ? AND chapter_id = ? AND lesson_id = ?`, courseID, chapterID, lessonID); err != nil {
			return nil, err
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return changes, nil
}

func lessonFingerprint(root, courseID, chapterID string, lesson *LessonConfig) (string, error) {
	metadata, err := json.Marshal(lesson)
	if err != nil {
		return "", err
	}
	h := sha256.New()
	writeFingerprintPart(h, metadata)

	if lesson.Kind() != "call" {
		body, err := os.ReadFile(filepath.Join(root, courseID, chapterID, lesson.ID+".md"))
		if err != nil {
			return "", err
		}
		writeFingerprintPart(h, body)
	}
	for _, attachment := range lesson.Attachments {
		writeFingerprintPart(h, []byte(attachment))
		body, err := os.ReadFile(filepath.Join(root, courseID, chapterID, attachment))
		if err != nil {
			return "", err
		}
		writeFingerprintPart(h, body)
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

func writeFingerprintPart(h hash.Hash, value []byte) {
	var length [8]byte
	n := uint64(len(value))
	for i := len(length) - 1; i >= 0; i-- {
		length[i] = byte(n)
		n >>= 8
	}
	_, _ = h.Write(length[:])
	_, _ = h.Write(value)
}

func splitLessonVersionKey(key string) (courseID, chapterID, lessonID string, err error) {
	for i := 0; i < len(key); i++ {
		if key[i] == '/' {
			courseChapter := key[:i]
			for j := len(courseChapter) - 1; j >= 0; j-- {
				if courseChapter[j] == '/' {
					return courseChapter[:j], courseChapter[j+1:], key[i+1:], nil
				}
			}
		}
	}
	return "", "", "", fmt.Errorf("invalid lesson version key %q", key)
}
