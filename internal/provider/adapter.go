package provider

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

type InferInput struct {
	Model       string
	Prompt      string
	MaxTokens   int
	Temperature float64
}

type DispatchResult struct {
	StatusCode int
	Body       []byte
}

type Adapter interface {
	Dispatch(ctx context.Context, endpoint string, apiKey string, input InferInput) (DispatchResult, error)
}

type httpAdapter struct {
	client *http.Client
}

func newHTTPAdapter() httpAdapter {
	return httpAdapter{
		client: &http.Client{Timeout: 30 * time.Second},
	}
}

func ForProvider(name string) (Adapter, error) {
	switch strings.ToLower(strings.TrimSpace(name)) {
	case "runpod":
		return RunPodAdapter{httpAdapter: newHTTPAdapter()}, nil
	case "huggingface", "hugging_face", "hf":
		return HuggingFaceAdapter{httpAdapter: newHTTPAdapter()}, nil
	default:
		return nil, fmt.Errorf("no adapter for provider %q", name)
	}
}

func (a httpAdapter) postJSON(ctx context.Context, endpoint string, apiKey string, payload any) (DispatchResult, error) {
	body, err := json.Marshal(payload)
	if err != nil {
		return DispatchResult{}, fmt.Errorf("encode payload: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return DispatchResult{}, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if strings.TrimSpace(apiKey) != "" {
		req.Header.Set("Authorization", "Bearer "+strings.TrimSpace(apiKey))
	}

	res, err := a.client.Do(req)
	if err != nil {
		return DispatchResult{}, fmt.Errorf("dispatch request: %w", err)
	}
	defer res.Body.Close()

	responseBody := new(bytes.Buffer)
	if _, err := responseBody.ReadFrom(res.Body); err != nil {
		return DispatchResult{}, fmt.Errorf("read response: %w", err)
	}

	return DispatchResult{
		StatusCode: res.StatusCode,
		Body:       responseBody.Bytes(),
	}, nil
}
