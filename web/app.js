const providerList = document.getElementById("provider-list");
const providerTemplate = document.getElementById("provider-template");
const form = document.getElementById("infer-form");
const mode = document.getElementById("mode");
const runBtn = document.getElementById("run-btn");
const demoBtn = document.getElementById("demo-btn");
const addProviderBtn = document.getElementById("add-provider");
const inferOnlyFields = document.getElementById("infer-only-fields");
const statusPill = document.getElementById("status-pill");
const selectedCard = document.getElementById("selected-card");
const rankingsBody = document.getElementById("rankings-body");
const providerResponse = document.getElementById("provider-response");
const errorBox = document.getElementById("error-box");

const demoProviders = [
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

function createProviderCard(data = {}) {
  const node = providerTemplate.content.firstElementChild.cloneNode(true);
  node.querySelector('[data-field="name"]').value = data.name || "";
  node.querySelector('[data-field="endpoint"]').value = data.endpoint || "";
  node.querySelector('[data-field="apiKey"]').value = data.apiKey || "";
  node.querySelector('[data-field="price"]').value = data.price ?? 0.02;
  node.querySelector('[data-field="latency"]').value = data.latency ?? 350;
  node.querySelector('[data-field="availability"]').value = data.availability ?? 0.99;

  node.querySelector(".remove-provider").addEventListener("click", () => {
    node.remove();
    if (providerList.children.length === 0) {
      addProvider();
    }
  });

  return node;
}

function addProvider(data = {}) {
  providerList.appendChild(createProviderCard(data));
}

function setStatus(kind, text) {
  statusPill.className = `status-pill ${kind}`;
  statusPill.textContent = text;
}

function showError(value) {
  errorBox.classList.remove("hidden");
  errorBox.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function clearError() {
  errorBox.classList.add("hidden");
  errorBox.textContent = "";
}

function toggleModeUI() {
  inferOnlyFields.style.display = mode.value === "infer" ? "grid" : "none";
}

function appendTextElement(parent, tagName, className, text) {
  const el = document.createElement(tagName);
  if (className) {
    el.className = className;
  }
  el.textContent = text;
  parent.appendChild(el);
}

function renderSelected(selected) {
  selectedCard.replaceChildren();
  appendTextElement(selectedCard, "p", "result-title", "Selected Provider");

  if (!selected) {
    appendTextElement(selectedCard, "p", "result-empty", "No selection data returned.");
    return;
  }

  appendTextElement(selectedCard, "p", "selected-head", selected.name || "-");
  appendTextElement(
    selectedCard,
    "p",
    "selected-meta",
    `Score: ${Number(selected.total_score || 0).toFixed(4)}`,
  );
  appendTextElement(selectedCard, "p", "selected-meta", `Endpoint: ${selected.endpoint || "n/a"}`);
  appendTextElement(selectedCard, "p", "selected-meta", `Key preview: ${selected.api_key_preview || "n/a"}`);
}

function renderRankings(rankings) {
  rankingsBody.replaceChildren();

  if (!Array.isArray(rankings) || rankings.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 5;
    cell.className = "muted";
    cell.textContent = "No ranking data yet.";
    row.appendChild(cell);
    rankingsBody.appendChild(row);
    return;
  }

  rankings.forEach((item) => {
    const row = document.createElement("tr");
    const values = [
      item.name,
      Number(item.total_score).toFixed(4),
      Number(item.cost_score).toFixed(4),
      Number(item.latency_score).toFixed(4),
      Number(item.availability_score).toFixed(4),
    ];

    values.forEach((value) => {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.appendChild(cell);
    });
    rankingsBody.appendChild(row);
  });
}

function parseNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function collectProviders() {
  return [...providerList.querySelectorAll(".provider-item")]
    .map((row) => ({
      name: row.querySelector('[data-field="name"]').value.trim(),
      endpoint: row.querySelector('[data-field="endpoint"]').value.trim(),
      api_key: row.querySelector('[data-field="apiKey"]').value.trim(),
      price_per_1k_tokens: parseNumber(row.querySelector('[data-field="price"]').value, 0),
      avg_latency_ms: parseNumber(row.querySelector('[data-field="latency"]').value, 0),
      availability: parseNumber(row.querySelector('[data-field="availability"]').value, 0),
    }))
    .filter((p) => p.name);
}

async function requestJSON(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const raw = await response.text();
  let data;
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch (_err) {
    data = { raw };
  }
  return { response, data };
}

function loadDemo() {
  document.getElementById("prompt").value = "Write a concise 2-line launch note for Infetrix.";
  document.getElementById("model").value = "llama-3.1-8b-instruct";
  document.getElementById("policy").value = "balanced";
  document.getElementById("max-tokens").value = "128";
  document.getElementById("temperature").value = "0.7";
  providerList.replaceChildren();
  demoProviders.forEach(addProvider);
}

addProviderBtn.addEventListener("click", () => addProvider());
demoBtn.addEventListener("click", loadDemo);
mode.addEventListener("change", toggleModeUI);

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearError();

  const providers = collectProviders();
  if (providers.length === 0) {
    setStatus("error", "Error");
    showError("Add at least one provider.");
    return;
  }

  const payload = {
    prompt: document.getElementById("prompt").value.trim(),
    model: document.getElementById("model").value.trim(),
    policy: document.getElementById("policy").value,
    providers,
  };

  if (!payload.prompt || !payload.model) {
    setStatus("error", "Error");
    showError("Prompt and model are required.");
    return;
  }

  const isInfer = mode.value === "infer";
  if (isInfer) {
    payload.max_tokens = parseNumber(document.getElementById("max-tokens").value, 128);
    payload.temperature = parseNumber(document.getElementById("temperature").value, 0.7);
  }

  setStatus("loading", "Running");
  runBtn.disabled = true;
  runBtn.textContent = "Running...";

  try {
    const endpoint = isInfer ? "/v1/infer" : "/v1/route";
    const { response, data } = await requestJSON(endpoint, payload);
    renderSelected(data.selected_provider);
    renderRankings(data.rankings);

    if (isInfer) {
      providerResponse.textContent = JSON.stringify(
        data.provider_response || { note: "No provider response payload." },
        null,
        2,
      );
    } else {
      providerResponse.textContent = "Route mode: no provider dispatch executed.";
    }

    if (!response.ok) {
      setStatus("error", "Failed");
      showError(data.error || data);
      return;
    }

    setStatus("success", "Success");
  } catch (err) {
    setStatus("error", "Failed");
    showError(err.message || "Unexpected error.");
  } finally {
    runBtn.disabled = false;
    runBtn.textContent = "Run Infetrix";
  }
});

toggleModeUI();
loadDemo();
