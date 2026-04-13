import { useEffect, useState } from "react";

// ─── 智聆音素 → IPA 映射表（腾讯云官方文档） ───────────────────────────────
const ARPABET_TO_IPA = {
  ih: "ɪ",
  ah: "ə",
  ao: "ɒ",
  uh: "ʊ",
  "^": "ʌ",
  eh: "e",
  ae: "æ",
  iy: "i",
  er: "ɜ",
  ax: "ə",
  ix: "ɪ",
  "": "",
  "aa": "ɑ",
  ey: "eɪ",
  ay: "aɪ",
  oy: "ɔɪ",
  aw: "aʊ",
  ow: "oʊ",
  uw: "u",
  p: "p",
  b: "b",
  t: "t",
  d: "d",
  k: "k",
  g: "g",
  f: "f",
  v: "v",
  th: "θ",
  dh: "ð",
  s: "s",
  z: "z",
  sh: "ʃ",
  zh: "ʒ",
  ch: "tʃ",
  jh: "dʒ",
  hh: "h",
  m: "m",
  n: "n",
  ng: "ŋ",
  l: "l",
  r: "r",
  y: "j",
  w: "w",
};

function toIPA(phone) {
  return ARPABET_TO_IPA[phone] ?? phone;
}

const MATCH_TAG_LABELS = {
  0: "匹配",
  1: "多读",
  2: "漏读",
  3: "错读",
  4: "未收录",
};

const MATCH_TAG_COLORS = {
  0: { bg: "#dcfce7", text: "#166534", border: "#86efac" },
  1: { bg: "#fef9c3", text: "#713f12", border: "#fde047" },
  2: { bg: "#fee2e2", text: "#991b1b", border: "#fca5a5" },
  3: { bg: "#fee2e2", text: "#991b1b", border: "#fca5a5" },
  4: { bg: "#f3e8ff", text: "#6b21a8", border: "#d8b4fe" },
};

// ─── 音素级别提示词（结合 IPA + 字母做诊断） ─────────────────────────────────
const PHONE_HINTS = {
  θ: "舌尖轻咬上下齿间，送气无声",
  ð: "舌尖轻咬上下齿间，声带振动",
  th: "舌尖轻咬上下齿间，送气无声，像中文'丝'但更轻",
  dh: "舌尖轻咬上下齿间，声带振动，像中文'滋'带振动",
  w: "双唇收圆并前伸，像吹蜡烛的口型",
  r: "舌尖卷起但不抵上颚，像中文'日'但更轻",
  l: "舌尖抵上齿龈，声音从两侧出来",
  ng: "舌根抵软腭，鼻音，像中文'ang'的尾音",
  v: "上齿轻咬下唇，声带振动",
  s: "舌尖接近上齿龈，牙齿轻合，送气无声",
  z: "舌尖接近上齿龈，牙齿轻合，声带振动",
  sh: "舌尖后缩，双唇前撅，送气无声",
  ʃ: "舌尖后缩，双唇前撅，送气无声（sh 的 IPA 写法）",
  ch: "sh 音之后紧跟一个急促的 t 音",
  tʃ: "sh 音之后紧跟一个急促的 t 音（ch 的 IPA 写法）",
  jh: "sh 音之后紧跟一个急促的 d 音",
  dʒ: "sh 音之后紧跟一个急促的 d 音（j 的 IPA 写法）",
};

const LOW_SCORE_THRESHOLD = 60;
const MID_SCORE_THRESHOLD = 75;

function scoreColor(score) {
  if (score >= MID_SCORE_THRESHOLD) return "#22c55e";
  if (score >= LOW_SCORE_THRESHOLD) return "#eab308";
  if (score >= 40) return "#f97316";
  return "#ef4444";
}

function scoreLabel(score) {
  if (score >= MID_SCORE_THRESHOLD) return "良好";
  if (score >= LOW_SCORE_THRESHOLD) return "一般";
  if (score >= 40) return "偏弱";
  return "薄弱";
}

function getPhoneHint(ipa, letter) {
  // 先用 IPA 查，再退回到原字母
  return PHONE_HINTS[ipa] || PHONE_HINTS[letter] || null;
}

