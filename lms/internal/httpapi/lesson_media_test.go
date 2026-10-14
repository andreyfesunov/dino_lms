package httpapi

import (
	"encoding/json"
	"os"
	"strings"
	"testing"

	"github.com/andreyfesunov/dino_lms/lms/internal/courses"
)

func TestLessonMediaSourceOrder(t *testing.T) {
	f := newFixture(t)
	admin := f.admin()
	source := "# Intro\n\nBefore\n\n{{ video: clip.mp4 }}\n\nBetween\n\n{{ youtube: https://youtu.be/dQw4w9WgXcQ | Watch }}\n\nAfter\n\n{{ video: clip.mp4 }}\n\nEnd"
	if err := os.WriteFile(f.server.Catalog.LessonFile("sample", "chapter", "intro"), []byte(source), 0600); err != nil {
		t.Fatal(err)
	}
	w := f.request("GET", "/api/courses/sample/chapter/intro", "", admin, 200)
	var lesson struct {
		Blocks  []courses.LessonBlock `json:"blocks"`
		Videos  []mediaVideo          `json:"videos"`
		Youtube []mediaYoutube        `json:"youtube"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &lesson); err != nil {
		t.Fatal(err)
	}
	want := []string{"html", "video", "html", "youtube", "html", "video", "html"}
	if len(lesson.Blocks) != len(want) {
		t.Fatalf("blocks = %+v", lesson.Blocks)
	}
	for i, kind := range want {
		if lesson.Blocks[i].Type != kind {
			t.Fatalf("block %d = %+v", i, lesson.Blocks[i])
		}
	}
	for i, text := range []string{"Before", "Between", "After", "End"} {
		if !strings.Contains(lesson.Blocks[i*2].HTML, text) {
			t.Fatalf("text out of order: %+v", lesson.Blocks)
		}
	}
	if lesson.Blocks[5].Index != 1 || len(lesson.Videos) != 2 || lesson.Videos[0].URL != "/media/courses/sample/chapter/clip.mp4" || len(lesson.Youtube) != 1 || lesson.Youtube[0].Title != "Watch" {
		t.Fatalf("incorrect media: %+v", lesson)
	}
}
