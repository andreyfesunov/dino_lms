package courses

import (
	"context"
	"path/filepath"
	"strings"
	"testing"

	"github.com/andreyfesunov/dino_lms/lms/internal/db"
	"github.com/andreyfesunov/dino_lms/lms/internal/kernel"
)

func writeCourse(t *testing.T, root, id, chapters string) {
	t.Helper()
	dir := filepath.Join(root, id)
	if err := makeDirAll(filepath.Join(dir, "ch1")); err != nil {
		t.Fatal(err)
	}
	body := "id = \"" + id + "\"\ntitle = \"Course " + id + "\"\n\n[[chapters]]\nid = \"ch1\"\ntitle = \"Chapter 1\"\n" + chapters + "\n"
	if err := writeFile(filepath.Join(dir, "config.toml"), body); err != nil {
		t.Fatal(err)
	}
	if err := writeFile(filepath.Join(dir, "ch1", "intro.md"), "# intro"); err != nil {
		t.Fatal(err)
	}
	// Extra lesson files are harmless: config only references declared ids.
	if err := writeFile(filepath.Join(dir, "ch1", "second.md"), "# second"); err != nil {
		t.Fatal(err)
	}
}

func TestListsAndGetsCourses(t *testing.T) {
	root := t.TempDir()
	writeCourse(t, root, "b-course", "lessons = [{ id = \"intro\" }]")
	writeCourse(t, root, "a-course", "lessons = [{ id = \"intro\" }]")

	catalog := OpenCatalog(root)
	list := catalog.List()
	if len(list) != 2 {
		t.Fatalf("courses = %d", len(list))
	}
	if list[0].ID != "a-course" || list[1].ID != "b-course" {
		t.Fatalf("order = %s, %s", list[0].ID, list[1].ID)
	}
	if catalog.Get("b-course") == nil {
		t.Fatal("b-course must exist")
	}
	if catalog.Get("missing") != nil {
		t.Fatal("missing must not exist")
	}
	if total, ok := catalog.TotalLessons("b-course"); !ok || total != 1 {
		t.Fatalf("total lessons = %d, %v", total, ok)
	}
}

func TestSkipsInvalidBundles(t *testing.T) {
	root := t.TempDir()
	if err := makeDirAll(filepath.Join(root, "broken")); err != nil {
		t.Fatal(err)
	}
	if err := writeFile(filepath.Join(root, "broken", "config.toml"), "not = toml"); err != nil {
		t.Fatal(err)
	}

	catalog := OpenCatalog(root)
	if got := catalog.List(); len(got) != 0 {
		t.Fatalf("courses = %d, want 0", len(got))
	}
}

func TestTypedLessonsAndMarkdownCompatibility(t *testing.T) {
	root := t.TempDir()
	writeCourse(t, root, "sample", `lessons = [{id="intro",title="Article"},{id="consultation",title="Call",type="call"}]`)
	config, err := LoadCourseConfig(filepath.Join(root, "sample"))
	if err != nil {
		t.Fatal(err)
	}
	if config.Lesson("ch1", "intro").Kind() != "article" || config.Lesson("ch1", "consultation").Kind() != "call" {
		t.Fatal("wrong lesson types")
	}
	writeCourse(t, root, "unknown", `lessons = [{id="intro",type="unknown"}]`)
	if _, err = LoadCourseConfig(filepath.Join(root, "unknown")); err == nil {
		t.Fatal("unknown lesson type accepted")
	}
	writeCourse(t, root, "missing", `lessons = [{id="absent",type="article"}]`)
	if _, err = LoadCourseConfig(filepath.Join(root, "missing")); err == nil {
		t.Fatal("article without markdown accepted")
	}
}

func TestCatalogCacheInvalidation(t *testing.T) {
	root := t.TempDir()
	writeCourse(t, root, "a-course", "lessons = [{ id = \"intro\" }]")
	catalog := OpenCatalog(root)
	if got := catalog.List(); len(got) != 1 {
		t.Fatalf("courses = %d", len(got))
	}

	writeCourse(t, root, "b-course", "lessons = [{ id = \"intro\" }]")
	if got := catalog.List(); len(got) != 2 {
		t.Fatalf("after write courses = %d, want 2", len(got))
	}
}

