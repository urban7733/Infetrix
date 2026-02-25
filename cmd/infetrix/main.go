package main

import (
	"log"
	"net/http"
	"os"
	"time"

	"infetrix/internal/api"
	"infetrix/internal/config"
)

func main() {
	cfg := config.LoadFromEnv()
	app := api.NewServer(cfg)
	server := &http.Server{
		Addr:              cfg.Addr,
		Handler:           app.Handler(),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
		MaxHeaderBytes:    1 << 20, // 1 MiB
	}

	log.Printf("infetrix listening on %s (default_policy=%s)", cfg.Addr, cfg.DefaultPolicy)
	if err := server.ListenAndServe(); err != nil {
		log.Printf("infetrix stopped: %v", err)
		os.Exit(1)
	}
}
