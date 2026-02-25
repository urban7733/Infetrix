package provider

import "context"

type RunPodAdapter struct {
	httpAdapter
}

func (a RunPodAdapter) Dispatch(ctx context.Context, endpoint string, apiKey string, input InferInput) (DispatchResult, error) {
	payload := map[string]any{
		"model": input.Model,
		"input": map[string]any{
			"prompt": input.Prompt,
		},
		"parameters": map[string]any{
			"max_tokens":  input.MaxTokens,
			"temperature": input.Temperature,
		},
	}
	return a.postJSON(ctx, endpoint, apiKey, payload)
}
