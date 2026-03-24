export interface LessonSentence {
  id?: number;
  order_index?: number;
  text?: string;
  translation?: string;
  start_ms?: number;
  end_ms?: number;
}

export interface Lesson {
  id: number;
  title: string;
  source_filename?: string;
  created_at?: string;
  media_storage?: string;
  sentences?: LessonSentence[];
}

export interface LessonListResponse {
  ok?: boolean;
  items: Lesson[];
  total?: number;
  page?: number;
  page_size?: number;
}
export type {
  LessonSentence,
  Lesson,
  LessonListResponse,
} from "../shared/api/types";

