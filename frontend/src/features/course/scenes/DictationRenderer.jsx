/**
 * DictationRenderer — Dictation scene with ASR voice input support.
 *
 * - If scene has lesson_id: redirect to full immersive dictation player
 * - Otherwise: inline practice with optional microphone ASR (Web Speech API)
 */
import { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../../components/ui/button";
import { Card } from "../../../components/ui/card";
import { BookOpen, Mic, MicOff, Play, CheckCircle2, XCircle } from "lucide-react";
import { VoiceWaveform } from "../components/VoiceWaveform";

// Normalize text for comparison: lowercase, strip punctuation
function normalize(text) {
  return text.toLowerCase().replace(/[^a-z0-9\s']/g, "").trim();
}

function diffWords(expected, spoken) {
  const expWords = normalize(expected).split(/\s+/);
  const spkWords = normalize(spoken).split(/\s+/);
  return expWords.map((word, i) => ({
    word,
    status: spkWords[i] === word ? "correct" : spkWords[i] ? "wrong" : "missing",
    spoken: spkWords[i] || "",
  }));
}

export function DictationRenderer({ scene }) {
  const navigate = useNavigate();
  const content = scene.content || {};
  const sourceText = content.source_text || "";
  const targetLevel = content.target_level || "B1";

  // ASR state
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [diff, setDiff] = useState(null);
  const [asrSupported] = useState(() => "webkitSpeechRecognition" in window || "SpeechRecognition" in window);
  const recognitionRef = useRef(null);

  const startListening = useCallback(() => {
    if (!asrSupported) return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (e) => {
      const result = e.results[e.results.length - 1];
      const text = result[0].transcript;
      setTranscript(text);
      if (result.isFinal && sourceText) {
        setDiff(diffWords(sourceText.split("\n")[0], text));
      }
    };
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);

    recognitionRef.current = recognition;
    recognition.start();
  }, [asrSupported, sourceText]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  // If the scene has a lesson_id, navigate to the full immersive player
  if (scene.lesson_id) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8">
        <div className="w-16 h-16 rounded-2xl bg-blue-50 dark:bg-blue-950 flex items-center justify-center mb-4">
          <BookOpen className="w-8 h-8 text-blue-500" />
        </div>
        <h2 className="text-xl font-semibold mb-2">听写练习</h2>
        <p className="text-muted-foreground mb-6 text-center max-w-md">
          Listen to the audio and type what you hear, word by word.
        </p>
        <Button
          onClick={() => navigate(`/immersive/${scene.lesson_id}`)}
          size="lg"
          className="gap-2"
        >
          <Play className="w-4 h-4" />
          Start Dictation
        </Button>
      </div>
    );
  }

  const practiceLines = sourceText ? sourceText.split("\n").filter(Boolean) : [];

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950 flex items-center justify-center">
          <BookOpen className="w-5 h-5 text-blue-500" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">{scene.title || "听写练习"}</h2>
          <p className="text-sm text-muted-foreground">CEFR {targetLevel} — Read aloud to practice</p>
        </div>
      </div>

      {/* Practice text */}
      {practiceLines.length > 0 && (
        <Card className="p-6 mb-4">
          <h3 className="text-sm font-medium text-muted-foreground mb-3">Practice Passage</h3>
          <div className="prose prose-sm dark:prose-invert max-w-none space-y-2">
            {practiceLines.map((line, i) => (
              <p key={i} className="leading-relaxed">{line}</p>
            ))}
          </div>
        </Card>
      )}

      {/* ASR Speaking Practice */}
      {asrSupported && practiceLines.length > 0 && (
        <Card className="p-6">
          <h3 className="text-sm font-medium text-muted-foreground mb-4">Speaking Practice (ASR)</h3>
          <p className="text-xs text-muted-foreground mb-4">
            Read the first sentence aloud — your pronunciation will be compared.
          </p>

          {/* Target sentence */}
          <div className="bg-muted/50 rounded-lg p-3 mb-4 text-sm font-mono">
            {practiceLines[0]}
          </div>

          {/* Mic button */}
          <div className="flex items-center gap-4 mb-4">
            <Button
              variant={isListening ? "destructive" : "default"}
              onClick={isListening ? stopListening : startListening}
              className="gap-2"
            >
              {isListening ? (
                <><MicOff className="w-4 h-4" /> Stop</>
              ) : (
                <><Mic className="w-4 h-4" /> Speak</>
              )}
            </Button>
            {isListening && (
              <div className="flex items-center gap-2 text-sm text-blue-500">
                <VoiceWaveform />
                <span>Listening…</span>
              </div>
            )}
          </div>

          {/* Transcript */}
          {transcript && (
            <div className="mb-4">
              <p className="text-xs text-muted-foreground mb-1">You said:</p>
              <p className="text-sm italic text-foreground/80">"{transcript}"</p>
            </div>
          )}

          {/* Word-by-word diff */}
          {diff && (
            <div>
              <p className="text-xs text-muted-foreground mb-2">Word comparison:</p>
              <div className="flex flex-wrap gap-1.5">
                {diff.map((item, i) => (
                  <span
                    key={i}
                    title={item.status === "wrong" ? `You said: "${item.spoken}"` : undefined}
                    className={
                      "px-2 py-0.5 rounded text-sm font-medium " +
                      (item.status === "correct"
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                        : item.status === "wrong"
                        ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                        : "bg-muted text-muted-foreground line-through")
                    }
                  >
                    {item.status === "correct" && <CheckCircle2 className="inline w-3 h-3 mr-1" />}
                    {item.status !== "correct" && <XCircle className="inline w-3 h-3 mr-1" />}
                    {item.word}
                  </span>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                {diff.filter(w => w.status === "correct").length}/{diff.length} words correct
              </p>
            </div>
          )}
        </Card>
      )}

      {!asrSupported && practiceLines.length > 0 && (
        <Card className="p-4 text-center text-muted-foreground text-sm">
          <Mic className="w-5 h-5 mx-auto mb-2 opacity-40" />
          Speech recognition not supported in this browser. Use Chrome for ASR practice.
        </Card>
      )}

      {!sourceText && (
        <Card className="p-6 text-center text-muted-foreground">
          <p>Dictation content is being generated…</p>
        </Card>
      )}
    </div>
  );
}
