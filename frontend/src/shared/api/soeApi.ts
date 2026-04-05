import { parseResponse } from "./client";

export interface SOEPhoneResult {
  phone: string;
  reference_phone: string;
  reference_letter: string; // 对应的原文字母，如 "s"
  pronunciation_score: number;
  start_time: number;
  end_time: number;
  match_tag: number; // 0=匹配 1=新增 2=缺少 3=错读 4=未录入
  detected_stress: boolean;
  is_stress: boolean;
}

export interface SOEWordResult {
  word: string;                  // 识别出的单词，如 "first"
  reference_word: string;        // 参考文本中的原词，如 "1st"
  pronunciation_score: number;   // 单词精准度 [0-100]
  fluency_score: number;         // 单词流利度 [0-100]
  integrity_score: number;       // 单词完整度 [0-100]
  start_time: number;            // 开始时间 ms
  end_time: number;             // 结束时间 ms
  match_tag: number;             // 0=匹配 1=新增 2=缺少 3=错读 4=未录入
  is_keyword: boolean;
  phone_results: SOEPhoneResult[];
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
  // 单词匹配统计
  matched_word_count?: number;
  total_word_count?: number;
  added_word_count?: number;
  missing_word_count?: number;
  misread_word_count?: number;
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