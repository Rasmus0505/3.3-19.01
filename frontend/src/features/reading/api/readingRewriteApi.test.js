import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMock = vi.fn();

vi.mock("../../../shared/api/client.js", () => ({
  api: (...args) => apiMock(...args),
}));

import { simplifyWords } from "./readingRewriteApi";

describe("readingRewriteApi simplifyWords", () => {
  beforeEach(() => {
    apiMock.mockReset();
  });

  it("surfaces stable backend detail instead of raw parser text", async () => {
    apiMock.mockResolvedValue(
      new Response(JSON.stringify({ detail: "模型响应格式错误，请稍后重试" }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(
      simplifyWords("I enjoy perusing newspapers.", ["perusing"], "B1", "token"),
    ).rejects.toMatchObject({
      name: "ReadingRewriteApiError",
      message: "模型响应格式错误，请稍后重试",
      debug: expect.objectContaining({
        endpoint: "/api/llm/simplify-words",
        status: 502,
        words: ["perusing"],
        targetLevel: "B1",
      }),
    });
  });

  it("keeps raw response text in debug payload when the backend body is not JSON", async () => {
    apiMock.mockResolvedValue(
      new Response("bad gateway", {
        status: 502,
        headers: { "Content-Type": "text/plain" },
      }),
    );

    await expect(
      simplifyWords("I enjoy perusing newspapers.", ["perusing"], "B1", "token"),
    ).rejects.toMatchObject({
      name: "ReadingRewriteApiError",
      message: "简化词汇请求失败",
      debug: expect.objectContaining({
        rawText: "bad gateway",
        detail: "",
      }),
    });
  });
});
