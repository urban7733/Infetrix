package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"infetrix/internal/config"
)

func TestHandleInferRoutesAndDispatches(t *testing.T) {
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer rp_test_key" {
			t.Fatalf("unexpected auth header: %s", r.Header.Get("Authorization"))
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"output":"hello from runpod"}`))
	}))
	defer provider.Close()

	s := NewServer(config.Config{Addr: ":8080", DefaultPolicy: "balanced"})
	body := []byte(`{
		"prompt": "Say hello",
		"model": "llama-3.1-8b-instruct",
		"max_tokens": 64,
		"temperature": 0.3,
		"providers": [
			{
				"name": "runpod",
				"endpoint": "` + provider.URL + `",
				"api_key": "rp_test_key",
				"price_per_1k_tokens": 0.018,
				"avg_latency_ms": 220,
				"availability": 0.99
			},
			{
				"name": "huggingface",
				"endpoint": "https://api-inference.huggingface.co/models/unit-test-model",
				"api_key": "hf_test_key",
				"price_per_1k_tokens": 0.040,
				"avg_latency_ms": 450,
				"availability": 0.95
			}
		]
	}`)

	req := httptest.NewRequest(http.MethodPost, "/v1/infer", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	s.Handler().ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
	}

	var response InferResponse
	if err := json.Unmarshal(rr.Body.Bytes(), &response); err != nil {
		t.Fatalf("decode response: %v", err)
	}

	if response.Selected.Name != "runpod" {
		t.Fatalf("expected runpod selected, got %s", response.Selected.Name)
	}
	if response.ProviderStatus != http.StatusOK {
		t.Fatalf("expected provider status 200, got %d", response.ProviderStatus)
	}
}

func TestHandleInferReturnsBadGatewayOnProviderError(t *testing.T) {
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "provider failed", http.StatusBadGateway)
	}))
	defer provider.Close()

	s := NewServer(config.Config{Addr: ":8080", DefaultPolicy: "balanced"})
	body := []byte(`{
		"prompt": "Say hello",
		"model": "llama-3.1-8b-instruct",
		"providers": [
			{
				"name": "runpod",
				"endpoint": "` + provider.URL + `",
				"api_key": "rp_test_key",
				"price_per_1k_tokens": 0.018,
				"avg_latency_ms": 220,
				"availability": 0.99
			}
		]
	}`)

	req := httptest.NewRequest(http.MethodPost, "/v1/infer", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	s.Handler().ServeHTTP(rr, req)

	if rr.Code != http.StatusBadGateway {
		t.Fatalf("expected 502, got %d", rr.Code)
	}
}

func TestHandleInferRejectsDisallowedProviderHost(t *testing.T) {
	s := NewServer(config.Config{Addr: ":8080", DefaultPolicy: "balanced"})
	body := []byte(`{
		"prompt": "Say hello",
		"model": "llama-3.1-8b-instruct",
		"providers": [
			{
				"name": "runpod",
				"endpoint": "https://example.com/not-runpod",
				"api_key": "rp_test_key",
				"price_per_1k_tokens": 0.018,
				"avg_latency_ms": 220,
				"availability": 0.99
			}
		]
	}`)

	req := httptest.NewRequest(http.MethodPost, "/v1/infer", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	s.Handler().ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", rr.Code, rr.Body.String())
	}
}
