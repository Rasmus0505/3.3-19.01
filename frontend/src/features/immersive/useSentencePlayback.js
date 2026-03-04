import { useCallback, useEffect, useRef, useState } from "react";

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
  const [isPlaying, setIsPlaying] = useState(false);

  const clearClipUrl = useCallback(() => {
    if (clipObjectUrlRef.current) {
      URL.revokeObjectURL(clipObjectUrlRef.current);
      clipObjectUrlRef.current = "";
    }
  }, []);

  const stopPlayback = useCallback(() => {
    isSegmentPlayingRef.current = false;
    setIsPlaying(false);

    const media = mediaElementRef.current;
    if (media && !media.paused) {
      media.pause();
    }

    const clipAudio = clipAudioRef.current;
    if (clipAudio) {
      clipAudio.pause();
      clipAudio.onended = null;
      clipAudio.onerror = null;
    }
    clearClipUrl();
  }, [clearClipUrl, clipAudioRef, mediaElementRef]);

  const onMainMediaTimeUpdate = useCallback(() => {
    if (mode === "clip") return;
    if (!isSegmentPlayingRef.current) return;

    const media = mediaElementRef.current;
    if (!media) return;

    if (media.currentTime >= segmentEndRef.current) {
      media.pause();
      isSegmentPlayingRef.current = false;
      setIsPlaying(false);
      onSentenceFinished?.();
    }
  }, [mediaElementRef, mode, onSentenceFinished]);

  const playSentence = useCallback(
    async (sentence) => {
      if (!sentence) {
        return { ok: false, reason: "sentence_missing" };
      }
      stopPlayback();

      if (mode === "clip") {
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
        clipAudio.onended = () => {
          if (token !== playTokenRef.current) return;
          clearClipUrl();
          isSegmentPlayingRef.current = false;
          setIsPlaying(false);
          onSentenceFinished?.();
        };
        clipAudio.onerror = () => {
          if (token !== playTokenRef.current) return;
          clearClipUrl();
          isSegmentPlayingRef.current = false;
          setIsPlaying(false);
        };

        try {
          await clipAudio.play();
          isSegmentPlayingRef.current = true;
          setIsPlaying(true);
          return { ok: true };
        } catch (error) {
          clearClipUrl();
          return { ok: false, reason: "autoplay_blocked", detail: String(error) };
        }
      }

      const media = mediaElementRef.current;
      if (!media) {
        return { ok: false, reason: "media_not_ready" };
      }

      const startSec = Math.max(0, Number(sentence.begin_ms || 0) / 1000);
      const endSec = Math.max(startSec + 0.1, Number(sentence.end_ms || 0) / 1000);
      segmentEndRef.current = endSec;
      media.currentTime = startSec;
      try {
        await media.play();
        isSegmentPlayingRef.current = true;
        setIsPlaying(true);
        return { ok: true };
      } catch (error) {
        return { ok: false, reason: "autoplay_blocked", detail: String(error) };
      }
    },
    [accessToken, apiClient, clearClipUrl, clipAudioRef, mediaElementRef, mode, onSentenceFinished, stopPlayback],
  );

  useEffect(() => {
    return () => {
      stopPlayback();
    };
  }, [stopPlayback]);

  return {
    isPlaying,
    playSentence,
    stopPlayback,
    onMainMediaTimeUpdate,
  };
}
