package router

import (
	"errors"
	"fmt"
	"math"
	"sort"
	"strings"
)

type Policy string

const (
	PolicyCost     Policy = "cost"
	PolicyLatency  Policy = "latency"
	PolicyBalanced Policy = "balanced"
)

type ScoreBreakdown struct {
	Cost         float64 `json:"cost"`
	Latency      float64 `json:"latency"`
	Availability float64 `json:"availability"`
	Total        float64 `json:"total"`
}

type ProviderScore struct {
	Provider  ProviderStats  `json:"provider"`
	Breakdown ScoreBreakdown `json:"breakdown"`
}

type Router struct{}

func New() Router {
	return Router{}
}

func ParsePolicy(raw string) (Policy, error) {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "", string(PolicyBalanced):
		return PolicyBalanced, nil
	case string(PolicyCost):
		return PolicyCost, nil
	case string(PolicyLatency):
		return PolicyLatency, nil
	default:
		return "", fmt.Errorf("unsupported policy: %q", raw)
	}
}

func (r Router) Select(policy Policy, providers []ProviderStats) (ProviderScore, error) {
	rankings, err := r.Rank(policy, providers)
	if err != nil {
		return ProviderScore{}, err
	}
	return rankings[0], nil
}

func (r Router) Rank(policy Policy, providers []ProviderStats) ([]ProviderScore, error) {
	if len(providers) == 0 {
		return nil, errors.New("at least one provider is required")
	}

	if _, err := ParsePolicy(string(policy)); err != nil {
		return nil, err
	}

	for _, p := range providers {
		if strings.TrimSpace(p.Name) == "" {
			return nil, errors.New("provider name is required")
		}
		if p.PricePer1KTokens < 0 {
			return nil, fmt.Errorf("provider %q has negative price_per_1k_tokens", p.Name)
		}
		if p.AvgLatencyMS < 0 {
			return nil, fmt.Errorf("provider %q has negative avg_latency_ms", p.Name)
		}
		if p.Availability < 0 || p.Availability > 1 {
			return nil, fmt.Errorf("provider %q availability must be between 0 and 1", p.Name)
		}
	}

	minPrice, maxPrice := minMaxPrice(providers)
	minLatency, maxLatency := minMaxLatency(providers)
	minAvail, maxAvail := minMaxAvailability(providers)

	costWeight, latencyWeight, availabilityWeight := weightsFor(policy)
	rankings := make([]ProviderScore, 0, len(providers))

	for _, p := range providers {
		costScore := normalizeInverse(p.PricePer1KTokens, minPrice, maxPrice)
		latencyScore := normalizeInverse(float64(p.AvgLatencyMS), float64(minLatency), float64(maxLatency))
		availabilityScore := normalizeDirect(p.Availability, minAvail, maxAvail)
		total := (costScore * costWeight) + (latencyScore * latencyWeight) + (availabilityScore * availabilityWeight)

		rankings = append(rankings, ProviderScore{
			Provider: p,
			Breakdown: ScoreBreakdown{
				Cost:         round4(costScore),
				Latency:      round4(latencyScore),
				Availability: round4(availabilityScore),
				Total:        round4(total),
			},
		})
	}

	sort.SliceStable(rankings, func(i, j int) bool {
		if rankings[i].Breakdown.Total == rankings[j].Breakdown.Total {
			if rankings[i].Provider.Availability == rankings[j].Provider.Availability {
				return rankings[i].Provider.Name < rankings[j].Provider.Name
			}
			return rankings[i].Provider.Availability > rankings[j].Provider.Availability
		}
		return rankings[i].Breakdown.Total > rankings[j].Breakdown.Total
	})

	return rankings, nil
}

func weightsFor(policy Policy) (cost float64, latency float64, availability float64) {
	switch policy {
	case PolicyCost:
		return 0.70, 0.20, 0.10
	case PolicyLatency:
		return 0.20, 0.70, 0.10
	default:
		return 0.45, 0.35, 0.20
	}
}

func minMaxPrice(providers []ProviderStats) (float64, float64) {
	min := providers[0].PricePer1KTokens
	max := providers[0].PricePer1KTokens
	for _, p := range providers {
		if p.PricePer1KTokens < min {
			min = p.PricePer1KTokens
		}
		if p.PricePer1KTokens > max {
			max = p.PricePer1KTokens
		}
	}
	return min, max
}

func minMaxLatency(providers []ProviderStats) (int, int) {
	min := providers[0].AvgLatencyMS
	max := providers[0].AvgLatencyMS
	for _, p := range providers {
		if p.AvgLatencyMS < min {
			min = p.AvgLatencyMS
		}
		if p.AvgLatencyMS > max {
			max = p.AvgLatencyMS
		}
	}
	return min, max
}

func minMaxAvailability(providers []ProviderStats) (float64, float64) {
	min := providers[0].Availability
	max := providers[0].Availability
	for _, p := range providers {
		if p.Availability < min {
			min = p.Availability
		}
		if p.Availability > max {
			max = p.Availability
		}
	}
	return min, max
}

func normalizeInverse(value float64, min float64, max float64) float64 {
	if max == min {
		return 1
	}
	return (max - value) / (max - min)
}

func normalizeDirect(value float64, min float64, max float64) float64 {
	if max == min {
		return 1
	}
	return (value - min) / (max - min)
}

func round4(v float64) float64 {
	return math.Round(v*10000) / 10000
}
