package courses

import "os"

func makeDirAll(path string) error { return os.MkdirAll(path, 0o755) }

func writeFile(path, body string) error {
	return os.WriteFile(path, []byte(body), 0o644)
}
