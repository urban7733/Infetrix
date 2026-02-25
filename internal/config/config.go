package config

import "os"

type Config struct {
	Addr          string
	DefaultPolicy string
}

func LoadFromEnv() Config {
	addr := os.Getenv("INFETRIX_ADDR")
	if addr == "" {
		addr = ":8080"
	}

	defaultPolicy := os.Getenv("INFETRIX_DEFAULT_POLICY")
	if defaultPolicy == "" {
		defaultPolicy = "balanced"
	}

	return Config{
		Addr:          addr,
		DefaultPolicy: defaultPolicy,
	}
}
