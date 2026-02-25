package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"infetrix/internal/config"
	"infetrix/internal/provider"
	"infetrix/internal/router"
	"infetrix/internal/security"
)

type Server struct {
	cfg    config.Config
	router router.Router
	mux    *http.ServeMux
}

const maxJSONBodyBytes = 1 << 20 // 1 MiB

func NewServer(cfg config.Config) *Server {
	s := &Server{
		cfg:    cfg,
		router: router.New(),
		mux:    http.NewServeMux(),
	}
	s.registerRoutes()
	return s
}

func (s *Server) Handler() http.Handler {
	return s.mux
}

func (s *Server) registerRoutes() {
	s.mux.HandleFunc("/health", s.handleHealth)
	s.mux.HandleFunc("/v1/route", s.handleRoute)
	s.mux.HandleFunc("/v1/infer", s.handleInfer)
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"status":  "ok",
		"service": "infetrix",
		"time":    time.Now().UTC().Format(time.RFC3339),
	})
}

func (s *Server) handleRoute(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxJSONBodyBytes)

	req, err := decodeRouteRequest(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	policyRaw := strings.TrimSpace(req.Policy)
	if policyRaw == "" {
		policyRaw = s.cfg.DefaultPolicy
	}

	policy, err := router.ParsePolicy(policyRaw)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	rankings, providerByName, err := s.rankProviders(policy, req.Providers)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	top := rankings[0]
	chosenRequest := providerByName[top.Provider.Name]
	response := RouteResponse{
		RequestID: buildRequestID(),
		Model:     req.Model,
		Policy:    string(policy),
		Selected: SelectedProvider{
			Name:          top.Provider.Name,
			Endpoint:      chosenRequest.Endpoint,
			APIKeyPreview: security.APIKeyPreview(chosenRequest.APIKey),
			TotalScore:    top.Breakdown.Total,
		},
		Rankings: make([]ProviderRouteResult, 0, len(rankings)),
	}

	for _, ranked := range rankings {
		response.Rankings = append(response.Rankings, ProviderRouteResult{
			Name:             ranked.Provider.Name,
			TotalScore:       ranked.Breakdown.Total,
			CostScore:        ranked.Breakdown.Cost,
			LatencyScore:     ranked.Breakdown.Latency,
			Availability:     ranked.Breakdown.Availability,
			PricePer1KTokens: ranked.Provider.PricePer1KTokens,
			AvgLatencyMS:     ranked.Provider.AvgLatencyMS,
		})
	}

	log.Printf("route decision request_id=%s model=%s policy=%s selected=%s key=%s",
		response.RequestID,
		response.Model,
		response.Policy,
		response.Selected.Name,
		response.Selected.APIKeyPreview,
	)

	writeJSON(w, http.StatusOK, response)
}

func (s *Server) handleInfer(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxJSONBodyBytes)

	req, err := decodeInferRequest(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	policyRaw := strings.TrimSpace(req.Policy)
	if policyRaw == "" {
		policyRaw = s.cfg.DefaultPolicy
	}

	policy, err := router.ParsePolicy(policyRaw)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	rankings, providerByName, err := s.rankProviders(policy, req.Providers)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	top := rankings[0]
	chosenRequest := providerByName[top.Provider.Name]
	adapter, err := provider.ForProvider(chosenRequest.Name)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	dispatchResult, err := adapter.Dispatch(r.Context(), chosenRequest.Endpoint, chosenRequest.APIKey, provider.InferInput{
		Model:       req.Model,
		Prompt:      req.Prompt,
		MaxTokens:   req.MaxTokens,
		Temperature: req.Temperature,
	})
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]any{
			"error":         "provider dispatch failed",
			"provider":      chosenRequest.Name,
			"request_id":    buildRequestID(),
			"selected_hint": security.APIKeyPreview(chosenRequest.APIKey),
		})
		return
	}

	requestID := buildRequestID()
	providerResponse := parseProviderResponseBody(dispatchResult.Body)
	if dispatchResult.StatusCode < http.StatusOK || dispatchResult.StatusCode >= http.StatusMultipleChoices {
		writeJSON(w, http.StatusBadGateway, map[string]any{
			"error":             "provider returned non-2xx status",
			"request_id":        requestID,
			"provider":          chosenRequest.Name,
			"provider_status":   dispatchResult.StatusCode,
			"provider_response": providerResponse,
		})
		return
	}

	response := InferResponse{
		RequestID: requestID,
		Model:     req.Model,
		Policy:    string(policy),
		Selected: SelectedProvider{
			Name:          top.Provider.Name,
			Endpoint:      chosenRequest.Endpoint,
			APIKeyPreview: security.APIKeyPreview(chosenRequest.APIKey),
			TotalScore:    top.Breakdown.Total,
		},
		ProviderStatus:   dispatchResult.StatusCode,
		ProviderResponse: providerResponse,
		Rankings:         make([]ProviderRouteResult, 0, len(rankings)),
	}

	for _, ranked := range rankings {
		response.Rankings = append(response.Rankings, ProviderRouteResult{
			Name:             ranked.Provider.Name,
			TotalScore:       ranked.Breakdown.Total,
			CostScore:        ranked.Breakdown.Cost,
			LatencyScore:     ranked.Breakdown.Latency,
			Availability:     ranked.Breakdown.Availability,
			PricePer1KTokens: ranked.Provider.PricePer1KTokens,
			AvgLatencyMS:     ranked.Provider.AvgLatencyMS,
		})
	}

	log.Printf("infer decision request_id=%s model=%s policy=%s selected=%s key=%s provider_status=%d",
		response.RequestID,
		response.Model,
		response.Policy,
		response.Selected.Name,
		response.Selected.APIKeyPreview,
		response.ProviderStatus,
	)

	writeJSON(w, http.StatusOK, response)
}

