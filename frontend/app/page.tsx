"use client";

import { FormEvent, useMemo, useState } from "react";

type Mode = "route" | "infer";
type StatusKind = "idle" | "loading" | "success" | "error";

type ProviderInput = {
  id: number;
  name: string;
  endpoint: string;
  apiKey: string;
  price: number;
  latency: number;
  availability: number;
};

type SelectedProvider = {
  name?: string;
  endpoint?: string;
  api_key_preview?: string;
  total_score?: number;
};

type RankingItem = {
  name: string;
  total_score: number;
  cost_score: number;
  latency_score: number;
  availability_score: number;
};

type APIData = {
  selected_provider?: SelectedProvider;
  rankings?: RankingItem[];
  provider_response?: unknown;
  error?: string;
  [key: string]: unknown;
};

const demoProviders: Omit<ProviderInput, "id">[] = [
  {
    name: "runpod",
    endpoint: "https://api.runpod.ai/v2/YOUR_ENDPOINT/runsync",
    apiKey: "",
    price: 0.024,
    latency: 420,
    availability: 0.99,
  },
  {
    name: "huggingface",
    endpoint: "https://api-inference.huggingface.co/models/meta-llama/Llama-3.1-8B-Instruct",
    apiKey: "",
    price: 0.03,
    latency: 380,
    availability: 0.98,
  },
];

const statusText: Record<StatusKind, string> = {
  idle: "Idle",
  loading: "Running",
  success: "Success",
  error: "Failed",
};

