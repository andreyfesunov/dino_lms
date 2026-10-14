package httpapi

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestLessonChapterMetadataPreservesCourseNavigation(t *testing.T) {
	f := newFixture(t)
	admin := f.admin()
	root := filepath.Join(f.server.Catalog.Root(), "sample")
	config := `id="sample"
title="Sample"
[[chapters]]
id="chapter"
title="First"
lessons=[{id="intro",title="Intro"}]
[[chapters]]
id="second"
title="Second"
lessons=[{id="call",title="Call",type="call"},{id="article",title="Article"}]
`
	if err := os.WriteFile(filepath.Join(root, "config.toml"), []byte(config), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(root, "second"), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "second", "article.md"), []byte("# Article"), 0600); err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		path                          string
		chapter, lesson, count, index int
	}{
		{"chapter/intro", 1, 1, 1, 0}, {"second/call", 2, 1, 2, 1}, {"second/article", 2, 2, 2, 2},
	} {
		t.Run(tc.path, func(t *testing.T) {
			w := f.request("GET", "/api/courses/sample/"+tc.path, "", admin, 200)
			var result struct {
				Chapter int      `json:"chapter_index"`
				Lesson  int      `json:"chapter_lesson_index"`
				Count   int      `json:"chapter_total_lessons"`
				Index   int      `json:"index"`
				Total   int      `json:"total"`
				Prev    *navJSON `json:"prev"`
				Next    *navJSON `json:"next"`
			}
			if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
				t.Fatal(err)
			}
			if result.Chapter != tc.chapter || result.Lesson != tc.lesson || result.Count != tc.count || result.Index != tc.index || result.Total != 3 {
				t.Fatal(w.Body.String())
			}
			if (result.Prev != nil) != (tc.index > 0) || (result.Next != nil) != (tc.index < 2) {
				t.Fatal("course navigation changed", w.Body.String())
			}
		})
	}
}
