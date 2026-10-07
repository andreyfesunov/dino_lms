package auth

import "testing"

func TestShortNameUsesUnicodeInitial(t *testing.T) {
	for _, test := range []struct{ first, last, want string }{
		{"Андрей", "Фесунов", "Фесунов А."},
		{"Élodie", "Martin", "Martin É."},
		{"Admin", "User", "User A."},
	} {
		u := User{FirstName: &test.first, LastName: &test.last}
		if got := u.ShortName(); got != test.want {
			t.Errorf("ShortName()=%q, want %q", got, test.want)
		}
	}
}
