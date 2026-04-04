import { parseResponse } from "./client";

export interface SOEWordResult {
  word: string;
  score: number;
  status?: string;
  start_ms?: number;
  end_ms?: number;
}

export interface SOEResult {
  ok: boolean;
  voice_id?: string;
  ref_text?: string;
  user_text?: string;
  total_score?: number;
  pronunciation_score?: number;
  fluency_score?: number;
  completeness_score?: number;
  word_results?: SOEWordResult[];
  saved_result_id?: string;
  error_code?: string;
  message?: string;
  detail?: string;
}

export interface SOEHistoryParams {
  lesson_id?: string;
  limit?: number;
  offset?: number;
}

export async function assessSentence(
  client: ReturnType<typeof import("./client").createApiClient>,
  audioBlob: Blob,
  refText: string,
  sentenceId?: string,
  lessonId?: string,
): Promise<SOEResult> {
  const formData = new FormData();
  formData.append("audio_file", audioBlob, "recording.webm");
  formData.append("ref_text", refText);
  if (sentenceId) {
    formData.append("sentence_id", sentenceId);
  }
  if (lessonId) {
    formData.append("lesson_id", lessonId);
  }

  const resp = await client("/api/soe/assess", {
    method: "POST",
    body: formData,
  });

  return parseResponse(resp) as SOEResult;
}

export async function getSoeHistory(
  client: ReturnType<typeof import("./client").createApiClient>,
  params?: SOEHistoryParams,
): Promise<SOEResult[]> {
  const searchParams = new URLSearchParams();
  if (params?.lesson_id) {
    searchParams.append("lesson_id", params.lesson_id);
  }
  if (params?.limit != null) {
    searchParams.append("limit", String(params.limit));
  }
  if (params?.offset != null) {
    searchParams.append("offset", String(params.offset));
  }

  const query = searchParams.toString();
  const path = query ? `/api/soe/history?${query}` : "/api/soe/history";

  const resp = await client(path, { method: "GET" });
  const data = (await parseResponse(resp)) as { results?: SOEResult[] };
  return Array.isArray(data.results) ? data.results : [];
}