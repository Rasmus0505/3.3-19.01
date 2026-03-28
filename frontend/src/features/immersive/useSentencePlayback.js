import { useCallback, useEffect, useRef, useState } from "react";

import {
  DEFAULT_IMMERSIVE_PLAYBACK_RATE,
  IMMERSIVE_PLAYBACK_RATE_MAX,
  IMMERSIVE_PLAYBACK_RATE_MIN,
  normalizePlaybackRate,
} from "./immersiveSessionMachine";

function normalizePlaybackPlan(playbackPlan = {}) {
  const initialRate = normalizePlaybackRate(playbackPlan?.initialRate ?? DEFAULT_IMMERSIVE_PLAYBACK_RATE);
  const rateSteps = Array.isArray(playbackPlan?.rateSteps)
    ? playbackPlan.rateSteps
        .map((item) => ({
          atSec: Math.max(0, Number(item?.atSec || 0)),
          rate: normalizePlaybackRate(item?.rate ?? DEFAULT_IMMERSIVE_PLAYBACK_RATE),
        }))
        .sort((left, right) => left.atSec - right.atSec)
    : [];
  return { initialRate, rateSteps };
}

function resetMediaRate(media) {
  if (!media) return;
  media.playbackRate = 1;
  media.defaultPlaybackRate = 1;
}