function ScoreCircle({ score, label, color, subLabel }) {
  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
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
      {subLabel && (
        <span style={{ fontSize: "10px", color: "#9ca3af" }}>{subLabel}</span>
      )}
    </div>
  );
}

// ─── 单个音素：显示 IPA 音标 + 分数 + 可选提示 ───────────────────────────────
function PhoneItem({ phone, score, hint }) {
  const ipa = toIPA(phone);
  const color = scoreColor(score);
  const label = scoreLabel(score);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
      {/* IPA 音标 */}
      <div
        style={{
          fontSize: "13px",
          fontWeight: "700",
          color: color,
          fontFamily: "Georgia, serif",
          lineHeight: "1",
        }}
      >
        /{ipa}/
      </div>
      {/* 分数 + 评价 */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1px" }}>
        <span style={{ fontSize: "10px", fontWeight: "600", color }}>{Math.round(score)}</span>
        {score < LOW_SCORE_THRESHOLD && hint && (
          <span
            title={hint}
            style={{
              fontSize: "9px",
              color: "#ef4444",
              cursor: "help",
              borderBottom: "1px dashed #ef4444",
            }}
          >
            {label}
          </span>
        )}
        {score < LOW_SCORE_THRESHOLD && !hint && (
          <span style={{ fontSize: "9px", color }}>{label}</span>
        )}
      </div>
    </div>
  );
}

