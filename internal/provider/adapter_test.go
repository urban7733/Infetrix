package provider

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestRunPodAdapterDispatch(t *testing.T) {
	var gotAuth string
	var gotModel string
	var gotPrompt string

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		var payload map[string]any
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatalf("decode body: %v", err)
		}
		gotModel, _ = payload["model"].(string)

		input, _ := payload["input"].(map[string]any)
		gotPrompt, _ = input["prompt"].(string)

		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":"run-123","output":"ok"}`))
	}))
	defer srv.Close()

	adapter := RunPodAdapter{httpAdapter: newHTTPAdapter()}
	result, err := adapter.Dispatch(context.Background(), srv.URL, "rp_test_key_123", InferInput{
		Model:       "llama-3.1-8b-instruct",
		Prompt:      "hello",
		MaxTokens:   64,
		Temperature: 0.2,
	})
	if err != nil {
		t.Fatalf("dispatch failed: %v", err)
	}

	if result.StatusCode != http.StatusOK {
		t.Fatalf("expected status 200, got %d", result.StatusCode)
	}
	if gotAuth != "Bearer rp_test_key_123" {
		t.Fatalf("unexpected auth header: %q", gotAuth)
	}
	if gotModel != "llama-3.1-8b-instruct" {
		t.Fatalf("unexpected model: %q", gotModel)
	}
	if gotPrompt != "hello" {
		t.Fatalf("unexpected prompt: %q", gotPrompt)
	}
}

func TestHuggingFaceAdapterDispatch(t *testing.T) {
	var gotAuth string
	var gotInputs string

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		var payload map[string]any
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatalf("decode body: %v", err)
		}
		gotInputs, _ = payload["inputs"].(string)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`[{"generated_text":"ok"}]`))
	}))
	defer srv.Close()

	adapter := HuggingFaceAdapter{httpAdapter: newHTTPAdapter()}
	result, err := adapter.Dispatch(context.Background(), srv.URL, "hf_test_key_456", InferInput{
		Model:       "meta-llama/Llama-3.1-8B-Instruct",
		Prompt:      "Hello HF",
		MaxTokens:   32,
		Temperature: 0.7,
	})
	if err != nil {
		t.Fatalf("dispatch failed: %v", err)
	}

	if result.StatusCode != http.StatusOK {
		t.Fatalf("expected status 200, got %d", result.StatusCode)
	}
	if gotAuth != "Bearer hf_test_key_456" {
		t.Fatalf("unexpected auth header: %q", gotAuth)
	}
	if gotInputs != "Hello HF" {
		t.Fatalf("unexpected inputs payload: %q", gotInputs)
	}
}
