package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestDefaults(t *testing.T) {
	cfg := Default()
	if cfg.Database.Path != "data/dino.sqlite" {
		t.Fatalf("database path = %q, want data/dino.sqlite", cfg.Database.Path)
	}
	if cfg.Courses.Dir != "courses" {
		t.Fatalf("courses dir = %q, want courses", cfg.Courses.Dir)
	}
}

func TestSQLiteDSN(t *testing.T) {
	if got := SQLiteDSN(`data\dino.sqlite`); got != "sqlite:data/dino.sqlite?mode=rwc" {
		t.Fatalf("dsn = %q", got)
	}
}

func TestLoadFromToml(t *testing.T) {
	dir := t.TempDir()
	wd, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chdir(wd) })
	if err := os.Chdir(dir); err != nil {
		t.Fatal(err)
	}
	body := `
[database]
path = "custom.sqlite"

[courses]
dir = "bundles"

[server]
addr = "127.0.0.1:9000"
`
	if err := os.WriteFile(filepath.Join(dir, "dino.toml"), []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Database.Path != "custom.sqlite" || cfg.Courses.Dir != "bundles" || cfg.Server.Addr != "127.0.0.1:9000" {
		t.Fatalf("cfg = %+v", cfg)
	}
}

func TestEnvOverrides(t *testing.T) {
	dir := t.TempDir()
	wd, _ := os.Getwd()
	t.Cleanup(func() { _ = os.Chdir(wd) })
	if err := os.Chdir(dir); err != nil {
		t.Fatal(err)
	}
	t.Setenv("DINO_DATABASE__PATH", "env.sqlite")
	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Database.Path != "env.sqlite" {
		t.Fatalf("path = %q", cfg.Database.Path)
	}
}
