const state = {
  activeRunId: null,
  eventSource: null,
  runs: [],
  models: [],
};

const refs = {
  modelSelect: document.querySelector("#modelSelect"),
  modelList: document.querySelector("#modelList"),
  historyList: document.querySelector("#historyList"),
  runForm: document.querySelector("#runForm"),
  mediaInput: document.querySelector("#mediaInput"),
  downloadModelsButton: document.querySelector("#downloadModelsButton"),
  runButton: document.querySelector("#runButton"),
  refreshButton: document.querySelector("#refreshButton"),
  eventLog: document.querySelector("#eventLog"),
  progressBar: document.querySelector("#progressBar"),
  progressLabel: document.querySelector("#progressLabel"),
  progressPercent: document.querySelector("#progressPercent"),
  elapsedValue: document.querySelector("#elapsedValue"),
  liveRunMeta: document.querySelector("#liveRunMeta"),
  resultMeta: document.querySelector("#resultMeta"),
  metricsGrid: document.querySelector("#metricsGrid"),
  transcriptOutput: document.querySelector("#transcriptOutput"),
  subtitleOutput: document.querySelector("#subtitleOutput"),
  downloadTranscriptLink: document.querySelector("#downloadTranscriptLink"),
  downloadSubtitleLink: document.querySelector("#downloadSubtitleLink"),
  downloadMetricsLink: document.querySelector("#downloadMetricsLink"),
};

function escapeHtml(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function fmt(value, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "-";
  }
  return Number(value).toFixed(digits);
}

async function getJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try {
      const body = await response.json();
      detail = body.detail || JSON.stringify(body);
    } catch {
      detail = await response.text();
    }
    throw new Error(detail);
  }
  return response.json();
}

function setProgress(percent, label, elapsedSeconds) {
  const safePercent = Math.max(0, Math.min(100, Number(percent || 0)));
  refs.progressBar.style.width = `${safePercent}%`;
  refs.progressPercent.textContent = `${safePercent.toFixed(0)}%`;
  refs.progressLabel.textContent = label || "Waiting";
  refs.elapsedValue.textContent = `${fmt(elapsedSeconds || 0, 1)}s`;
}

function appendLog(line) {
  const next = refs.eventLog.textContent === "Waiting for a run." ? line : `${refs.eventLog.textContent}\n${line}`;
  refs.eventLog.textContent = next;
  refs.eventLog.scrollTop = refs.eventLog.scrollHeight;
}

function renderModels() {
  refs.modelSelect.innerHTML = "";
  refs.modelList.innerHTML = state.models
    .map((item) => {
      const option = document.createElement("option");
      option.value = item.key;
      option.textContent = `${item.label} (${item.key})`;
      refs.modelSelect.appendChild(option);

      return `
        <article class="model-card">
          <div class="panel-heading">
            <div>
              <strong>${escapeHtml(item.label)}</strong>
              <p>${escapeHtml(item.description)}</p>
            </div>
            <span class="status-pill ${item.downloaded ? "" : "missing"}">${item.downloaded ? "ready" : "missing"}</span>
          </div>
          <p><code>${escapeHtml(item.repo_id)}</code></p>
          <p><code>${escapeHtml(item.local_path)}</code></p>
        </article>
      `;
    })
    .join("");
}

function renderHistory() {
  refs.historyList.innerHTML = state.runs
    .map(
      (item) => `
        <article class="history-item ${item.run_id === state.activeRunId ? "active" : ""}" data-run-id="${escapeHtml(item.run_id)}">
          <div class="panel-heading">
            <div>
              <strong>${escapeHtml(item.model_label || item.model_key)}</strong>
              <p>${escapeHtml(item.file_name || "")}</p>
            </div>
            <span class="status-pill ${item.status === "completed" ? "" : "missing"}">${escapeHtml(item.status)}</span>
          </div>
          <p>${escapeHtml(item.created_at || "")}</p>
          <p>elapsed: ${fmt(item.elapsed_seconds, 2)}s | rtf: ${fmt(item.rtf, 3)} | segments: ${item.segment_count ?? "-"}</p>
          <p>${escapeHtml((item.preview_text || "").slice(0, 160))}</p>
        </article>
      `,
    )
    .join("");

  refs.historyList.querySelectorAll(".history-item").forEach((node) => {
    node.addEventListener("click", () => selectRun(node.dataset.runId));
  });
}

