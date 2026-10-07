// Command initializer applies migrations and bootstraps the first admin.
package main

import (
	"context"
	"database/sql"
	"flag"
	"fmt"
	"os"

	"github.com/andreyfesunov/dino_lms/lms/internal/auth"
	"github.com/andreyfesunov/dino_lms/lms/internal/config"
	"github.com/andreyfesunov/dino_lms/lms/internal/db"
)

func main() {
	if len(os.Args) < 2 {
		usage()
		os.Exit(2)
	}

	cfg, err := config.Load()
	if err != nil {
		fmt.Fprintf(os.Stderr, "config: %v\n", err)
		os.Exit(1)
	}

	switch os.Args[1] {
	case "migrate":
		migrate(cfg)
	case "bootstrap-admin":
		bootstrapAdmin(cfg, os.Args[2:])
	default:
		usage()
		os.Exit(2)
	}
}

func usage() {
	fmt.Fprintf(os.Stderr, `dino_lms maintenance CLI

Usage:
  initializer migrate                       Apply pending database migrations
  initializer bootstrap-admin [flags]       Create the first admin account

Flags for bootstrap-admin:
  --login string        Admin login (default "admin")
  --password string     Admin password (generated when omitted)
  --first-name string   Optional first name
  --last-name string    Optional last name
`)
}

func openPool(cfg config.Config) (*sql.DB, error) {
	return db.Open(context.Background(), cfg.Database.Path)
}

func migrate(cfg config.Config) {
	pool, err := openPool(cfg)
	if err != nil {
		fmt.Fprintf(os.Stderr, "migration failed: %v\n", err)
		os.Exit(1)
	}
	defer pool.Close()
	fmt.Println("migrations applied successfully")
}

func bootstrapAdmin(cfg config.Config, args []string) {
	flags := flag.NewFlagSet("bootstrap-admin", flag.ExitOnError)
	login := flags.String("login", "admin", "admin login")
	password := flags.String("password", "", "admin password (generated when omitted)")
	firstName := flags.String("first-name", "", "first name")
	lastName := flags.String("last-name", "", "last name")
	if err := flags.Parse(args); err != nil {
		fmt.Fprintf(os.Stderr, "%v\n", err)
		os.Exit(2)
	}

	pool, err := openPool(cfg)
	if err != nil {
		fmt.Fprintf(os.Stderr, "bootstrap failed: %v\n", err)
		os.Exit(1)
	}
	defer pool.Close()

	authService := auth.NewAuthService(
		auth.NewSqliteUserRepository(pool),
		auth.NewSqliteSessionRepository(pool),
		auth.Argon2Hasher{},
	)

	cmd := auth.BootstrapAdminCommand{Login: *login}
	if *password != "" {
		cmd.Password = &*password
	}
	if *firstName != "" {
		cmd.FirstName = &*firstName
	}
	if *lastName != "" {
		cmd.LastName = &*lastName
	}

	result, err := authService.BootstrapAdmin(context.Background(), cmd)
	if err != nil {
		fmt.Fprintf(os.Stderr, "bootstrap failed: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("admin created: %s\n", result.Login)
	if result.TemporaryPassword != nil {
		fmt.Printf("temporary password: %s\n", *result.TemporaryPassword)
	}
}
