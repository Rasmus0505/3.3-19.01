/**
 * Shared SSE stream reader for course features.
 *
 * @param {Response} response - fetch Response with SSE body
 * @param {(event: string, data: object) => void} onEvent - callback per SSE event
 * @param {AbortSignal} [signal] - optional abort signal for cleanup
 */
export async function readSSEStream(response, onEvent, signal) {
  const reader = response.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      if (signal?.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      let currentEvent = "";
      for (const line of lines) {
        if (line.startsWith("event: ")) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith("data: ") && currentEvent) {
          try {
            const data = JSON.parse(line.slice(6));
            onEvent(currentEvent, data);
          } catch (e) {
            console.warn("SSE JSON parse failed:", e, line);
          }
          currentEvent = "";
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
