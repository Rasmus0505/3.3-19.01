import { CheckCircle2, RefreshCw, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "../../lib/utils";
import { getRewriteRecord, saveQuizToRecord } from "./readingRewriteDB";

// ─── MCQ Question ─────────────────────────────────────────────────────────────

function McqQuestion({ question, onResult }) {
  const [selected, setSelected] = useState(null);
  const [submitted, setSubmitted] = useState(false);

  const isCorrect = selected === question.answer;

  function handleSubmit() {
    if (!selected || submitted) return;
    setSubmitted(true);
    onResult(isCorrect);
  }

  function handleReset() {
    setSelected(null);
    setSubmitted(false);
    onResult(null);
  }

  return (
    <div className="reading-quiz__question">
      <p className="reading-quiz__question-text">{question.question}</p>
      <div className="reading-quiz__options" role="radiogroup">
        {question.options.map((option, i) => {
          const isSelected = selected === option;
          const revealClass = submitted
            ? option === question.answer
              ? "reading-quiz__option--correct"
              : isSelected
                ? "reading-quiz__option--incorrect"
                : ""
            : "";
          return (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={isSelected}
              className={cn(
                "reading-quiz__option",
                isSelected && "reading-quiz__option--selected",
                revealClass
              )}
              onClick={() => {
                if (submitted) return;
                setSelected(option);
              }}
            >
              <span className="reading-quiz__option-label">{String.fromCharCode(65 + i)}</span>
              <span className="reading-quiz__option-text">{option}</span>
            </button>
          );
        })}
      </div>
      {submitted ? (
        <div className={cn("reading-quiz__feedback", isCorrect && "reading-quiz__feedback--correct")}>
          {isCorrect ? (
            <><CheckCircle2 className="size-4 shrink-0" /><span>正确！</span></>
          ) : (
            <><XCircle className="size-4 shrink-0" /><span>正确答案：{question.answer}</span></>
          )}
        </div>
      ) : null}
      <div className="reading-quiz__actions">
        {!submitted ? (
          <button
            className="reading-quiz__submit-btn"
            disabled={!selected}
            onClick={handleSubmit}
          >
            提交
          </button>
        ) : (
          <button className="reading-quiz__reset-btn" onClick={handleReset}>
            <RefreshCw className="size-3.5" />
            重做
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Fill Question ────────────────────────────────────────────────────────────

function FillQuestion({ question, onResult }) {
  const [value, setValue] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const isCorrect = value.trim().toLowerCase() === question.answer.trim().toLowerCase();

  function handleSubmit() {
    if (!value.trim() || submitted) return;
    setSubmitted(true);
    onResult(isCorrect);
  }

  function handleReset() {
    setValue("");
    setSubmitted(false);
    onResult(null);
  }

  // Split sentence on ___ to render parts with input in between
  const parts = question.sentence.split("___");

  return (
    <div className="reading-quiz__question">
      <p className="reading-quiz__question-text reading-quiz__question-text--fill">
        {parts[0]}
        <input
          className={cn(
            "reading-quiz__fill-input",
            submitted && (isCorrect ? "reading-quiz__fill-input--correct" : "reading-quiz__fill-input--incorrect")
          )}
          type="text"
          value={value}
          onChange={(e) => {
            if (submitted) return;
            setValue(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSubmit();
          }}
          disabled={submitted}
          placeholder="填写答案"
        />
        {parts[1] || ""}
      </p>
      {submitted ? (
        <div className={cn("reading-quiz__feedback", isCorrect && "reading-quiz__feedback--correct")}>
          {isCorrect ? (
            <><CheckCircle2 className="size-4 shrink-0" /><span>正确！</span></>
          ) : (
            <><XCircle className="size-4 shrink-0" /><span>正确答案：{question.answer}</span></>
          )}
        </div>
      ) : null}
      <div className="reading-quiz__actions">
        {!submitted ? (
          <button
            className="reading-quiz__submit-btn"
            disabled={!value.trim()}
            onClick={handleSubmit}
          >
            提交
          </button>
        ) : (
          <button className="reading-quiz__reset-btn" onClick={handleReset}>
            <RefreshCw className="size-3.5" />
            重做
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Order Question ───────────────────────────────────────────────────────────

function OrderQuestion({ question, onResult }) {
  const { sentences, correct_order } = question;
  const [assigned, setAssigned] = useState(() => sentences.map(() => null));
  const [submitted, setSubmitted] = useState(false);

  const nextNum = assigned.filter((n) => n !== null).length + 1;
  const allAssigned = assigned.every((n) => n !== null);

  function handleClickSentence(i) {
    if (submitted) return;
    setAssigned((prev) => {
      const current = prev[i];
      if (current !== null) {
        // Deassign: shift numbers above it down
        return prev.map((n, idx) => {
          if (idx === i) return null;
          if (n !== null && n > current) return n - 1;
          return n;
        });
      }
      if (nextNum > sentences.length) return prev;
      return prev.map((n, idx) => (idx === i ? nextNum : n));
    });
  }

  function handleSubmit() {
    if (!allAssigned || submitted) return;
    // assigned[i] = position user assigned to sentence i
    // correct_order[pos] = sentence index that should be at that position
    // Build user order: for each position 1..n, which sentence index did user assign there?
    const userOrder = sentences.map((_, i) => assigned[i] - 1); // 0-based user order per sentence
    // correct: correct_order tells us "at position p, sentence correct_order[p]"
    // user says: sentence i is at position assigned[i]-1
    // We need to verify: for each position p, user placed correct_order[p] there
    const isCorrect = correct_order.every((correctSentenceIdx, pos) => {
      const userAssignedPos = assigned[correctSentenceIdx];
      return userAssignedPos === pos + 1; // 1-based
    });
    setSubmitted(true);
    onResult(isCorrect);
  }

  function handleReset() {
    setAssigned(sentences.map(() => null));
    setSubmitted(false);
    onResult(null);
  }

  // After submission: build the correct order display
  const correctOrderedSentences = submitted
    ? correct_order.map((idx) => sentences[idx])
    : null;

  return (
    <div className="reading-quiz__question">
      <p className="reading-quiz__question-text">将以下句子按正确顺序排列（点击句子分配序号）：</p>
      <div className="reading-quiz__order-list">
        {sentences.map((sentence, i) => (
          <button
            key={i}
            type="button"
            className={cn(
              "reading-quiz__order-item",
              assigned[i] !== null && "reading-quiz__order-item--assigned",
              submitted && assigned[i] === correct_order.indexOf(i) + 1 && "reading-quiz__order-item--correct",
              submitted && assigned[i] !== correct_order.indexOf(i) + 1 && "reading-quiz__order-item--incorrect"
            )}
            onClick={() => handleClickSentence(i)}
          >
            <span className="reading-quiz__order-num">
              {assigned[i] !== null ? assigned[i] : "·"}
            </span>
            <span className="reading-quiz__order-text">{sentence}</span>
          </button>
        ))}
      </div>
      {submitted && correctOrderedSentences ? (
        <div className="reading-quiz__order-answer">
          <p className="reading-quiz__order-answer-label">正确顺序：</p>
          {correctOrderedSentences.map((s, i) => (
            <p key={i} className="reading-quiz__order-answer-sentence">
              <span className="reading-quiz__order-num">{i + 1}</span>
              {s}
            </p>
          ))}
        </div>
      ) : null}
      <div className="reading-quiz__actions">
        {!submitted ? (
          <button
            className="reading-quiz__submit-btn"
            disabled={!allAssigned}
            onClick={handleSubmit}
          >
            提交
          </button>
        ) : (
          <button className="reading-quiz__reset-btn" onClick={handleReset}>
            <RefreshCw className="size-3.5" />
            重做
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Question Router ──────────────────────────────────────────────────────────

function Question({ question, index, onResult }) {
  const label = index + 1;
  return (
    <section className="reading-quiz__question-wrapper">
      <span className="reading-quiz__question-index">Q{label}</span>
      {question.type === "mcq" && <McqQuestion question={question} onResult={onResult} />}
      {question.type === "fill" && <FillQuestion question={question} onResult={onResult} />}
      {question.type === "order" && <OrderQuestion question={question} onResult={onResult} />}
    </section>
  );
}

// ─── QuizPanel ────────────────────────────────────────────────────────────────

export function QuizPanel({ pack, articleId, apiCall }) {
  const [status, setStatus] = useState("idle"); // idle | loading | error | ready
  const [questions, setQuestions] = useState([]);
  const [results, setResults] = useState([]);

  // Load persisted quiz on mount
  useEffect(() => {
    getRewriteRecord(articleId).then((record) => {
      if (record?.quiz?.questions?.length) {
        setQuestions(record.quiz.questions);
        setResults(record.quiz.questions.map(() => null));
        setStatus("ready");
      }
    });
  }, [articleId]);

  async function handleGenerate() {
    setStatus("loading");
    setResults([]);
    try {
      const resp = await apiCall("/api/llm/quiz/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pack_text: pack.rewrittenText || pack.originalText || "",
          original_text: pack.originalText || "",
          target_level: pack.targetLevel || "B1",
        }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.ok) {
        setStatus("error");
        return;
      }
      const qs = data.questions;
      setQuestions(qs);
      setResults(qs.map(() => null));
      setStatus("ready");
      await saveQuizToRecord(articleId, { questions: qs, generatedAt: Date.now() });
    } catch {
      setStatus("error");
    }
  }

  function handleResult(index, isCorrect) {
    setResults((prev) => {
      const next = [...prev];
      next[index] = isCorrect;
      return next;
    });
  }

  const submittedCount = results.filter((r) => r !== null).length;
  const correctCount = results.filter((r) => r === true).length;
  const allSubmitted = questions.length > 0 && submittedCount === questions.length;

  if (status === "idle") {
    return (
      <div className="reading-quiz reading-quiz--idle">
        <p className="reading-quiz__hint">通过 AI 生成理解测验，检验阅读效果</p>
        <button className="reading-quiz__generate-btn" onClick={handleGenerate}>
          生成测验
        </button>
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div className="reading-quiz reading-quiz--loading">
        <div className="reading-quiz__spinner" aria-label="生成中" />
        <p className="reading-quiz__hint">AI 正在生成测验题目…</p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="reading-quiz reading-quiz--error">
        <p className="reading-quiz__hint reading-quiz__hint--error">测验生成失败，请重试</p>
        <button className="reading-quiz__generate-btn" onClick={handleGenerate}>
          重试
        </button>
      </div>
    );
  }

  return (
    <div className="reading-quiz">
      <div className="reading-quiz__header">
        <span className="reading-quiz__count">{questions.length} 道题</span>
        <button
          className="reading-quiz__regen-btn"
          onClick={handleGenerate}
          title="重新生成测验（将消耗积分）"
        >
          <RefreshCw className="size-3.5" />
          重新生成
        </button>
      </div>

      <div className="reading-quiz__list">
        {questions.map((q, i) => (
          <Question
            key={i}
            question={q}
            index={i}
            onResult={(isCorrect) => handleResult(i, isCorrect)}
          />
        ))}
      </div>

      {allSubmitted && (
        <div className="reading-quiz__score">
          <span className="reading-quiz__score-text">
            答对 {correctCount} / {questions.length} 题
          </span>
          <span className="reading-quiz__score-emoji">
            {correctCount / questions.length >= 0.8 ? "很棒！" : "继续加油！"}
          </span>
        </div>
      )}
    </div>
  );
}
