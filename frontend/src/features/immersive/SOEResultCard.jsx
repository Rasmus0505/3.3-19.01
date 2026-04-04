import { useEffect, useState } from "react";

function ScoreCircle({ score, label, color }) {
  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
      <svg width="52" height="52" viewBox="0 0 52 52">
        <circle cx="26" cy="26" r={radius} fill="none" stroke="#e5e7eb" strokeWidth="4" />
        <circle
          cx="26"
          cy="26"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="4"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
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

function WordHighlight({ words }) {
  if (!Array.isArray(words) || words.length === 0) return null;

  return (
    <div style={{ marginTop: "16px", lineHeight: "1.8", fontSize: "14px", color: "#374151" }}>
      {words.map((item, idx) => {
        const isCorrect = (item.status || "").toLowerCase() === "correct" || item.score >= 60;
        const bgColor = isCorrect ? "#dcfce7" : "#fee2e2";
        const textColor = isCorrect ? "#166534" : "#991b1b";
        return (
          <span
            key={idx}
            style={{
              backgroundColor: bgColor,
              color: textColor,
              borderRadius: "4px",
              padding: "1px 4px",
              marginRight: "4px",
              display: "inline-block",
            }}
          >
            {item.word}
          </span>
        );
      })}
    </div>
  );
}

export default function SOEResultCard({ result, onClose }) {
  const [visible, setVisible] = useState(false);

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

  const scoreColor =
    totalScore >= 80 ? "#22c55e" : totalScore >= 60 ? "#eab308" : totalScore >= 40 ? "#f97316" : "#ef4444";

  const containerStyle = {
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

  const cardStyle = {
    backgroundColor: "#fff",
    borderRadius: "16px",
    padding: "24px",
    width: "340px",
    maxWidth: "90vw",
    boxShadow: "0 20px 40px rgba(0,0,0,0.15)",
    transform: visible ? "scale(1)" : "scale(0.9)",
    transition: "transform 0.2s ease",
  };

  const totalScoreStyle = {
    fontSize: "48px",
    fontWeight: "700",
    color: scoreColor,
    textAlign: "center",
    lineHeight: "1",
  };

  return (
    <div style={containerStyle} onClick={handleClose}>
      <div style={cardStyle} onClick={(e) => e.stopPropagation()}>
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

        <div style={totalScoreStyle}>{totalScore}</div>
        <div style={{ textAlign: "center", fontSize: "14px", color: "#6b7280", marginTop: "4px", marginBottom: "20px" }}>
          综合评分
        </div>

        <div style={{ display: "flex", justifyContent: "space-around", marginBottom: "16px" }}>
          <ScoreCircle score={pronunciationScore} label="发音" color="#3b82f6" />
          <ScoreCircle score={fluencyScore} label="流畅度" color="#8b5cf6" />
          <ScoreCircle score={completenessScore} label="完整度" color="#10b981" />
        </div>

        {result?.ref_text && (
          <div style={{ marginTop: "12px" }}>
            <div style={{ fontSize: "12px", color: "#9ca3af", marginBottom: "4px" }}>参考文本</div>
            <div style={{ fontSize: "13px", color: "#374151" }}>{result.ref_text}</div>
          </div>
        )}

        {result?.user_text && (
          <div style={{ marginTop: "8px" }}>
            <div style={{ fontSize: "12px", color: "#9ca3af", marginBottom: "4px" }}>您的录音</div>
            <div style={{ fontSize: "13px", color: "#4b5563" }}>{result.user_text}</div>
          </div>
        )}

        <WordHighlight words={result?.word_results} />

        {result?.message && !result?.ok && (
          <div style={{ marginTop: "12px", padding: "8px 12px", backgroundColor: "#fee2e2", borderRadius: "8px", fontSize: "13px", color: "#991b1b" }}>
            {result.message}
          </div>
        )}
      </div>
    </div>
  );
}