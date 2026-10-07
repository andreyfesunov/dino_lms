package auth

import (
	"context"
	"fmt"
	"time"

	"github.com/andreyfesunov/dino_lms/lms/internal/kernel"
)

func (r *SqliteSessionRepository) ListValid(ctx context.Context, userID kernel.UserID, now int64) ([]SessionRecord, error) {
	rows, err := r.pool.QueryContext(ctx, `SELECT token_hash, expires_at, created_at, user_agent
FROM sessions WHERE user_id = ? AND expires_at > ? ORDER BY created_at DESC, token_hash`, userID.String(), now)
	if err != nil {
		return nil, fmt.Errorf("list sessions: %w", err)
	}
	defer rows.Close()
	result := make([]SessionRecord, 0)
	for rows.Next() {
		record := SessionRecord{UserID: userID}
		if err := rows.Scan(&record.TokenHash, &record.ExpiresAt, &record.CreatedAt, &record.UserAgent); err != nil {
			return nil, err
		}
		result = append(result, record)
	}
	return result, rows.Err()
}

func (r *SqliteSessionRepository) DeleteOwned(ctx context.Context, userID kernel.UserID, tokenHash string) error {
	_, err := r.pool.ExecContext(ctx, `DELETE FROM sessions WHERE user_id = ? AND token_hash = ?`, userID.String(), tokenHash)
	return err
}

func (r *SqliteSessionRepository) DeleteOthers(ctx context.Context, userID kernel.UserID, currentHash string) error {
	_, err := r.pool.ExecContext(ctx, `DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?`, userID.String(), currentHash)
	return err
}

// PersistBrowserSession stores browser details without storing the raw token.
func (s *AuthService) PersistBrowserSession(ctx context.Context, userID kernel.UserID, token []byte, expiresAt time.Time, userAgent string) error {
	if len(userAgent) > 1024 {
		userAgent = userAgent[:1024]
	}
	return s.sessions.Create(ctx, NewSession{
		TokenHash: HashToken(token), UserID: userID, ExpiresAt: expiresAt.Unix(),
		CreatedAt: UnixNow(), UserAgent: userAgent,
	})
}

func (s *AuthService) ListOwnSessions(ctx context.Context, actor kernel.Actor) ([]SessionRecord, error) {
	return s.sessions.ListValid(ctx, actor.UserID, UnixNow())
}

func (s *AuthService) RevokeOwnSession(ctx context.Context, actor kernel.Actor, id string) error {
	return s.sessions.DeleteOwned(ctx, actor.UserID, id)
}

func (s *AuthService) RevokeOtherSessions(ctx context.Context, actor kernel.Actor, currentToken []byte) error {
	return s.sessions.DeleteOthers(ctx, actor.UserID, HashToken(currentToken))
}