// ─── 单词行：展示单词 IPA + 音素序列 + 最弱音素提示 ─────────────────────────
function WordFeedbackRow({ word }) {
  const {
    word: recognized,
    reference_word: refWord,
    pronunciation_score: pronScore,
    match_tag: matchTag = 0,
    phone_results: phones = [],
  } = word;

  const tagInfo = MATCH_TAG_COLORS[matchTag] || MATCH_TAG_COLORS[0];
  const tagLabel = MATCH_TAG_LABELS[matchTag] || "匹配";
  const showPhones = matchTag !== 2 && phones.length > 0;

  // 找出最弱的音素
  const weakPhones = phones.filter((p) => (p.pronunciation_score || 0) < LOW_SCORE_THRESHOLD);
  const weakestPhone = weakPhones.length > 0
    ? weakPhones.reduce((a, b) =>
        (a.pronunciation_score || 0) < (b.pronunciation_score || 0) ? a : b
      )
    : null;

  const weakestHint = weakestPhone
    ? getPhoneHint(toIPA(weakestPhone.phone), weakestPhone.reference_letter || weakestPhone.phone)
    : null;

  const displayWord = matchTag === 2 ? (
    <s style={{ color: "#9ca3af" }}>{refWord || recognized}</s>
  ) : recognized || refWord;

  // 构建该单词的 IPA 音标字符串
  const ipaStr = phones.map((p) => toIPA(p.phone)).join("");

  return (
    <div style={{ marginBottom: "8px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
        {/* 单词主体 */}
        <span
          style={{
            fontSize: "14px",
            fontWeight: "600",
            color: tagInfo.text,
            backgroundColor: tagInfo.bg,
            border: `1px solid ${tagInfo.border}`,
            borderRadius: "6px",
            padding: "2px 8px",
            flexShrink: 0,
          }}
        >
          {displayWord}
        </span>

        {/* IPA 音标（如果有音素） */}
        {ipaStr && (
          <span
            style={{
              fontSize: "12px",
              fontFamily: "Georgia, serif",
              color: "#6b7280",
              flexShrink: 0,
            }}
          >
            /{ipaStr}/
          </span>
        )}

        {/* 发音分 */}
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
            {Math.round(pronScore)}
          </span>
        )}

        {/* 匹配标签 */}
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
      </div>

      {/* 音素横向排列 */}
      {showPhones && (
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: "4px",
            marginTop: "4px",
            paddingLeft: "4px",
            flexWrap: "wrap",
          }}
        >
          {phones.map((p, i) => (
            <PhoneItem
              key={i}
              phone={p.phone}
              score={p.pronunciation_score}
              hint={getPhoneHint(toIPA(p.phone), p.reference_letter || p.phone)}
            />
          ))}
        </div>
      )}

      {/* 最弱音素提示 */}
      {weakestPhone && weakestHint && (
        <div
          style={{
            fontSize: "11px",
            color: "#b45309",
            backgroundColor: "#fef3c7",
            border: "1px solid #fde68a",
            borderRadius: "6px",
            padding: "3px 8px",
            marginTop: "4px",
            display: "flex",
            alignItems: "center",
            gap: "4px",
          }}
        >
          <span style={{ fontSize: "12px" }}>💡</span>
          <span>
            <strong>/{toIPA(weakestPhone.phone)}/</strong> 发音建议：{weakestHint}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── 综合诊断区：整句层面的 AI 诊断提示 ──────────────────────────────────────
function AIDiagnostic({ words, fluencyScore, completenessScore }) {
  const allPhones = words.flatMap((w) => w.phone_results || []);
  const weakPhones = allPhones.filter((p) => (p.pronunciation_score || 0) < LOW_SCORE_THRESHOLD);

  // 统计各音素类型的问题频率
  const phoneIssueCount = {};
  weakPhones.forEach((p) => {
    const key = toIPA(p.phone);
    phoneIssueCount[key] = (phoneIssueCount[key] || 0) + 1;
  });

  // 找出最常出问题的音素
  const sortedIssues = Object.entries(phoneIssueCount).sort((a, b) => b[1] - a[1]);
  const topIssues = sortedIssues.slice(0, 2);

  // 判断问题类型
  const missingCount = (words.filter((w) => w.match_tag === 2) || []).length;
  const misreadCount = (words.filter((w) => w.match_tag === 3) || []).length;
  const fluencyLow = fluencyScore < 70;
  const completenessLow = completenessScore < 70;

  const tips = [];

  if (topIssues.length > 0) {
    const [phone, count] = topIssues[0];
    tips.push(`${count > 1 ? `「${phone}」音出现了 ${count} 次偏弱` : `「${phone}」音偏弱`}，是本句需要重点练习的音。`);
  }
  if (topIssues.length > 1) {
    const [phone2, count2] = topIssues[1];
    tips.push(`「${phone2}」音也需注意。`);
  }
  if (missingCount > 0) {
    tips.push(`漏读了 ${missingCount} 个词，完整读出所有单词可提升完整度分。`);
  }
  if (misreadCount > 0) {
    tips.push(`有 ${misreadCount} 个词读音偏差较大，建议先听原音再跟读。`);
  }
  if (fluencyLow) {
    tips.push(`流畅度偏低，注意语速不要太快，尽量保持均匀节奏，避免在词间过度停顿。`);
  }
  if (completenessLow) {
    tips.push(`完整度偏低，请确保每个单词都读完整，不要吞音或跳过某些词。`);
  }
  if (tips.length === 0) {
    tips.push("整体表现良好，继续保持！");
  }

  return (
    <div
      style={{
        backgroundColor: "#eff6ff",
        border: "1px solid #bfdbfe",
        borderRadius: "10px",
        padding: "10px 14px",
        marginBottom: "12px",
      }}
    >
      <div style={{ fontSize: "11px", fontWeight: "600", color: "#1d4ed8", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        AI 诊断
      </div>
      {tips.map((tip, i) => (
        <div key={i} style={{ fontSize: "12px", color: "#1e40af", lineHeight: "1.7" }}>
          {tip}
        </div>
      ))}
    </div>
  );
}

function MatchSummary({ matched, total, added, missing, misread }) {
  const badCount = added + missing + misread;
  if (badCount === 0) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "10px" }}>
      {added > 0 && (
        <span style={badgeStyle("#fef9c3", "#713f12", "#fde047")}>多读了 {added} 个词</span>
      )}
      {missing > 0 && (
        <span style={badgeStyle("#fee2e2", "#991b1b", "#fca5a5")}>漏读了 {missing} 个词</span>
      )}
      {misread > 0 && (
        <span style={badgeStyle("#fee2e2", "#991b1b", "#fca5a5")}>读错 {misread} 个词</span>
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

function ScoreExplanation() {
  return (
    <div style={{ fontSize: "11px", color: "#9ca3af", textAlign: "center", marginBottom: "14px", lineHeight: "1.5" }}>
      发音 · 流畅度（连读/弱读/停顿） · 完整度（是否读完所有词）
    </div>
  );
}

export default function SOEResultCard({ result, onClose }) {
  const [visible, setVisible] = useState(false);
  const [showAllWords, setShowAllWords] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
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

  // 拆分有问题和无问题的词
  const problemWords = words.filter((w) => {
    const hasLowScore = (w.pronunciation_score || 0) < LOW_SCORE_THRESHOLD;
    return w.match_tag !== 0 || hasLowScore;
  });
  const goodWords = words.filter((w) => {
    const hasLowScore = (w.pronunciation_score || 0) < LOW_SCORE_THRESHOLD;
    return w.match_tag === 0 && !hasLowScore;
  });

  const displayProblemWords = showAllWords ? problemWords : problemWords.slice(0, 15);
  const displayGoodWords = showAllWords ? goodWords : goodWords.slice(0, 5);

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
    width: "460px",
    maxWidth: "92vw",
    maxHeight: "88vh",
    overflowY: "auto",
    boxShadow: "0 20px 40px rgba(0,0,0,0.15)",
    transform: visible ? "scale(1)" : "scale(0.9)",
    transition: "transform 0.2s ease",
    position: "relative",
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
              fontSize: "56px",
              fontWeight: "700",
              color: scoreColor(totalScore),
              textAlign: "center",
              lineHeight: "1.2",
            }}
          >
            {totalScore}
          </div>
          <div style={{ textAlign: "center", fontSize: "13px", color: "#6b7280", marginBottom: "4px" }}>
            综合评分{total > 0 ? ` · ${matched}/${total} 词匹配` : ""}
          </div>

          {/* Score explanation */}
          <ScoreExplanation />

          {/* Sub-scores */}
          <div style={{ display: "flex", justifyContent: "space-around", marginBottom: "16px" }}>
            <ScoreCircle score={pronunciationScore} label="发音" color="#3b82f6" />
            <ScoreCircle score={fluencyScore} label="流畅度" color="#8b5cf6" />
            <ScoreCircle score={completenessScore} label="完整度" color="#10b981" />
          </div>

          {/* Match summary badges */}
          <MatchSummary matched={matched} total={total} added={added} missing={missing} misread={misread} />

          {/* AI 诊断 */}
          <AIDiagnostic words={words} fluencyScore={fluencyScore} completenessScore={completenessScore} />

          {/* 问题词（有问题的放前面） */}
          {problemWords.length > 0 && (
            <div style={{ marginBottom: "12px" }}>
              <div
                style={{
                  fontSize: "11px",
                  color: "#9ca3af",
                  marginBottom: "6px",
                  fontWeight: "600",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                需改进 ({problemWords.length})
              </div>
              <div
                style={{
                  border: "1px solid #fee2e2",
                  borderRadius: "10px",
                  padding: "10px 12px",
                  backgroundColor: "#fffafafa",
                  maxHeight: showAllWords ? "none" : "240px",
                  overflowY: showAllWords ? "visible" : "auto",
                }}
              >
                {displayProblemWords.map((w, i) => (
                  <WordFeedbackRow key={i} word={w} />
                ))}
                {!showAllWords && problemWords.length > 15 && (
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
                    展开全部 {problemWords.length} 个词 ↓
                  </button>
                )}
              </div>
            </div>
          )}

          {/* 良好词（高分且匹配正确的） */}
          {goodWords.length > 0 && (
            <div style={{ marginBottom: "12px" }}>
              <div
                style={{
                  fontSize: "11px",
                  color: "#9ca3af",
                  marginBottom: "6px",
                  fontWeight: "600",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                表现良好 ({goodWords.length})
              </div>
              <div
                style={{
                  border: "1px solid #dcfce7",
                  borderRadius: "10px",
                  padding: "8px 12px",
                  backgroundColor: "#f0fdf4",
                }}
              >
                {displayGoodWords.map((w, i) => (
                  <WordFeedbackRow key={i} word={w} />
                ))}
                {!showAllWords && goodWords.length > 5 && (
                  <div style={{ fontSize: "11px", color: "#6b7280", textAlign: "center", paddingTop: "4px" }}>
                    其余 {goodWords.length - 5} 个词表现良好
                  </div>
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
    </>
  );
}
