package security

import "strings"

func APIKeyPreview(key string) string {
	s := strings.TrimSpace(key)
	if s == "" {
		return ""
	}
	if len(s) <= 6 {
		return "***"
	}
	return s[:3] + "..." + s[len(s)-2:]
}
