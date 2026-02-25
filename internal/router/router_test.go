package router

import "testing"

func TestRankCostPolicyPrefersCheapestProvider(t *testing.T) {
	r := New()
	providers := []ProviderStats{
		{Name: "runpod", PricePer1KTokens: 0.030, AvgLatencyMS: 300, Availability: 0.99},
		{Name: "vast", PricePer1KTokens: 0.020, AvgLatencyMS: 600, Availability: 0.96},
		{Name: "modal", PricePer1KTokens: 0.040, AvgLatencyMS: 250, Availability: 0.995},
	}

	chosen, err := r.Select(PolicyCost, providers)
	if err != nil {
		t.Fatalf("Select failed: %v", err)
	}

	if chosen.Provider.Name != "vast" {
		t.Fatalf("expected vast, got %s", chosen.Provider.Name)
	}
}

func TestRankLatencyPolicyPrefersFastestProvider(t *testing.T) {
	r := New()
	providers := []ProviderStats{
		{Name: "runpod", PricePer1KTokens: 0.020, AvgLatencyMS: 380, Availability: 0.99},
		{Name: "vast", PricePer1KTokens: 0.018, AvgLatencyMS: 450, Availability: 0.97},
		{Name: "modal", PricePer1KTokens: 0.032, AvgLatencyMS: 190, Availability: 0.995},
	}

	chosen, err := r.Select(PolicyLatency, providers)
	if err != nil {
		t.Fatalf("Select failed: %v", err)
	}

	if chosen.Provider.Name != "modal" {
		t.Fatalf("expected modal, got %s", chosen.Provider.Name)
	}
}

func TestParsePolicyRejectsUnknownPolicy(t *testing.T) {
	if _, err := ParsePolicy("random"); err == nil {
		t.Fatal("expected error for unsupported policy")
	}
}
