import { parseResponse, toErrorText } from "./client";

export async function classifyTokensByCollins(apiClient, accessToken, tokens = [], options = {}) {
  const normalizedTokens = Array.isArray(tokens)
    ? tokens.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  if (!normalizedTokens.length) {
    return { ok: true, user_collins_level: 3, items: [] };
  }
  const response = await apiClient(
    "/api/dictionary/collins-classify",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tokens: normalizedTokens,
        include_entry: Boolean(options.includeEntry),
      }),
    },
    accessToken,
  );
  const data = await parseResponse(response);
  if (!response.ok) {
    throw new Error(toErrorText(data, "词典分级失败"));
  }
  return data;
}