func decodeRouteRequest(r *http.Request) (RouteRequest, error) {
	var req RouteRequest
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(&req); err != nil {
		return RouteRequest{}, errors.New("invalid request body")
	}

	if strings.TrimSpace(req.Model) == "" {
		return RouteRequest{}, errors.New("model is required")
	}
	if len(req.Providers) == 0 {
		return RouteRequest{}, errors.New("at least one provider is required")
	}

	for _, p := range req.Providers {
		if strings.TrimSpace(p.Name) == "" {
			return RouteRequest{}, errors.New("provider name is required")
		}
	}

	return req, nil
}

func decodeInferRequest(r *http.Request) (InferRequest, error) {
	var req InferRequest
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(&req); err != nil {
		return InferRequest{}, errors.New("invalid request body")
	}

	if strings.TrimSpace(req.Prompt) == "" {
		return InferRequest{}, errors.New("prompt is required")
	}
	if strings.TrimSpace(req.Model) == "" {
		return InferRequest{}, errors.New("model is required")
	}
	if len(req.Providers) == 0 {
		return InferRequest{}, errors.New("at least one provider is required")
	}
	for _, p := range req.Providers {
		if strings.TrimSpace(p.Name) == "" {
			return InferRequest{}, errors.New("provider name is required")
		}
		if strings.TrimSpace(p.Endpoint) == "" {
			return InferRequest{}, errors.New("provider endpoint is required")
		}
		if strings.TrimSpace(p.APIKey) == "" {
			return InferRequest{}, errors.New("provider api_key is required")
		}
		if err := validateDispatchEndpoint(p.Name, p.Endpoint); err != nil {
			return InferRequest{}, err
		}
	}

	if req.MaxTokens <= 0 {
		req.MaxTokens = 256
	}
	if req.Temperature < 0 || req.Temperature > 2 {
		return InferRequest{}, errors.New("temperature must be between 0 and 2")
	}

	return req, nil
}

func (s *Server) rankProviders(policy router.Policy, providers []ProviderRequest) ([]router.ProviderScore, map[string]ProviderRequest, error) {
	providerByName := make(map[string]ProviderRequest, len(providers))
	stats := make([]router.ProviderStats, 0, len(providers))

	for _, p := range providers {
		providerByName[p.Name] = p
		stats = append(stats, router.ProviderStats{
			Name:             p.Name,
			PricePer1KTokens: p.PricePer1KTokens,
			AvgLatencyMS:     p.AvgLatencyMS,
			Availability:     p.Availability,
		})
	}

	rankings, err := s.router.Rank(policy, stats)
	if err != nil {
		return nil, nil, err
	}
	return rankings, providerByName, nil
}

func parseProviderResponseBody(body []byte) any {
	trimmed := strings.TrimSpace(string(body))
	if trimmed == "" {
		return nil
	}

	var parsed any
	if err := json.Unmarshal(body, &parsed); err != nil {
		return trimmed
	}
	return parsed
}

func validateDispatchEndpoint(providerName string, rawEndpoint string) error {
	parsed, err := url.Parse(strings.TrimSpace(rawEndpoint))
	if err != nil || parsed.Hostname() == "" {
		return errors.New("provider endpoint must be a valid URL")
	}

	host := strings.ToLower(parsed.Hostname())
	scheme := strings.ToLower(parsed.Scheme)
	if scheme != "http" && scheme != "https" {
		return errors.New("provider endpoint must use http or https")
	}

	if isLoopbackHost(host) {
		return nil
	}
	if scheme != "https" {
		return errors.New("provider endpoint must use https")
	}

	allowed := endpointHostAllowlist(providerName)
	if len(allowed) == 0 {
		return fmt.Errorf("no adapter for provider %q", providerName)
	}

	for _, suffix := range allowed {
		if host == suffix || strings.HasSuffix(host, "."+suffix) {
			return nil
		}
	}

	return fmt.Errorf("provider endpoint host %q is not allowed for %q", host, providerName)
}

func endpointHostAllowlist(providerName string) []string {
	switch strings.ToLower(strings.TrimSpace(providerName)) {
	case "runpod":
		return []string{"runpod.ai"}
	case "huggingface", "hugging_face", "hf":
		return []string{"huggingface.co"}
	default:
		return nil
	}
}

func isLoopbackHost(host string) bool {
	if host == "localhost" || host == "::1" {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

func buildRequestID() string {
	return "req_" + time.Now().UTC().Format("20060102T150405.000000000")
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}
