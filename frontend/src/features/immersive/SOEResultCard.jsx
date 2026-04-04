import { useEffect, useState } from "react";

const MATCH_TAG_LABELS = {
  0: "匹配",
  1: "多读",
  2: "漏读",
  3: "错读",
  4: "未收录",
};

const MATCH_TAG_COLORS = {
  0: { bg: "#dcfce7", text: "#166534", border: "#86efac" },   // green - good
  1: { bg: "#fef9c3", text: "#713f12", border: "#fde047" },   // yellow - extra
  2: { bg: "#fee2e2", text: "#991b1b", border: "#fca5a5" },   // red - missing
  3: { bg: "#fee2e2", text: "#991b1b", border: "#fca5a5" },   // red - misread
  4: { bg: "#f3e8ff", text: "#6b21a8", border: "#d8b4fe" },   // purple - unknown
};

function scoreColor(score) {
  if (score >= 80) return "#22c55e";
  if (score >= 60) return "#eab308";
  if (score >= 40) return "#f97316";
  return "#ef4444";
}

function ScoreCircle({ score, label, color }) {
  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
      <svg width="52" height="52" viewBox="0 0 52 52">
        <circle cx="26" cy="26" r={radius} fill="none" stroke="#e5e7eb" strokeWidth="4" />
        <circle
          cx="26" cy="26" r={radius}
          fill="none" stroke={color}
          strokeWidth="4"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 26 26)"
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
        <text x="26" y="26" textAnchor="middle" dominantBaseline="central" fontSize="12" fontWeight="600" fill={color}>
          {score}
        </text>
      </svg>
      <span style={{ fontSize: "12px", color: "#6b7280" }}>{label}</span>
    </div>
  );
}

function PhoneChip({ phone, score, matchTag }) {
  const color = scoreColor(score);
  const tagColor = MATCH_TAG_COLORS[matchTag] || MATCH_TAG_COLORS[0];
  return (
    <span
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "1px",
        marginRight: "2px",
      }}
    >
      <span
        style={{
          fontSize: "11px",
          fontWeight: "600",
          color: tagColor.text,
          backgroundColor: tagColor.bg,
          border: `1px solid ${tagColor.border}`,
          borderRadius: "4px",
          padding: "1px 4px",
          lineHeight: "1.4",
          minWidth: "20px",
          textAlign: "center",
        }}
      >
        {phone}
      </span>
      <span style={{ fontSize: "9px", color: color, fontWeight: "500" }}>
        {Math.round(score)}
      </span>
    </span>
  );
}