func TestConfigValidationFailures(t *testing.T) {
	root := t.TempDir()

	// id mismatch with directory name
	writeCourse(t, root, "good", "lessons = [{ id = \"intro\" }]")
	mismatchDir := filepath.Join(root, "other")
	if err := makeDirAll(filepath.Join(mismatchDir, "ch1")); err != nil {
		t.Fatal(err)
	}
	if err := writeFile(filepath.Join(mismatchDir, "config.toml"),
		"id = \"good\"\ntitle = \"T\"\n\n[[chapters]]\nid = \"ch1\"\ntitle = \"C\"\nlessons = [{ id = \"intro\" }]\n"); err != nil {
		t.Fatal(err)
	}
	if _, err := LoadCourseConfig(mismatchDir); err == nil || !strings.Contains(err.Error(), "must match") {
		t.Fatalf("err = %v", err)
	}

	// missing lesson file
	missingDir := filepath.Join(root, "missing-file")
	if err := makeDirAll(filepath.Join(missingDir, "ch1")); err != nil {
		t.Fatal(err)
	}
	if err := writeFile(filepath.Join(missingDir, "config.toml"),
		"id = \"missing-file\"\ntitle = \"T\"\n\n[[chapters]]\nid = \"ch1\"\ntitle = \"C\"\nlessons = [{ id = \"nope\" }]\n"); err != nil {
		t.Fatal(err)
	}
	if _, err := LoadCourseConfig(missingDir); err == nil || !strings.Contains(err.Error(), "is missing") {
		t.Fatalf("err = %v", err)
	}

	// invalid slug
	slugDir := filepath.Join(root, "Bad_Slug")
	if err := makeDirAll(filepath.Join(slugDir, "ch1")); err != nil {
		t.Fatal(err)
	}
	if err := writeFile(filepath.Join(slugDir, "config.toml"),
		"id = \"Bad_Slug\"\ntitle = \"T\"\n\n[[chapters]]\nid = \"ch1\"\ntitle = \"C\"\nlessons = [{ id = \"intro\" }]\n"); err != nil {
		t.Fatal(err)
	}
	if _, err := LoadCourseConfig(slugDir); err == nil || !strings.Contains(err.Error(), "valid slug") {
		t.Fatalf("err = %v", err)
	}

	if !IsValidSlug("a-b-c-123") || IsValidSlug("-start") || IsValidSlug("end-") || IsValidSlug("a--b") || IsValidSlug("A") {
		t.Fatal("slug rules broken")
	}
}

func TestMarkdownDirectives(t *testing.T) {
	parsed, err := RenderLessonMarkdown("# Title\n\n{{ video: explain.mp4 }}\n\nText")
	if err != nil {
		t.Fatal(err)
	}
	if len(parsed.Videos) != 1 || parsed.Videos[0].File != "explain.mp4" {
		t.Fatalf("videos = %+v", parsed.Videos)
	}
	if len(parsed.Youtube) != 0 {
		t.Fatalf("youtube = %+v", parsed.Youtube)
	}
	if strings.Contains(parsed.HTML, "{{") {
		t.Fatal("directive must be stripped")
	}
	if !strings.Contains(parsed.HTML, "<h1") {
		t.Fatal("heading must render")
	}
}

func TestMarkdownYoutubeDirectiveWithID(t *testing.T) {
	parsed, err := RenderLessonMarkdown(
		"{{ youtube: https://youtu.be/dQw4w9WgXcQ | Python за 10 минут | Tech Channel }}")
	if err != nil {
		t.Fatal(err)
	}
	if len(parsed.Videos) != 0 || len(parsed.Youtube) != 1 {
		t.Fatalf("videos = %d, youtube = %d", len(parsed.Videos), len(parsed.Youtube))
	}
	link := parsed.Youtube[0]
	if link.VideoID == nil || *link.VideoID != "dQw4w9WgXcQ" {
		t.Fatalf("video id = %v", link.VideoID)
	}
	if link.Title != "Python за 10 минут" {
		t.Fatalf("title = %s", link.Title)
	}
	if link.Channel == nil || *link.Channel != "Tech Channel" {
		t.Fatalf("channel = %v", link.Channel)
	}
	if thumb := link.ThumbnailURL(); thumb == nil || *thumb != "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg" {
		t.Fatalf("thumbnail = %v", thumb)
	}
}

func TestMarkdownEscapesRawHTML(t *testing.T) {
	parsed, err := RenderLessonMarkdown("hello <script>alert(1)</script>")
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(parsed.HTML, "<script>") {
		t.Fatalf("raw script leaked: %s", parsed.HTML)
	}
	// Raw HTML blocks are dropped; assert nothing raw reaches the output.
	if !strings.Contains(parsed.HTML, "raw HTML omitted") {
		t.Fatalf("html must omit raw html: %s", parsed.HTML)
	}
}

