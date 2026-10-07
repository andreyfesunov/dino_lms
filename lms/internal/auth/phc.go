package auth

import (
	"crypto/subtle"
	"encoding/base64"
	"fmt"
	"strconv"
	"strings"
)

type phcParams struct {
	memory  uint32
	time    uint32
	threads uint8
}

func decodePHC(encoded string) (phcParams, []byte, []byte, error) {
	parts := strings.Split(encoded, "$")
	// ["", "argon2id", "v=19", "m=19456,t=2,p=1", salt, hash]
	if len(parts) != 6 || parts[0] != "" || parts[1] != "argon2id" || parts[2] != "v=19" {
		return phcParams{}, nil, nil, fmt.Errorf("unsupported hash format")
	}
	var params phcParams
	for _, field := range strings.Split(parts[3], ",") {
		key, value, found := strings.Cut(field, "=")
		if !found {
			return phcParams{}, nil, nil, fmt.Errorf("malformed param %q", field)
		}
		switch key {
		case "m":
			memory, err := strconv.ParseUint(value, 10, 32)
			if err != nil {
				return phcParams{}, nil, nil, err
			}
			params.memory = uint32(memory)
		case "t":
			time, err := strconv.ParseUint(value, 10, 32)
			if err != nil {
				return phcParams{}, nil, nil, err
			}
			params.time = uint32(time)
		case "p":
			threads, err := strconv.ParseUint(value, 10, 8)
			if err != nil {
				return phcParams{}, nil, nil, err
			}
			params.threads = uint8(threads)
		default:
			return phcParams{}, nil, nil, fmt.Errorf("unknown param %q", key)
		}
	}
	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil {
		return phcParams{}, nil, nil, err
	}
	key, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil {
		return phcParams{}, nil, nil, err
	}
	if params.threads == 0 || params.memory < 8*uint32(params.threads) || params.memory > 256*1024 || params.time == 0 || params.time > 10 || len(salt) < 8 || len(key) < 16 || len(key) > 64 {
		return phcParams{}, nil, nil, fmt.Errorf("missing argon2 params")
	}
	return params, salt, key, nil
}

func constantTimeEqual(a, b []byte) bool {
	return subtle.ConstantTimeCompare(a, b) == 1
}
