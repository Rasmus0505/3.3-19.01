function withBase(path, baseUrl = "") {
  const safeBase = String(baseUrl || "").trim().replace(/\/+$/, "");
  if (!safeBase) return String(path || "");
  const normalizedPath = String(path || "");
  if (normalizedPath.startsWith("http://") || normalizedPath.startsWith("https://")) {
    return normalizedPath;
  }
  return normalizedPath.startsWith("/") ? `${safeBase}${normalizedPath}` : `${safeBase}/${normalizedPath}`;
}

function normalizeAmount(value, fallback = 0) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : fallback;
}

function parseErrorText(payload, fallback) {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  const message = String(payload?.message || payload?.detail || payload?.error_message || "").trim();
  const errorCode = String(payload?.error_code || "").trim();
  if (message && errorCode) {
    return `${errorCode}: ${message}`;
  }
  return message || fallback;
}

async function parseJsonSafely(response) {
  try {
    return await response.json();
  } catch (_) {
    return {};
  }
}

export function estimateChargeCentsBySeconds(seconds, pricePerMinuteCents) {
  const safeSeconds = Math.max(0, Math.ceil(normalizeAmount(seconds, 0)));
  const safePricePerMinuteCents = Math.max(0, Math.ceil(normalizeAmount(pricePerMinuteCents, 0)));
  if (safeSeconds <= 0 || safePricePerMinuteCents <= 0) {
    return 0;
  }
  return Math.ceil((safeSeconds * safePricePerMinuteCents) / 60);
}

export class BillingService {
  constructor({ accessToken = "", baseUrl = "", fetchImpl } = {}) {
    this.accessToken = String(accessToken || "").trim();
    this.baseUrl = String(baseUrl || "").trim();
    this.fetchImpl = typeof fetchImpl === "function" ? fetchImpl : globalThis.fetch;
  }

  async request(path, options = {}) {
    if (typeof this.fetchImpl !== "function") {
      throw new Error("Fetch API is unavailable");
    }
    const headers = new Headers(options.headers || {});
    if (this.accessToken) {
      headers.set("Authorization", `Bearer ${this.accessToken}`);
    }
    if (options.body != null && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    const response = await this.fetchImpl(withBase(path, this.baseUrl), {
      ...options,
      method: String(options.method || "GET").toUpperCase(),
      headers,
      body:
        options.body == null || typeof options.body === "string" || options.body instanceof FormData
          ? options.body
          : JSON.stringify(options.body),
    });
    const payload = await parseJsonSafely(response);
    if (!response.ok) {
      throw new Error(parseErrorText(payload, `Request failed (${response.status})`));
    }
    return payload;
  }

  async checkBalance() {
    const payload = await this.request("/api/wallet/balance");
    return {
      ok: payload?.ok !== false,
      balance: normalizeAmount(payload?.balance ?? payload?.balance_amount_cents, 0),
      balanceAmountCents: normalizeAmount(payload?.balance_amount_cents ?? payload?.balance, 0),
      currency: String(payload?.currency || "CNY").trim() || "CNY",
      updatedAt: String(payload?.updated_at || "").trim(),
    };
  }

  async getRates() {
    const payload = await this.request("/api/billing/rates");
    return Array.isArray(payload?.rates) ? payload.rates : [];
  }

  async canGenerate(estimatedSeconds, options = {}) {
    const [balanceSnapshot, rates] = await Promise.all([this.checkBalance(), this.getRates()]);
    const targetModelName = String(options.modelName || "faster-whisper-medium").trim();
    const rate = rates.find((item) => String(item?.model_name || "").trim() === targetModelName && item?.is_active);
    const pricePerMinuteCents = normalizeAmount(rate?.price_per_minute_cents ?? rate?.points_per_minute, 0);
    const estimatedChargeCents = estimateChargeCentsBySeconds(estimatedSeconds, pricePerMinuteCents);
    return {
      ok: true,
      balance: balanceSnapshot.balance,
      balanceAmountCents: balanceSnapshot.balanceAmountCents,
      currency: balanceSnapshot.currency,
      estimatedChargeCents,
      canGenerate: estimatedChargeCents <= 0 || balanceSnapshot.balanceAmountCents >= estimatedChargeCents,
      rate,
    };
  }

  async reportUsage(courseId, actualSeconds, options = {}) {
    return this.request("/api/wallet/consume", {
      method: "POST",
      body: {
        courseId,
        actualSeconds,
        modelName: String(options.modelName || "faster-whisper-medium").trim(),
        runtimeKind: String(options.runtimeKind || "").trim(),
      },
    });
  }
}