export function useSentencePlayback({
  mode,
  mediaElementRef,
  clipAudioRef,
  apiClient,
  accessToken,
  onSentenceFinished,
}) {
  const segmentEndRef = useRef(0);
  const isSegmentPlayingRef = useRef(false);
  const clipObjectUrlRef = useRef("");
  const playTokenRef = useRef(0);
  const playbackPlanRef = useRef({ initialRate: 1, rateSteps: [] });
  const nextRateStepIndexRef = useRef(0);
  const segmentStartRef = useRef(0);
  const hasActivePlaybackRef = useRef(false);
  const isPlaybackPausedRef = useRef(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPlaybackPaused, setIsPlaybackPaused] = useState(false);
  const [currentPlaybackRate, setCurrentPlaybackRate] = useState(1);

  const syncPlaybackRate = useCallback((nextRate) => {
    setCurrentPlaybackRate(
      Math.min(IMMERSIVE_PLAYBACK_RATE_MAX, Math.max(IMMERSIVE_PLAYBACK_RATE_MIN, Number(nextRate || 1))),
    );
  }, []);

  const clearClipUrl = useCallback(() => {
    if (clipObjectUrlRef.current) {
      URL.revokeObjectURL(clipObjectUrlRef.current);
      clipObjectUrlRef.current = "";
    }
  }, []);

  const applyInitialRate = useCallback((media, playbackPlan) => {
    if (!media) return;
    media.playbackRate = playbackPlan.initialRate;
    media.defaultPlaybackRate = playbackPlan.initialRate;
    syncPlaybackRate(playbackPlan.initialRate);
  }, [syncPlaybackRate]);

  const applyScheduledRateSteps = useCallback((media, currentRelativeSec) => {
    if (!media) return;
    const rateSteps = playbackPlanRef.current.rateSteps;
    while (nextRateStepIndexRef.current < rateSteps.length) {
      const nextStep = rateSteps[nextRateStepIndexRef.current];
      if (currentRelativeSec + 0.001 < nextStep.atSec) {
        break;
      }
      media.playbackRate = nextStep.rate;
      media.defaultPlaybackRate = nextStep.rate;
      syncPlaybackRate(nextStep.rate);
      nextRateStepIndexRef.current += 1;
    }
  }, [syncPlaybackRate]);

  const finishPlayback = useCallback(() => {
    isSegmentPlayingRef.current = false;
    hasActivePlaybackRef.current = false;
    isPlaybackPausedRef.current = false;
    setIsPlaying(false);
    setIsPlaybackPaused(false);
    syncPlaybackRate(1);
    resetMediaRate(mediaElementRef.current);
    resetMediaRate(clipAudioRef.current);
    onSentenceFinished?.();
  }, [clipAudioRef, mediaElementRef, onSentenceFinished, syncPlaybackRate]);

  const stopPlayback = useCallback(() => {
    isSegmentPlayingRef.current = false;
    hasActivePlaybackRef.current = false;
    isPlaybackPausedRef.current = false;
    setIsPlaying(false);
    setIsPlaybackPaused(false);
    syncPlaybackRate(1);
    playbackPlanRef.current = { initialRate: 1, rateSteps: [] };
    nextRateStepIndexRef.current = 0;
    segmentStartRef.current = 0;

    const media = mediaElementRef.current;
    if (media && !media.paused) {
      media.pause();
    }
    resetMediaRate(media);

    const clipAudio = clipAudioRef.current;
    if (clipAudio) {
      clipAudio.pause();
      clipAudio.onended = null;
      clipAudio.onerror = null;
      clipAudio.ontimeupdate = null;
    }
    resetMediaRate(clipAudio);
    clearClipUrl();
  }, [clearClipUrl, clipAudioRef, mediaElementRef, syncPlaybackRate]);

  const togglePausePlayback = useCallback(async () => {
    const media = mode === "clip" ? clipAudioRef.current : mediaElementRef.current;
    if (!media || !hasActivePlaybackRef.current) {
      return { ok: false, reason: "playback_inactive" };
    }

    if (isSegmentPlayingRef.current && !media.paused) {
      media.pause();
      isSegmentPlayingRef.current = false;
      isPlaybackPausedRef.current = true;
      setIsPlaying(false);
      setIsPlaybackPaused(true);
      return { ok: true, state: "paused" };
    }

    if (!isPlaybackPausedRef.current) {
      return { ok: false, reason: "playback_not_paused" };
    }

    applyScheduledRateSteps(media, media.currentTime - segmentStartRef.current);
    try {
      await media.play();
      isSegmentPlayingRef.current = true;
      isPlaybackPausedRef.current = false;
      setIsPlaying(true);
      setIsPlaybackPaused(false);
      return { ok: true, state: "playing" };
    } catch (error) {
      return { ok: false, reason: "autoplay_blocked", detail: String(error) };
    }
  }, [applyScheduledRateSteps, clipAudioRef, mediaElementRef, mode]);

  const onMainMediaTimeUpdate = useCallback(() => {
    if (mode === "clip") return;
    if (!isSegmentPlayingRef.current) return;

    const media = mediaElementRef.current;
    if (!media) return;

    applyScheduledRateSteps(media, media.currentTime - segmentStartRef.current);
    if (media.currentTime >= segmentEndRef.current) {
      media.pause();
      finishPlayback();
    }
  }, [applyScheduledRateSteps, finishPlayback, mediaElementRef, mode]);

  const playSentence = useCallback(
    async (sentence, playbackPlan = null) => {
      if (!sentence) {
        return { ok: false, reason: "sentence_missing" };
      }
      stopPlayback();

      const normalizedPlaybackPlan = normalizePlaybackPlan(playbackPlan || {});
      playbackPlanRef.current = normalizedPlaybackPlan;
      nextRateStepIndexRef.current = 0;

      if (mode === "clip") {
        if (!sentence.audio_url) {
          return { ok: false, reason: "clip_unavailable" };
        }
        const token = ++playTokenRef.current;
        let resp;
        try {
          resp = await apiClient(sentence.audio_url, {}, accessToken);
        } catch (error) {
          return { ok: false, reason: "clip_fetch_error", detail: String(error) };
        }
        if (!resp.ok) {
          return { ok: false, reason: "clip_fetch_failed" };
        }

        const blob = await resp.blob();
        const clipUrl = URL.createObjectURL(blob);
        clipObjectUrlRef.current = clipUrl;
        const clipAudio = clipAudioRef.current;
        if (!clipAudio) {
          return { ok: false, reason: "clip_audio_missing" };
        }

        clipAudio.src = clipUrl;
        clipAudio.currentTime = 0;
        segmentStartRef.current = 0;
        segmentEndRef.current = Number.POSITIVE_INFINITY;
        applyInitialRate(clipAudio, normalizedPlaybackPlan);
        clipAudio.onended = () => {
          if (token !== playTokenRef.current) return;
          clearClipUrl();
          finishPlayback();
        };
        clipAudio.onerror = () => {
          if (token !== playTokenRef.current) return;
          clearClipUrl();
          isSegmentPlayingRef.current = false;
          hasActivePlaybackRef.current = false;
          isPlaybackPausedRef.current = false;
          setIsPlaying(false);
          setIsPlaybackPaused(false);
          syncPlaybackRate(1);
          resetMediaRate(clipAudio);
        };
        clipAudio.ontimeupdate = () => {
          if (token !== playTokenRef.current) return;
          applyScheduledRateSteps(clipAudio, clipAudio.currentTime);
        };

        try {
          await clipAudio.play();
          isSegmentPlayingRef.current = true;
          hasActivePlaybackRef.current = true;
          isPlaybackPausedRef.current = false;
          setIsPlaying(true);
          setIsPlaybackPaused(false);
          return { ok: true };
        } catch (error) {
          clearClipUrl();
          hasActivePlaybackRef.current = false;
          isPlaybackPausedRef.current = false;
          syncPlaybackRate(1);
          resetMediaRate(clipAudio);
          return { ok: false, reason: "autoplay_blocked", detail: String(error) };
        }
      }

      const media = mediaElementRef.current;
      if (!media) {
        return { ok: false, reason: "media_not_ready" };
      }

      const startSec = Math.max(0, Number(sentence.begin_ms || 0) / 1000);
      const endSec = Math.max(startSec + 0.1, Number(sentence.end_ms || 0) / 1000);
      segmentStartRef.current = startSec;
      segmentEndRef.current = endSec;
      media.currentTime = startSec;
      applyInitialRate(media, normalizedPlaybackPlan);
      try {
        await media.play();
        isSegmentPlayingRef.current = true;
        hasActivePlaybackRef.current = true;
        isPlaybackPausedRef.current = false;
        setIsPlaying(true);
        setIsPlaybackPaused(false);
        return { ok: true };
      } catch (error) {
        hasActivePlaybackRef.current = false;
        isPlaybackPausedRef.current = false;
        syncPlaybackRate(1);
        resetMediaRate(media);
        return { ok: false, reason: "autoplay_blocked", detail: String(error) };
      }
    },
    [accessToken, apiClient, applyInitialRate, applyScheduledRateSteps, clearClipUrl, clipAudioRef, finishPlayback, mediaElementRef, mode, stopPlayback, syncPlaybackRate],
  );

  useEffect(() => {
    return () => {
      stopPlayback();
    };
  }, [stopPlayback]);

  return {
    isPlaying,
    isPlaybackPaused,
    currentPlaybackRate,
    playSentence,
    stopPlayback,
    togglePausePlayback,
    onMainMediaTimeUpdate,
  };
}
