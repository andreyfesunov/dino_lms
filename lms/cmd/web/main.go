// Command web serves the LMS JSON API and the Angular client bundle.
package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/andreyfesunov/dino_lms/lms/internal/auth"
	"github.com/andreyfesunov/dino_lms/lms/internal/config"
	"github.com/andreyfesunov/dino_lms/lms/internal/courses"
	"github.com/andreyfesunov/dino_lms/lms/internal/db"
	"github.com/andreyfesunov/dino_lms/lms/internal/httpapi"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config: %v", err)
	}
	if err := run(cfg); err != nil {
		log.Fatal(err)
	}
}

func run(cfg config.Config) error {
	ctx := context.Background()

	pool, err := db.Open(ctx, cfg.Database.Path)
	if err != nil {
		return err
	}
	defer pool.Close()

	authService := auth.NewAuthService(
		auth.NewSqliteUserRepository(pool),
		auth.NewSqliteSessionRepository(pool),
		auth.Argon2Hasher{},
	)
	catalog := courses.OpenCatalog(cfg.Courses.Dir)
	courseService := courses.NewCourseService(catalog, courses.NewSqliteCourseRepository(pool))

	server := &httpapi.Server{
		Auth:    authService,
		Courses: courseService,
		Catalog: catalog,
		Static:  staticHandler(),
	}

	log.Printf("dino_lms listening on http://%s", cfg.Server.Addr)
	return http.ListenAndServe(cfg.Server.Addr, httpapi.NewMux(server))
}

// staticHandler serves the Angular bundle when it has been built
// (client/dist/client/browser); in API-only dev mode it is nil and API-only.
func staticHandler() http.Handler {
	const distDir = "client/dist/client/browser"
	if info, err := os.Stat(distDir); err != nil || !info.IsDir() {
		return nil
	}
	if _, err := os.Stat(filepath.Join(distDir, "index.html")); err != nil {
		return nil
	}
	fs := http.FileServer(http.Dir(distDir))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.Header().Set("Allow", "GET, HEAD")
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		// SPA fallback: unknown paths serve index.html.
		path := filepath.Join(distDir, filepath.FromSlash(strings.TrimPrefix(r.URL.Path, "/")))
		if _, err := os.Stat(path); err != nil {
			if filepath.Ext(r.URL.Path) != "" {
				http.NotFound(w, r)
				return
			}
			http.ServeFile(w, r, distDir+"/index.html")
			return
		}
		fs.ServeHTTP(w, r)
	})
}
