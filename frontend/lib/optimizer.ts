/**
 * Mojo/MAX Optimization Client
 * Handles optimization profile configuration for inference requests
 */

export type OptimizationProfile = "baseline" | "tuned" | "aggressive";

export type OptimizationConfig = {
  quantization: string | null;
  batch_strategy: "standard" | "in_flight";
  chunked_prefill: boolean;
  device_memory_utilization: number;
  speculative_decoding: boolean;
};

export type OptimizeRequest = {
  profile: OptimizationProfile;
  model: string;
  prompt: string;
  max_tokens?: number;
  temperature?: number;
};

export type OptimizeResponse = {
  profile: OptimizationProfile;
  config: OptimizationConfig;
  projected_savings_pct: number;
  projected_latency_reduction_pct: number;
};

// Profile configurations based on mojo-max-playbook.md
const PROFILE_CONFIGS: Record<OptimizationProfile, OptimizationConfig> = {
  baseline: {
    quantization: null,
    batch_strategy: "standard",
    chunked_prefill: false,
    device_memory_utilization: 0.85,
    speculative_decoding: false,
  },
  tuned: {
    quantization: "Q4_K",
    batch_strategy: "in_flight",
    chunked_prefill: true,
    device_memory_utilization: 0.92,
    speculative_decoding: false,
  },
  aggressive: {
    quantization: "Q4_K",
    batch_strategy: "in_flight",
    chunked_prefill: true,
    device_memory_utilization: 0.95,
    speculative_decoding: true,
  },
};

const PROFILE_SAVINGS: Record<OptimizationProfile, { cost: number; latency: number }> = {
  baseline: { cost: 0, latency: 0 },
  tuned: { cost: 30, latency: 15 },
  aggressive: { cost: 40, latency: 25 },
};

/**
 * Get optimization configuration for a given profile
 * This is the local implementation - no external sidecar required for basic profiles
 */
export function getOptimizationConfig(profile: OptimizationProfile): OptimizationConfig {
  return PROFILE_CONFIGS[profile] ?? PROFILE_CONFIGS.baseline;
}

/**
 * Apply optimization to a request
 * Returns the optimized configuration and projected savings
 */
export function optimize(request: OptimizeRequest): OptimizeResponse {
  const config = getOptimizationConfig(request.profile);
  const savings = PROFILE_SAVINGS[request.profile] ?? PROFILE_SAVINGS.baseline;

  return {
    profile: request.profile,
    config,
    projected_savings_pct: savings.cost,
    projected_latency_reduction_pct: savings.latency,
  };
}

/**
 * Check if optimization should be applied for a workload
 */
export function shouldOptimize(profile: OptimizationProfile, enabled: boolean): boolean {
  return enabled && profile !== "baseline";
}

/**
 * Get human-readable description for a profile
 */
export function getProfileDescription(profile: OptimizationProfile): string {
  switch (profile) {
    case "baseline":
      return "Standard inference with prefix caching. No aggressive optimizations.";
    case "tuned":
      return "Quantized model (Q4_K) + in-flight batching + chunked prefill. ~30% cost reduction.";
    case "aggressive":
      return "Tuned profile + speculative decoding. Maximum optimization (~40% savings).";
    default:
      return "Unknown profile";
  }
}

/**
 * Validate that a string is a valid optimization profile
 */
export function isValidProfile(value: string): value is OptimizationProfile {
  return value === "baseline" || value === "tuned" || value === "aggressive";
}

/**
 * Parse a profile string with fallback to baseline
 */
export function parseProfile(value: string | undefined | null): OptimizationProfile {
  if (!value) return "baseline";
  const normalized = value.trim().toLowerCase();
  return isValidProfile(normalized) ? normalized : "baseline";
}