function renderMetrics(metrics) {
  const rows = [
    ["Audio seconds", fmt(metrics.audio_seconds, 2)],
    ["Elapsed seconds", fmt(metrics.elapsed_seconds, 2)],
    ["RTF", fmt(metrics.rtf, 4)],
    ["Segments", metrics.segment_count ?? "-"],
    ["Language", metrics.language || "-"],
    ["Confidence", fmt(metrics.language_probability, 4)],
  ];
  refs.metricsGrid.innerHTML = rows
    .map(
      ([label, value]) => `
        <article class="metric-card">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
        </article>
      `,
    )
    .join("");
}

async function loadModels() {
  const payload = await getJson("/api/asr-test/models");
  state.models = payload.items || [];
  renderModels();
}

async function loadRuns() {
  const payload = await getJson("/api/asr-test/runs");
  state.runs = payload.items || [];
  renderHistory();
}

function setDownloadLink(node, href) {
  if (!href) {
    node.classList.add("disabled");
    node.href = "#";
    return;
  }
  node.classList.remove("disabled");
  node.href = href;
}

async function selectRun(runId) {
  const payload = await getJson(`/api/asr-test/runs/${encodeURIComponent(runId)}`);
  state.activeRunId = runId;
  renderHistory();
  const item = payload.item;
  refs.resultMeta.textContent = `${item.result.model_label || item.input.model_key} | ${item.input.source_name || ""} | ${item.status}`;
  refs.transcriptOutput.textContent = item.artifacts.transcript || "";
  refs.subtitleOutput.textContent = item.artifacts.subtitle || "";
  renderMetrics(item.metrics || {});
  setDownloadLink(refs.downloadTranscriptLink, `/api/asr-test/runs/${encodeURIComponent(runId)}/artifact/transcript.txt`);
  setDownloadLink(refs.downloadSubtitleLink, `/api/asr-test/runs/${encodeURIComponent(runId)}/artifact/subtitle.srt`);
  setDownloadLink(refs.downloadMetricsLink, `/api/asr-test/runs/${encodeURIComponent(runId)}/artifact/metrics.json`);
}

function closeEventStream() {
  if (state.eventSource) {
    state.eventSource.close();
    state.eventSource = null;
  }
}

function watchRun(runId, modelKey, fileName) {
  closeEventStream();
  state.activeRunId = runId;
  refs.liveRunMeta.textContent = `${modelKey} | ${fileName}`;
  refs.eventLog.textContent = "";
  setProgress(0, "Queued", 0);

  const source = new EventSource(`/api/asr-test/runs/${encodeURIComponent(runId)}/events`);
  state.eventSource = source;
  source.onmessage = async (event) => {
    const payload = JSON.parse(event.data);
    appendLog(`[${payload.created_at}] ${payload.event_type}: ${payload.message}`);
    setProgress(payload.percent || 0, payload.message, payload.elapsed_seconds || 0);
    if (payload.event_type === "completed" || payload.event_type === "failed") {
      closeEventStream();
      await loadRuns();
      await selectRun(runId);
    }
  };
}

async function handleRunSubmit(event) {
  event.preventDefault();
  const file = refs.mediaInput.files?.[0];
  if (!file) {
    window.alert("Choose a media file first.");
    return;
  }

  const form = new FormData();
  form.append("model_key", refs.modelSelect.value);
  form.append("media_file", file);

  refs.runButton.disabled = true;
  refs.runButton.textContent = "Uploading...";
  try {
    const payload = await getJson("/api/asr-test/upload-and-run", {
      method: "POST",
      body: form,
    });
    await loadRuns();
    watchRun(payload.run_id, refs.modelSelect.value, file.name);
  } catch (error) {
    window.alert(error.message);
  } finally {
    refs.runButton.disabled = false;
    refs.runButton.textContent = "Run ASR";
  }
}

async function handleDownloadModels() {
  refs.downloadModelsButton.disabled = true;
  refs.downloadModelsButton.textContent = "Downloading...";
  try {
    const form = new FormData();
    await getJson("/api/asr-test/models/download", { method: "POST", body: form });
    await loadModels();
    window.alert("Models downloaded.");
  } catch (error) {
    window.alert(error.message);
  } finally {
    refs.downloadModelsButton.disabled = false;
    refs.downloadModelsButton.textContent = "Download models";
  }
}

async function bootstrap() {
  refs.runForm.addEventListener("submit", handleRunSubmit);
  refs.downloadModelsButton.addEventListener("click", handleDownloadModels);
  refs.refreshButton.addEventListener("click", async () => {
    await loadModels();
    await loadRuns();
  });

  await loadModels();
  await loadRuns();
  if (state.runs.length > 0) {
    await selectRun(state.runs[0].run_id);
  }
}

bootstrap().catch((error) => {
  refs.eventLog.textContent = `Bootstrap failed: ${error.message}`;
});
