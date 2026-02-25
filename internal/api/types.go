package api

type RouteRequest struct {
	Prompt    string            `json:"prompt"`
	Model     string            `json:"model"`
	Policy    string            `json:"policy"`
	Providers []ProviderRequest `json:"providers"`
}

type InferRequest struct {
	Prompt      string            `json:"prompt"`
	Model       string            `json:"model"`
	Policy      string            `json:"policy"`
	MaxTokens   int               `json:"max_tokens"`
	Temperature float64           `json:"temperature"`
	Providers   []ProviderRequest `json:"providers"`
}

type ProviderRequest struct {
	Name             string  `json:"name"`
	Endpoint         string  `json:"endpoint"`
	APIKey           string  `json:"api_key"`
	PricePer1KTokens float64 `json:"price_per_1k_tokens"`
	AvgLatencyMS     int     `json:"avg_latency_ms"`
	Availability     float64 `json:"availability"`
}

type RouteResponse struct {
	RequestID string                `json:"request_id"`
	Model     string                `json:"model"`
	Policy    string                `json:"policy"`
	Selected  SelectedProvider      `json:"selected_provider"`
	Rankings  []ProviderRouteResult `json:"rankings"`
}

type InferResponse struct {
	RequestID        string                `json:"request_id"`
	Model            string                `json:"model"`
	Policy           string                `json:"policy"`
	Selected         SelectedProvider      `json:"selected_provider"`
	ProviderStatus   int                   `json:"provider_status"`
	ProviderResponse any                   `json:"provider_response,omitempty"`
	Rankings         []ProviderRouteResult `json:"rankings"`
}

type SelectedProvider struct {
	Name          string  `json:"name"`
	Endpoint      string  `json:"endpoint,omitempty"`
	APIKeyPreview string  `json:"api_key_preview,omitempty"`
	TotalScore    float64 `json:"total_score"`
}

type ProviderRouteResult struct {
	Name             string  `json:"name"`
	TotalScore       float64 `json:"total_score"`
	CostScore        float64 `json:"cost_score"`
	LatencyScore     float64 `json:"latency_score"`
	Availability     float64 `json:"availability_score"`
	PricePer1KTokens float64 `json:"price_per_1k_tokens"`
	AvgLatencyMS     int     `json:"avg_latency_ms"`
}