func TestMarkdownUnknownDirectiveStaysLiteral(t *testing.T) {
	parsed, err := RenderLessonMarkdown("{{ unknown: x }}")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(parsed.HTML, "{{ unknown: x }}") {
		t.Fatalf("literal lost: %s", parsed.HTML)
	}
}

func TestYoutubeIDFromWatchURL(t *testing.T) {
	if id := YoutubeID("https://www.youtube.com/watch?v=abc123XYZ_-&t=30"); id == nil || *id != "abc123XYZ_-" {
		t.Fatalf("id = %v", id)
	}
	if id := YoutubeID("https://example.com/video"); id != nil {
		t.Fatalf("id = %v", id)
	}
}

func TestServiceProgressAndAccess(t *testing.T) {
	root := t.TempDir()
	writeCourse(t, root, "demo", "lessons = [{ id = \"intro\" }, { id = \"second\" }]")
	catalog := OpenCatalog(root)
	course := catalog.Get("demo")
	if course == nil {
		t.Fatal("demo course missing")
	}

	pool, err := db.Open(context.Background(), filepath.Join(t.TempDir(), "c.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = pool.Close() })
	repo := NewSqliteCourseRepository(pool)
	svc := NewCourseService(catalog, repo)
	ctx := context.Background()

	student := kernel.NewActor(kernel.NewUserID(), []kernel.Role{kernel.RoleStudent})
	admin := kernel.NewActor(kernel.NewUserID(), []kernel.Role{kernel.RoleAdmin})

	// open_by_default=false: student locked, admin open.
	chapter := course.Chapter("ch1")
	if state, err := svc.ChapterAccess(ctx, student, course, chapter); err != nil || state != ChapterLocked {
		t.Fatalf("state = %s, %v", state, err)
	}
	if state, err := svc.ChapterAccess(ctx, admin, course, chapter); err != nil || state != ChapterOpen {
		t.Fatalf("admin state = %s, %v", state, err)
	}

	// Register both accounts so the FK constraints on course_access hold.
	adminID := admin.UserID
	studentID := student.UserID
	if _, err := pool.Exec(`INSERT INTO users (id, login, password_hash, role, status, created_at)
VALUES (?, 'admin@a', NULL, 'admin', 'active', 0), (?, 'student@a', NULL, 'student', 'pending', 0)`,
		adminID.String(), studentID.String()); err != nil {
		t.Fatal(err)
	}

	// Grant with wildcard, then revoke.
	if err := svc.Grant(ctx, admin, student.UserID, "demo", []string{"*"}); err != nil {
		t.Fatal(err)
	}
	if state, err := svc.ChapterAccess(ctx, student, course, chapter); err != nil || state != ChapterOpen {
		t.Fatalf("granted state = %s, %v", state, err)
	}
	if err := svc.Revoke(ctx, admin, student.UserID, "demo"); err != nil {
		t.Fatal(err)
	}
	if err := svc.MarkLessonDone(ctx, student, "demo", "ch1", "intro"); err == nil {
		t.Fatal("revoked chapter must reject progress")
	}
	if err := svc.Grant(ctx, admin, student.UserID, "demo", []string{"ch1"}); err != nil {
		t.Fatal(err)
	}

	// Progress: one of two lessons done = 50%.
	if err := svc.MarkLessonDone(ctx, student, "demo", "ch1", "intro"); err != nil {
		t.Fatal(err)
	}
	completed, err := svc.CompletedLessons(ctx, student, "demo")
	if err != nil {
		t.Fatal(err)
	}
	if got := svc.CourseProgress(course, completed); got != 50 {
		t.Fatalf("progress = %d, want 50", got)
	}
	if got := svc.ChapterProgress(chapter, completed); got != 50 {
		t.Fatalf("chapter progress = %d, want 50", got)
	}

	// Neighbours.
	prev, next := svc.LessonNeighbours(course, "ch1", "intro")
	if prev != nil || next == nil || next.LessonID != "second" {
		t.Fatalf("neighbours = %+v, %+v", prev, next)
	}
	prev, next = svc.LessonNeighbours(course, "ch1", "second")
	if prev == nil || prev.LessonID != "intro" || next != nil {
		t.Fatalf("neighbours = %+v, %+v", prev, next)
	}

	// Student cannot grant.
	if err := svc.Grant(ctx, student, admin.UserID, "demo", []string{"*"}); err == nil {
		t.Fatal("student must not grant")
	}
}
