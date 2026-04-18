import { describe, expect, it, vi } from "vitest";

import { assessSentence, getSoeHistory } from "./soeApi";

describe("soeApi", () => {
  it("passes access token through assessSentence", async () => {
    const client = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, total_score: 88 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await assessSentence(
      client,
      new Blob(["voice"], { type: "audio/webm" }),
      "hello world",
      "3",
      "9",
      "token-123",
    );

    expect(result).toMatchObject({ ok: true, total_score: 88 });
    expect(client).toHaveBeenCalledTimes(1);
    expect(client).toHaveBeenCalledWith(
      "/api/soe/assess",
      expect.objectContaining({
        method: "POST",
        body: expect.any(FormData),
      }),
      "token-123",
    );
  });

  it("passes access token through getSoeHistory", async () => {
    const client = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ results: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await getSoeHistory(
      client,
      { lesson_id: "5", limit: 10, offset: 0 },
      "token-456",
    );

    expect(client).toHaveBeenCalledTimes(1);
    expect(client).toHaveBeenCalledWith(
      "/api/soe/history?lesson_id=5&limit=10&offset=0",
      { method: "GET" },
      "token-456",
    );
  });
});


