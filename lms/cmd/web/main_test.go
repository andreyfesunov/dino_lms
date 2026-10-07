package main

import (
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestStaticBundleAndSPAFallback(t *testing.T) {
	t.Chdir(t.TempDir())
	if staticHandler() != nil {
		t.Fatal("API-only mode must not require a bundle")
	}
	dir := "client/dist/client/browser"
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "index.html"), []byte("<app-root></app-root>"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "main.js"), []byte("console.log('ok')"), 0o600); err != nil {
		t.Fatal(err)
	}
	handler := staticHandler()
	for path, status := range map[string]int{"/": 200, "/courses/sample/chapter/lesson": 200, "/main.js": 200, "/missing.js": 404} {
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, httptest.NewRequest("GET", path, nil))
		if w.Code != status {
			t.Fatalf("%s: %d, want %d", path, w.Code, status)
		}
	}
}
