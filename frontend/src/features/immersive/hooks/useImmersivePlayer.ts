// 沉浸式学习播放器 Hook。
// 管理播放器的核心状态逻辑。

import { useState, useCallback, useRef, useMemo } from 'react';
import type { ImmersiveLesson, Sentence, Word } from '../immersiveTypes';

export interface PlayerState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
  volume: number;
  isMuted: boolean;
  currentSentenceIndex: number;
  isFullscreen: boolean;
  isLooping: boolean;
}

export interface ImmersiveLesson {
  id: number;
  title: string;
  mediaUrl: string;
  mediaType: 'audio' | 'video';
  sentences: Sentence[];
  duration: number;
}

export interface Sentence {
  id: string;
  index: number;
  beginTime: number;
  endTime: number;
  text: string;
  translation?: string;
  words?: Word[];
}

export interface Word {
  text: string;
  beginTime: number;
  endTime: number;
}

export function useImmersivePlayer(lesson: ImmersiveLesson | null) {
  const [state, setState] = useState<PlayerState>({
    isPlaying: false,
    currentTime: 0,
    duration: lesson?.duration || 0,
    playbackRate: 1.0,
    volume: 1.0,
    isMuted: false,
    currentSentenceIndex: -1,
    isFullscreen: false,
    isLooping: false,
  });

  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const currentSentence = useMemo(() => {
    if (!lesson || state.currentSentenceIndex < 0) return null;
    return lesson.sentences[state.currentSentenceIndex] || null;
  }, [lesson, state.currentSentenceIndex]);

  const progress = useMemo(() => {
    if (state.duration <= 0) return 0;
    return (state.currentTime / state.duration) * 100;
  }, [state.currentTime, state.duration]);

  const play = useCallback(() => {
    mediaRef.current?.play();
    setState(prev => ({ ...prev, isPlaying: true }));
  }, []);

  const pause = useCallback(() => {
    mediaRef.current?.pause();
    setState(prev => ({ ...prev, isPlaying: false }));
  }, []);

  const togglePlay = useCallback(() => {
    if (state.isPlaying) {
      pause();
    } else {
      play();
    }
  }, [state.isPlaying, play, pause]);

  const seek = useCallback((time: number) => {
    if (mediaRef.current) {
      mediaRef.current.currentTime = time;
    }
    setState(prev => ({ ...prev, currentTime: time }));
  }, []);

  const setPlaybackRate = useCallback((rate: number) => {
    if (mediaRef.current) {
      mediaRef.current.playbackRate = rate;
    }
    setState(prev => ({ ...prev, playbackRate: rate }));
  }, []);

  const setVolume = useCallback((volume: number) => {
    if (mediaRef.current) {
      mediaRef.current.volume = volume;
    }
    setState(prev => ({
      ...prev,
      volume,
      isMuted: volume === 0,
    }));
  }, []);

  const toggleMute = useCallback(() => {
    if (mediaRef.current) {
      mediaRef.current.muted = !state.isMuted;
    }
    setState(prev => ({ ...prev, isMuted: !prev.isMuted }));
  }, [state.isMuted]);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }, []);

  const toggleLoop = useCallback(() => {
    if (mediaRef.current) {
      mediaRef.current.loop = !state.isLooping;
    }
    setState(prev => ({ ...prev, isLooping: !prev.isLooping }));
  }, [state.isLooping]);

  const jumpToSentence = useCallback((sentenceIndex: number) => {
    if (!lesson || sentenceIndex < 0 || sentenceIndex >= lesson.sentences.length) return;
    const sentence = lesson.sentences[sentenceIndex];
    seek(sentence.beginTime / 1000);
    setState(prev => ({ ...prev, currentSentenceIndex: sentenceIndex }));
  }, [lesson, seek]);

  const jumpForward = useCallback((seconds: number = 5) => {
    const newTime = Math.min(state.currentTime + seconds, state.duration);
    seek(newTime);
  }, [state.currentTime, state.duration, seek]);

  const jumpBackward = useCallback((seconds: number = 5) => {
    const newTime = Math.max(state.currentTime - seconds, 0);
    seek(newTime);
  }, [state.currentTime, seek]);

  const syncCurrentSentence = useCallback(() => {
    if (!lesson) return;
    const timeMs = state.currentTime * 1000;
    const index = lesson.sentences.findIndex(
      (s, i) => timeMs >= s.beginTime &&
        (i === lesson.sentences.length - 1 || timeMs < lesson.sentences[i + 1].beginTime)
    );
    if (index !== state.currentSentenceIndex) {
      setState(prev => ({ ...prev, currentSentenceIndex: index }));
    }
  }, [lesson, state.currentTime, state.currentSentenceIndex]);

  const cleanup = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    mediaRef.current?.pause();
    mediaRef.current = null;
  }, []);

  return {
    state,
    currentSentence,
    progress,
    mediaRef,
    actions: {
      play,
      pause,
      togglePlay,
      seek,
      setPlaybackRate,
      setVolume,
      toggleMute,
      toggleFullscreen,
      toggleLoop,
      jumpToSentence,
      jumpForward,
      jumpBackward,
      syncCurrentSentence,
      cleanup,
    },
  };
}


