package provider

import "context"

type HuggingFaceAdapter struct {
	httpAdapter
}

func (a HuggingFaceAdapter) Dispatch(ctx context.Context, endpoint string, apiKey string, input InferInput) (DispatchResult, error) {
	payload := map[string]any{
		"inputs": input.Prompt,
		"parameters": map[string]any{
			"max_new_tokens": input.MaxTokens,
			"temperature":    input.Temperature,
		},
	}
	return a.postJSON(ctx, endpoint, apiKey, payload)
}
