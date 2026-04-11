/**
 * useDiscussionTTS — Plays TTS audio for discussion messages.
 *
 * Uses /api/tts/synthesize to get audio_url, then plays via HTML Audio.
 * Teacher and Student use different voices.
 */
import { useState, useCallback, useRef, useEffect } from "react";

const TEACHER_VOICE = "loongstella-v1";
const STUDENT_VOICE = "loongman-v1";

function voiceForRole(role) {
  return role === "teacher" ? TEACHER_VOICE : STUDENT_VOICE;
}

export function useDiscussionTTS({ apiCall, accessToken }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const audioRef = useRef(null);
  const abortRef = useRef(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      abortRef.current?.abort();
    };
  }, []);

  const playMessage = useCallback(async (text, role) => {
    // Stop any current playback
    audioRef.current?.pause();
    audioRef.current = null;
    abortRef.current?.abort();

    if (!text || !accessToken) return;

    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setIsPlaying(false);

    try {
      const res = await apiCall("/api/tts/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: text.slice(0, 500),
          voice: voiceForRole(role),
          language_type: "English",
        }),
        signal: controller.signal,
      });

      if (!res.ok) throw new Error("TTS synthesis failed");

      const data = await res.json();
      const audioUrl = data.audio_url;
      if (!audioUrl) throw new Error("No audio_url in TTS response");

      return new Promise((resolve) => {
        const audio = new Audio(audioUrl);
        audioRef.current = audio;

        audio.oncanplaythrough = () => {
          setIsLoading(false);
          setIsPlaying(true);
          audio.play().catch(() => {});
        };

        audio.onended = () => {
          setIsPlaying(false);
          audioRef.current = null;
          resolve();
        };

        audio.onerror = () => {
          setIsLoading(false);
          setIsPlaying(false);
          audioRef.current = null;
          resolve();
        };
      });
    } catch (err) {
      if (err?.name !== "AbortError") {
        setIsLoading(false);
        setIsPlaying(false);
      }
    }
  }, [apiCall, accessToken]);

  const stop = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    abortRef.current?.abort();
    setIsPlaying(false);
    setIsLoading(false);
  }, []);

  return { playMessage, stop, isPlaying, isLoading };
}
