// Package buildinfo identifies the running server binary.
package buildinfo

// Version is read from the repository's VERSION file by the build scripts:
// go build -ldflags "-X
// github.com/andreyfesunov/dino_lms/lms/internal/buildinfo.Version=1.0.0".
var Version = "dev"

func Current() string {
	return Version
}
