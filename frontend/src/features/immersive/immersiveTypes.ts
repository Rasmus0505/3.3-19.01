// 沉浸式学习类型定义。

export interface ImmersiveLesson {
  id: number;
  title: string;
  mediaUrl: string;
  mediaType: 'audio' | 'video';
  sentences: Sentence[];
  duration: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface Sentence {
  id: string;
  index: number;
  beginTime: number;
  endTime: number;
  text: string;
  translation?: string;
  words?: Word[];
  difficultyLevel?: string;
  difficulty?: number;
}

export interface Word {
  text: string;
  beginTime: number;
  endTime: number;
  surface?: string;
  punctuation?: string;
}

export interface LearningSettings {
  playbackRate: number;
  autoPlay: boolean;
  showTranslation: boolean;
  translationDisplayMode: 'hover' | 'always' | 'never';
  repeatEnabled: boolean;
  repeatCount: number;
}

export interface QuizQuestion {
  id: string;
  sentenceId: string;
  type: 'fill-blank' | 'multiple-choice' | 'translation';
  question: string;
  options?: string[];
  correctAnswer: string;
  userAnswer?: string;
  isCorrect?: boolean;
}

export interface SoeAssessment {
  sentenceId: string;
  audioUrl?: string;
  score?: number;
  feedback?: string;
  recordingUrl?: string;
}

export type TranslationDisplayMode = 'hover' | 'always' | 'never';


