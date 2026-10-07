// Package config loads dino.toml merged with DINO_* environment variables.
package config

import (
	"os"
	"path/filepath"
	"strings"

	"github.com/pelletier/go-toml/v2"
)

// Config is the application configuration.
type Config struct {
	Database DatabaseConfig `toml:"database"`
	Courses  CoursesConfig  `toml:"courses"`
	Server   ServerConfig   `toml:"server"`
}

// DatabaseConfig points at the SQLite file.
type DatabaseConfig struct {
	Path string `toml:"path"`
}

// CoursesConfig points at the declarative course bundles directory.
type CoursesConfig struct {
	Dir string `toml:"dir"`
}

// ServerConfig holds HTTP server options.
type ServerConfig struct {
	Addr string `toml:"addr"`
}

// Built-in defaults, overridable via dino.toml and DINO_* env vars.
const (
	DefaultDatabasePath = "data/dino.sqlite"
	DefaultCoursesDir   = "courses"
	DefaultServerAddr   = "127.0.0.1:8080"
)

// Default returns the built-in configuration.
func Default() Config {
	return Config{
		Database: DatabaseConfig{Path: DefaultDatabasePath},
		Courses:  CoursesConfig{Dir: DefaultCoursesDir},
		Server:   ServerConfig{Addr: DefaultServerAddr},
	}
}

// Load reads `dino.toml` (optional) and overlays DINO_* env vars.
func Load() (Config, error) {
	cfg := Default()

	if raw, err := os.ReadFile("dino.toml"); err == nil {
		if err := toml.Unmarshal(raw, &cfg); err != nil {
			return Config{}, err
		}
	} else if !os.IsNotExist(err) {
		return Config{}, err
	}

	applyEnv(&cfg)
	return cfg, nil
}

func applyEnv(cfg *Config) {
	if v, ok := os.LookupEnv("DINO_DATABASE__PATH"); ok && v != "" {
		cfg.Database.Path = v
	}
	if v, ok := os.LookupEnv("DINO_COURSES__DIR"); ok && v != "" {
		cfg.Courses.Dir = v
	}
	if v, ok := os.LookupEnv("DINO_SERVER__ADDR"); ok && v != "" {
		cfg.Server.Addr = v
	}
}

// SQLiteDSN returns the legacy `sqlite:{path}?mode=rwc` URL form, kept for
// display purposes; the driver consumes a file: DSN.
func SQLiteDSN(path string) string {
	return "sqlite:" + strings.ReplaceAll(filepath.ToSlash(path), "\\", "/") + "?mode=rwc"
}