function WordFeedbackRow({ word, onShowPhones }) {
  const {
    word: recognized,
    reference_word: refWord,
    pronunciation_score: pronScore,
    fluency_score: fluScore,
    match_tag: matchTag = 0,
    phone_results: phones = [],
  } = word;

  const tagInfo = MATCH_TAG_COLORS[matchTag] || MATCH_TAG_COLORS[0];
  const tagLabel = MATCH_TAG_LABELS[matchTag] || "匹配";
  const showPhones = matchTag !== 2 && phones.length > 0;
  const hasPhoneIssues = showPhones && phones.some(p => (p.pronunciation_score || 0) < 60);

  const displayWord = matchTag === 2 ? (
    <s style={{ color: "#9ca3af" }}>{refWord || recognized}</s>
  ) : recognized || refWord;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
      {/* Word chip */}
      <span
        style={{
          fontSize: "13px",
          fontWeight: "600",
          color: tagInfo.text,
          backgroundColor: tagInfo.bg,
          border: `1px solid ${tagInfo.border}`,
          borderRadius: "6px",
          padding: "2px 8px",
          minWidth: "40px",
          textAlign: "center",
          flexShrink: 0,
        }}
      >
        {displayWord}
      </span>

      {/* Score badge */}
      {matchTag !== 2 && (
        <span
          style={{
            fontSize: "11px",
            fontWeight: "600",
            color: scoreColor(pronScore),
            backgroundColor: "#f9fafb",
            border: "1px solid #e5e7eb",
            borderRadius: "4px",
            padding: "1px 5px",
            flexShrink: 0,
          }}
        >
          发音 {Math.round(pronScore)}
        </span>
      )}

      {/* Match tag badge */}
      <span
        style={{
          fontSize: "10px",
          fontWeight: "500",
          color: tagInfo.text,
          backgroundColor: tagInfo.bg,
          border: `1px solid ${tagInfo.border}`,
          borderRadius: "4px",
          padding: "1px 5px",
          flexShrink: 0,
        }}
      >
        {tagLabel}
      </span>

      {/* Phone breakdown */}
      {showPhones && (
        <div style={{ display: "flex", alignItems: "center", gap: "1px", flexWrap: "wrap" }}>
          {phones.map((p, i) => (
            <PhoneChip
              key={i}
              phone={p.phone}
              score={p.pronunciation_score}
              matchTag={p.match_tag || 0}
            />
          ))}
          {hasPhoneIssues && (
            <button
              onClick={() => onShowPhones?.(phones)}
              style={{
                fontSize: "10px",
                color: "#6b7280",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "2px 4px",
                textDecoration: "underline",
              }}
            >
              详细
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function MatchSummary({ matched, total, added, missing, misread }) {
  const goodCount = matched;
  const badCount = added + missing + misread;
  if (badCount === 0) return null;
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "6px",
        marginBottom: "10px",
      }}
    >
      {added > 0 && (
        <span style={badgeStyle("#fef9c3", "#713f12", "#fde047")}>
          多读了 {added} 个词
        </span>
      )}
      {missing > 0 && (
        <span style={badgeStyle("#fee2e2", "#991b1b", "#fca5a5")}>
          漏读了 {missing} 个词
        </span>
      )}
      {misread > 0 && (
        <span style={badgeStyle("#fee2e2", "#991b1b", "#fca5a5")}>
          读错 {misread} 个词
        </span>
      )}
    </div>
  );
}

function badgeStyle(bg, text, border) {
  return {
    fontSize: "12px",
    fontWeight: "500",
    color: text,
    backgroundColor: bg,
    border: `1px solid ${border}`,
    borderRadius: "6px",
    padding: "3px 10px",
  };
}

export default function SOEResultCard({ result, onClose }) {
  const [visible, setVisible] = useState(false);
  const [showAllWords, setShowAllWords] = useState(false);
  const [phoneModal, setPhoneModal] = useState(null);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const handleClose = () => {
    setVisible(false);
    setTimeout(() => onClose?.(), 200);
  };

  const totalScore = result?.total_score ?? 0;
  const pronunciationScore = result?.pronunciation_score ?? 0;
  const fluencyScore = result?.fluency_score ?? 0;
  const completenessScore = result?.completeness_score ?? 0;

  const words = Array.isArray(result?.word_results) ? result.word_results : [];
  const matched = result?.matched_word_count ?? 0;
  const total = result?.total_word_count ?? words.length;
  const added = result?.added_word_count ?? 0;
  const missing = result?.missing_word_count ?? 0;
  const misread = result?.misread_word_count ?? 0;

  const displayWords = showAllWords ? words : words.slice(0, 10);

  const cardStyle = {
    position: "fixed",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    zIndex: 9999,
    opacity: visible ? 1 : 0,
    transition: "opacity 0.2s ease",
  };

  const innerStyle = {
    backgroundColor: "#fff",
    borderRadius: "16px",
    padding: "24px",
    width: "420px",
    maxWidth: "92vw",
    maxHeight: "88vh",
    overflowY: "auto",
    boxShadow: "0 20px 40px rgba(0,0,0,0.15)",
    transform: visible ? "scale(1)" : "scale(0.9)",
    transition: "transform 0.2s ease",
  };

  return (
    <>
      <div style={cardStyle} onClick={handleClose}>
        <div style={innerStyle} onClick={(e) => e.stopPropagation()}>
          {/* Close button */}
          <button
            onClick={handleClose}
            style={{
              position: "absolute",
              top: "12px",
              right: "12px",
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: "20px",
              color: "#9ca3af",
              padding: "4px",
              lineHeight: "1",
            }}
            aria-label="关闭"
          >
            ×
          </button>

          {/* Total score */}
          <div
            style={{
              fontSize: "52px",
              fontWeight: "700",
              color: scoreColor(totalScore),
              textAlign: "center",
              lineHeight: "1.2",
            }}
          >
            {totalScore}
          </div>
          <div style={{ textAlign: "center", fontSize: "13px", color: "#6b7280", marginBottom: "16px" }}>
            综合评分 · {total > 0 ? `${matched}/${total} 词匹配` : ""}
          </div>

          {/* Sub-scores */}
          <div style={{ display: "flex", justifyContent: "space-around", marginBottom: "16px" }}>
            <ScoreCircle score={pronunciationScore} label="发音" color="#3b82f6" />
            <ScoreCircle score={fluencyScore} label="流畅度" color="#8b5cf6" />
            <ScoreCircle score={completenessScore} label="完整度" color="#10b981" />
          </div>

          {/* Match summary badges */}
          <MatchSummary
            matched={matched}
            total={total}
            added={added}
            missing={missing}
            misread={misread}
          />

          {/* Word-level feedback */}
          {words.length > 0 && (
            <div style={{ marginBottom: "12px" }}>
              <div
                style={{
                  fontSize: "12px",
                  color: "#9ca3af",
                  marginBottom: "6px",
                  fontWeight: "500",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                逐词反馈
              </div>
              <div
                style={{
                  border: "1px solid #f3f4f6",
                  borderRadius: "10px",
                  padding: "10px 12px",
                  backgroundColor: "#fafafa",
                  maxHeight: showAllWords ? "none" : "220px",
                  overflowY: showAllWords ? "visible" : "auto",
                }}
              >
                {displayWords.map((w, i) => (
                  <WordFeedbackRow
                    key={i}
                    word={w}
                    onShowPhones={(phones) => setPhoneModal({ word: w.word || w.reference_word, phones })}
                  />
                ))}
                {!showAllWords && words.length > 10 && (
                  <button
                    onClick={() => setShowAllWords(true)}
                    style={{
                      fontSize: "12px",
                      color: "#3b82f6",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: "4px 0",
                      width: "100%",
                      textAlign: "center",
                    }}
                  >
                    展开全部 {words.length} 个词 ↓
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Ref text vs user text */}
          {result?.ref_text && (
            <div style={{ marginBottom: "8px" }}>
              <div style={{ fontSize: "12px", color: "#9ca3af", marginBottom: "4px" }}>参考文本</div>
              <div style={{ fontSize: "14px", color: "#374151", lineHeight: "1.6" }}>{result.ref_text}</div>
            </div>
          )}

          {result?.user_text && (
            <div style={{ marginBottom: "8px" }}>
              <div style={{ fontSize: "12px", color: "#9ca3af", marginBottom: "4px" }}>您的录音识别为</div>
              <div style={{ fontSize: "14px", color: "#6b7280", lineHeight: "1.6" }}>{result.user_text}</div>
            </div>
          )}

          {/* Error message */}
          {result?.message && !result?.ok && (
            <div
              style={{
                marginTop: "12px",
                padding: "8px 12px",
                backgroundColor: "#fee2e2",
                borderRadius: "8px",
                fontSize: "13px",
                color: "#991b1b",
              }}
            >
              {result.message}
            </div>
          )}
        </div>
      </div>

      {/* Phone detail modal */}
      {phoneModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(0,0,0,0.6)",
            zIndex: 10001,
          }}
          onClick={() => setPhoneModal(null)}
        >
          <div
            style={{
              backgroundColor: "#fff",
              borderRadius: "14px",
              padding: "20px",
              width: "360px",
              maxWidth: "90vw",
              boxShadow: "0 16px 32px rgba(0,0,0,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: "15px", fontWeight: "600", color: "#1f2937", marginBottom: "12px" }}>
              音素详情：{phoneModal.word}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "16px" }}>
              {phoneModal.phones.map((p, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "3px",
                    minWidth: "44px",
                  }}
                >
                  <div
                    style={{
                      fontSize: "16px",
                      fontWeight: "700",
                      color: scoreColor(p.pronunciation_score),
                      backgroundColor: "#f9fafb",
                      border: `2px solid ${scoreColor(p.pronunciation_score)}`,
                      borderRadius: "8px",
                      padding: "4px 8px",
                      textAlign: "center",
                    }}
                  >
                    {p.phone}
                  </div>
                  <div style={{ fontSize: "11px", color: "#6b7280" }}>
                    {Math.round(p.pronunciation_score)}
                  </div>
                  {p.detected_stress && (
                    <div style={{ fontSize: "9px", color: "#f97316" }}>重音</div>
                  )}
                </div>
              ))}
            </div>
            <div style={{ fontSize: "11px", color: "#9ca3af", marginBottom: "8px" }}>
              每个音素下方数字为发音精准度分数。低于60分请注意改进对应音素的发音。
            </div>
            <button
              onClick={() => setPhoneModal(null)}
              style={{
                width: "100%",
                padding: "8px",
                backgroundColor: "#3b82f6",
                color: "#fff",
                border: "none",
                borderRadius: "8px",
                fontSize: "14px",
                cursor: "pointer",
              }}
            >
              关闭
            </button>
          </div>
        </div>
      )}
    </>
  );
}