function num(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

export default function Home() {
  const [prompt, setPrompt] = useState("Write a concise 2-line launch note for Infetrix.");
  const [model, setModel] = useState("llama-3.1-8b-instruct");
  const [policy, setPolicy] = useState("balanced");
  const [mode, setMode] = useState<Mode>("infer");
  const [maxTokens, setMaxTokens] = useState(128);
  const [temperature, setTemperature] = useState(0.7);
  const [providers, setProviders] = useState<ProviderInput[]>(() =>
    demoProviders.map((provider, index) => ({ ...provider, id: index + 1 })),
  );

  const [status, setStatus] = useState<StatusKind>("idle");
  const [selected, setSelected] = useState<SelectedProvider | null>(null);
  const [rankings, setRankings] = useState<RankingItem[]>([]);
  const [responsePreview, setResponsePreview] = useState("No response yet.");
  const [error, setError] = useState<string>("");

  const statusClass = useMemo(() => {
    if (status === "loading") return "statusPill statusLoading";
    if (status === "success") return "statusPill statusSuccess";
    if (status === "error") return "statusPill statusError";
    return "statusPill statusIdle";
  }, [status]);

  function addProvider() {
    setProviders((prev) => {
      const nextID = prev.length ? Math.max(...prev.map((p) => p.id)) + 1 : 1;
      return [
        ...prev,
        {
          id: nextID,
          name: "",
          endpoint: "",
          apiKey: "",
          price: 0.02,
          latency: 350,
          availability: 0.99,
        },
      ];
    });
  }

  function removeProvider(id: number) {
    setProviders((prev) => {
      if (prev.length === 1) return prev;
      return prev.filter((provider) => provider.id !== id);
    });
  }

  function updateProvider<K extends keyof Omit<ProviderInput, "id">>(
    id: number,
    field: K,
    value: ProviderInput[K],
  ) {
    setProviders((prev) => prev.map((provider) => (provider.id === id ? { ...provider, [field]: value } : provider)));
  }

  function loadDemo() {
    setPrompt("Write a concise 2-line launch note for Infetrix.");
    setModel("llama-3.1-8b-instruct");
    setPolicy("balanced");
    setMode("infer");
    setMaxTokens(128);
    setTemperature(0.7);
    setProviders(demoProviders.map((provider, index) => ({ ...provider, id: index + 1 })));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");
    if (!prompt.trim() || !model.trim()) {
      setStatus("error");
      setError("Prompt and model are required.");
      return;
    }

    const validProviders = providers
      .filter((provider) => provider.name.trim().length > 0)
      .map((provider) => ({
        name: provider.name.trim(),
        endpoint: provider.endpoint.trim(),
        api_key: provider.apiKey.trim(),
        price_per_1k_tokens: num(provider.price, 0),
        avg_latency_ms: num(provider.latency, 0),
        availability: num(provider.availability, 0),
      }));

    if (validProviders.length === 0) {
      setStatus("error");
      setError("Add at least one provider with a name.");
      return;
    }

    const payload: Record<string, unknown> = {
      prompt: prompt.trim(),
      model: model.trim(),
      policy,
      providers: validProviders,
    };

    if (mode === "infer") {
      payload.max_tokens = num(maxTokens, 128);
      payload.temperature = num(temperature, 0.7);
    }

    setStatus("loading");

    try {
      const response = await fetch(mode === "infer" ? "/api/infer" : "/api/route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const text = await response.text();
      const data: APIData = text ? (JSON.parse(text) as APIData) : {};

      setSelected(data.selected_provider ?? null);
      setRankings(Array.isArray(data.rankings) ? data.rankings : []);

      if (mode === "infer") {
        setResponsePreview(
          JSON.stringify(data.provider_response ?? { note: "No provider response payload." }, null, 2),
        );
      } else {
        setResponsePreview("Route mode: no provider dispatch executed.");
      }

      if (!response.ok) {
        setStatus("error");
        setError(typeof data.error === "string" ? data.error : "Request failed.");
        return;
      }

      setStatus("success");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Unexpected error.");
    }
  }

  return (
    <div className="app">
      <div className="bgOrb bgOrbA" />
      <div className="bgOrb bgOrbB" />
      <div className="grain" />

      <header className="topbar reveal">
        <div className="logoWrap">
          <div className="logoMark">IFX</div>
          <div>
            <p className="logoTitle">Infetrix</p>
            <p className="logoSub">BYOK Inference Router</p>
          </div>
        </div>
        <span className="topPill">Next.js + TypeScript Frontend</span>
      </header>

      <main className="shell">
        <section className="hero reveal delay1">
          <p className="eyebrow">Simple workflow. Serious performance.</p>
          <h1>Route once. Pay less. Stay fast.</h1>
          <p className="heroCopy">
            Enter prompt + providers, choose policy, run. Infetrix decides who is cheapest and fastest right now.
          </p>
        </section>

        <section className="workspace reveal delay2">
          <section className="panel">
            <form onSubmit={handleSubmit}>
              <div className="stepHead">
                <span className="stepIndex">01</span>
                <div>
                  <h2>Input</h2>
                  <p>Prompt, model, and routing strategy.</p>
                </div>
              </div>

              <label className="label">Prompt</label>
              <textarea
                className="textarea"
                rows={5}
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
              />

              <div className="row rowTwo">
                <div>
                  <label className="label">Model</label>
                  <input
                    className="input"
                    value={model}
                    onChange={(event) => setModel(event.target.value)}
                  />
                </div>
                <div>
                  <label className="label">Policy</label>
                  <select
                    className="select"
                    value={policy}
                    onChange={(event) => setPolicy(event.target.value)}
                  >
                    <option value="balanced">balanced</option>
                    <option value="cost">cost</option>
                    <option value="latency">latency</option>
                  </select>
                </div>
              </div>

              <div className="row rowTwo">
                <div>
                  <label className="label">Mode</label>
                  <select
                    className="select"
                    value={mode}
                    onChange={(event) => setMode(event.target.value as Mode)}
                  >
                    <option value="infer">infer (route + dispatch)</option>
                    <option value="route">route only</option>
                  </select>
                </div>
                <div className="hintBox">
                  <p className="hintTitle">Workflow</p>
                  <p className="hintCopy">1 click from input to ranked result.</p>
                </div>
              </div>

              <div className="stepHead stepHeadCompact">
                <span className="stepIndex">02</span>
                <div>
                  <h2>Providers</h2>
                  <p>Add as many candidates as you want.</p>
                </div>
              </div>

              <div className="providerList">
                {providers.map((provider) => (
                  <div className="providerItem" key={provider.id}>
                    <div className="providerHead">
                      <p className="providerLabel">Provider</p>
                      <button className="removeProvider" type="button" onClick={() => removeProvider(provider.id)}>
                        Remove
                      </button>
                    </div>

                    <div className="row rowTwo">
                      <div>
                        <label className="label">Name</label>
                        <input
                          className="input"
                          value={provider.name}
                          onChange={(event) => updateProvider(provider.id, "name", event.target.value)}
                          placeholder="runpod"
                        />
                      </div>
                      <div>
                        <label className="label">Endpoint</label>
                        <input
                          className="input"
                          value={provider.endpoint}
                          onChange={(event) => updateProvider(provider.id, "endpoint", event.target.value)}
                          placeholder="https://..."
                        />
                      </div>
                    </div>

                    <div className="row rowTwo">
                      <div>
                        <label className="label">API Key</label>
                        <input
                          className="input"
                          type="password"
                          value={provider.apiKey}
                          onChange={(event) => updateProvider(provider.id, "apiKey", event.target.value)}
                          placeholder="***"
                        />
                      </div>
                      <div>
                        <label className="label">Price / 1k</label>
                        <input
                          className="input"
                          type="number"
                          step="0.001"
                          value={provider.price}
                          onChange={(event) => updateProvider(provider.id, "price", Number(event.target.value))}
                        />
                      </div>
                    </div>

                    <div className="row rowTwo">
                      <div>
                        <label className="label">Latency (ms)</label>
                        <input
                          className="input"
                          type="number"
                          value={provider.latency}
                          onChange={(event) => updateProvider(provider.id, "latency", Number(event.target.value))}
                        />
                      </div>
                      <div>
                        <label className="label">Availability (0-1)</label>
                        <input
                          className="input"
                          type="number"
                          min="0"
                          max="1"
                          step="0.001"
                          value={provider.availability}
                          onChange={(event) => updateProvider(provider.id, "availability", Number(event.target.value))}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <button className="button buttonGhost" type="button" onClick={addProvider}>
                Add Provider
              </button>

              {mode === "infer" && (
                <div className="row rowTwo">
                  <div>
                    <label className="label">Max Tokens</label>
                    <input
                      className="input"
                      type="number"
                      min="1"
                      value={maxTokens}
                      onChange={(event) => setMaxTokens(Number(event.target.value))}
                    />
                  </div>
                  <div>
                    <label className="label">Temperature</label>
                    <input
                      className="input"
                      type="number"
                      min="0"
                      max="2"
                      step="0.1"
                      value={temperature}
                      onChange={(event) => setTemperature(Number(event.target.value))}
                    />
                  </div>
                </div>
              )}

              <div className="actionRow">
                <button className="button buttonPrimary" type="submit" disabled={status === "loading"}>
                  {status === "loading" ? "Running..." : "Run Infetrix"}
                </button>
                <button className="button buttonGhost" type="button" onClick={loadDemo}>
                  Load Demo
                </button>
              </div>
            </form>
          </section>

          <section className="panel">
            <div className="stepHead">
              <span className="stepIndex">03</span>
              <div>
                <h2>Result</h2>
                <p>Selected provider, ranking, and response.</p>
              </div>
            </div>

            <div className="statusLine">
              <span className={statusClass}>{statusText[status]}</span>
            </div>

            <article className="resultCard">
              <p className="resultTitle">Selected Provider</p>
              {selected ? (
                <>
                  <p className="selectedHead">{selected.name ?? "-"}</p>
                  <p className="selectedMeta">Score: {Number(selected.total_score ?? 0).toFixed(4)}</p>
                  <p className="selectedMeta">Endpoint: {selected.endpoint ?? "n/a"}</p>
                  <p className="selectedMeta">Key preview: {selected.api_key_preview ?? "n/a"}</p>
                </>
              ) : (
                <p className="resultEmpty">No run yet.</p>
              )}
            </article>

            <div className="tableWrap">
              <table className="table">
                <thead>
                  <tr>
                    <th className="th">Provider</th>
                    <th className="th">Total</th>
                    <th className="th">Cost</th>
                    <th className="th">Latency</th>
                    <th className="th">Avail</th>
                  </tr>
                </thead>
                <tbody>
                  {rankings.length > 0 ? (
                    rankings.map((item) => (
                      <tr key={item.name}>
                        <td className="td">{item.name}</td>
                        <td className="td">{Number(item.total_score).toFixed(4)}</td>
                        <td className="td">{Number(item.cost_score).toFixed(4)}</td>
                        <td className="td">{Number(item.latency_score).toFixed(4)}</td>
                        <td className="td">{Number(item.availability_score).toFixed(4)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="td muted" colSpan={5}>
                        No ranking data yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <p className="resultTitle">Provider Response</p>
            <pre className="responseBox">{responsePreview}</pre>

            {error ? <pre className="errorBox">{error}</pre> : null}
          </section>
        </section>
      </main>
    </div>
  );
}
