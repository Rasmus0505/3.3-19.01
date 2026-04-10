import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, CircleHelp, RotateCcw } from "lucide-react";

import { Badge, Button } from "../../shared/ui";

const FALLBACK_DISTRACTORS = [
  "a fixed rule that never changes",
  "a personal opinion without evidence",
  "a short break in the speaker's voice",
  "a result that only works in one simple case",
  "a polite way to end a conversation",
];

function normalizeOption(text = "") {
  return String(text).replace(/\s+/g, " ").trim();
}

function stableShuffle(items, seed) {
  const out = [...items];
  let localSeed = Math.max(1, Number(seed) + 1);
  for (let index = out.length - 1; index > 0; index -= 1) {
    localSeed = (localSeed * 9301 + 49297) % 233280;
    const nextIndex = localSeed % (index + 1);
    [out[index], out[nextIndex]] = [out[nextIndex], out[index]];
  }
  return out;
}

function buildQuestion({ explanation, currentSentenceIndex, lessonSentences }) {
  const items = Array.isArray(explanation?.key_explanations) ? explanation.key_explanations : [];
  if (items.length === 0) return null;

  const target = items[currentSentenceIndex % items.length];
  const correctAnswer = normalizeOption(target?.explanation || "");
  if (!correctAnswer) return null;

  const distractorPool = [];
  for (const sentence of lessonSentences || []) {
    const sentenceItems = Array.isArray(sentence?.key_explanations_json) ? sentence.key_explanations_json : [];
    for (const item of sentenceItems) {
      const candidate = normalizeOption(item?.explanation || "");
      if (candidate && candidate !== correctAnswer && !distractorPool.includes(candidate)) {
        distractorPool.push(candidate);
      }
    }
  }

  for (const item of FALLBACK_DISTRACTORS) {
    if (item !== correctAnswer && !distractorPool.includes(item)) {
      distractorPool.push(item);
    }
  }

  const options = stableShuffle([correctAnswer, ...distractorPool.slice(0, 3)], currentSentenceIndex).slice(0, 4);
  return {
    id: `${currentSentenceIndex}-${target.original_word || "question"}`,
    prompt: `Which explanation best matches "${target.original_word}" in this sentence?`,
    correctAnswer,
    options,
  };
}

export default function ComprehensionCheckPanel({
  explanation,
  currentSentenceIndex = 0,
  lessonSentences = [],
}) {
  const question = useMemo(
    () => buildQuestion({ explanation, currentSentenceIndex, lessonSentences }),
    [currentSentenceIndex, explanation, lessonSentences],
  );
  const [selectedAnswer, setSelectedAnswer] = useState("");
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    setSelectedAnswer("");
    setSubmitted(false);
  }, [question?.id]);

  if (!question) {
    return (
      <div className="immersive-quiz-panel">
        <div className="immersive-quiz-panel__header">
          <div>
            <p className="immersive-quiz-panel__eyebrow">Comprehension Check</p>
            <h2 className="immersive-quiz-panel__title">Question</h2>
          </div>
          <Badge variant="outline">Waiting</Badge>
        </div>
        <div className="immersive-quiz-panel__empty">
          This sentence does not need an extra check yet. A question will appear when the sentence contains above-level expressions.
        </div>
      </div>
    );
  }

  const isCorrect = submitted && selectedAnswer === question.correctAnswer;

  return (
    <div className="immersive-quiz-panel">
      <div className="immersive-quiz-panel__header">
        <div>
          <p className="immersive-quiz-panel__eyebrow">Comprehension Check</p>
          <h2 className="immersive-quiz-panel__title">Single Choice</h2>
        </div>
        <Badge variant={submitted ? (isCorrect ? "secondary" : "outline") : "outline"}>
          {submitted ? (isCorrect ? "Correct" : "Review") : "Ready"}
        </Badge>
      </div>

      <div className="immersive-quiz-panel__card">
        <div className="immersive-quiz-panel__prompt-row">
          <CircleHelp className="size-4" />
          <p className="immersive-quiz-panel__prompt">{question.prompt}</p>
        </div>

        <div className="immersive-quiz-panel__options" role="radiogroup" aria-label="comprehension question">
          {question.options.map((option, index) => {
            const selected = selectedAnswer === option;
            const revealState = submitted
              ? option === question.correctAnswer
                ? "immersive-quiz-panel__option--correct"
                : selected
                  ? "immersive-quiz-panel__option--incorrect"
                  : ""
              : "";
            return (
              <button
                key={`${question.id}-${index}`}
                type="button"
                role="radio"
                aria-checked={selected}
                className={`immersive-quiz-panel__option ${selected ? "immersive-quiz-panel__option--selected" : ""} ${revealState}`.trim()}
                onClick={() => {
                  if (submitted) return;
                  setSelectedAnswer(option);
                }}
              >
                <span className="immersive-quiz-panel__option-label">{String.fromCharCode(65 + index)}</span>
                <span className="immersive-quiz-panel__option-text">{option}</span>
              </button>
            );
          })}
        </div>

        {submitted ? (
          <div className={`immersive-quiz-panel__feedback ${isCorrect ? "immersive-quiz-panel__feedback--correct" : ""}`}>
            <CheckCircle2 className="size-4" />
            <span>
              {isCorrect
                ? "Nice. You matched the expression with the right meaning."
                : `Better answer: ${question.correctAnswer}`}
            </span>
          </div>
        ) : null}
      </div>

      <div className="immersive-quiz-panel__actions">
        <Button
          size="sm"
          disabled={!selectedAnswer || submitted}
          onClick={() => setSubmitted(true)}
        >
          Submit
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setSelectedAnswer("");
            setSubmitted(false);
          }}
        >
          <RotateCcw className="size-4" />
          Reset
        </Button>
      </div>
    </div>
  );
}
