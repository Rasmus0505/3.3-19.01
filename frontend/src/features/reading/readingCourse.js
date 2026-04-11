function normalizeText(value) {
  return String(value || "").replace(/\r/g, "\n").trim();
}

function splitSentences(text) {
  return normalizeText(text)
    .split(/(?<=[.!?])\s+|\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function chunkSentences(sentences, count = 3) {
  if (!Array.isArray(sentences) || sentences.length === 0) return [];
  const chunkCount = Math.max(1, Math.min(count, sentences.length));
  const baseSize = Math.floor(sentences.length / chunkCount);
  const remainder = sentences.length % chunkCount;
  const chunks = [];
  let start = 0;
  for (let index = 0; index < chunkCount; index += 1) {
    const size = baseSize + (index < remainder ? 1 : 0);
    chunks.push(sentences.slice(start, start + size));
    start += size;
  }
  return chunks;
}

function buildFallbackSegments(originalText, rewrittenText) {
  const originalGroups = chunkSentences(splitSentences(originalText), 3);
  const rewrittenGroups = chunkSentences(splitSentences(rewrittenText), 3);
  const total = Math.max(originalGroups.length, rewrittenGroups.length, 1);
  return Array.from({ length: total }, (_, index) => ({
    id: `segment-${index + 1}`,
    heading: `Part ${index + 1}`,
    rewritten_text: (rewrittenGroups[index] || []).join(" "),
    original_text: (originalGroups[index] || []).join(" "),
    focus: "先抓住这一部分的主旨，再回看措辞。",
    teacher_note: "Try to explain this part in simple English before checking every difficult phrase.",
    question: "What is the key message of this part?",
  }));
}

function dedupeWords(words, limit = 8) {
  const seen = new Set();
  const output = [];
  for (const word of Array.isArray(words) ? words : []) {
    const normalized = String(word || "").trim();
    if (!normalized) continue;
    const lowered = normalized.toLowerCase();
    if (seen.has(lowered)) continue;
    seen.add(lowered);
    output.push(normalized);
    if (output.length >= limit) break;
  }
  return output;
}

function createRuntime(scenes) {
  return {
    activeSceneIndex: 0,
    completedSceneIds: [],
    quiz: {},
    output: {},
    completedAt: null,
    lastViewedAt: Date.now(),
    totalScenes: Array.isArray(scenes) ? scenes.length : 0,
  };
}

export function looksLikeReadingCourse(value) {
  return Boolean(
    value &&
    value.mode === "reading_classroom_v1" &&
    Array.isArray(value.scenes) &&
    value.scenes.length > 0,
  );
}

export function buildFallbackReadingCourse({
  articleId,
  articleTitle = "",
  originalText = "",
  rewrittenText = "",
  targetLevel = "B1",
  validI1Words = [],
  validAboveI1Words = [],
}) {
  const segments = buildFallbackSegments(originalText, rewrittenText || originalText);
  const keywords = dedupeWords([...validAboveI1Words, ...validI1Words]);
  const title = String(articleTitle || "").trim() || "Reading Classroom";
  const rewrittenBase = normalizeText(rewrittenText) || normalizeText(originalText);
  const originalBase = normalizeText(originalText) || rewrittenBase;

  return {
    schema_version: 1,
    mode: "reading_classroom_v1",
    article_id: articleId || "",
    article_title: title,
    target_level: targetLevel,
    generated_at: new Date().toISOString(),
    teacher: {
      name: "Coach Mira",
      persona: "A calm reading coach who helps you move from meaning to language and then to output.",
      tone: "focused and encouraging",
    },
    source: {
      primary_text: "rewritten",
      word_counts: {
        original: splitSentences(originalBase).length,
        rewritten: splitSentences(rewrittenBase).length,
      },
    },
    scenes: [
      {
        id: "intro",
        type: "intro",
        title: "进入课堂",
        goal: "先建立本课目标和推进方式。",
        content: {
          hook: "This article is now turned into a guided reading classroom.",
          teacher_opening: "We will read for meaning first, then return to difficult wording, and finally produce your own answer.",
          objectives: [
            "Use the i+1 version as the main reading path",
            "Check original wording only when needed",
            "Finish with a short English output",
          ],
        },
      },
      {
        id: "warmup",
        type: "warmup",
        title: "预热与关键词",
        goal: "先看本课重点词和阅读关注点。",
        content: {
          preview: "Scan the key words before you read each part closely.",
          keywords: keywords.map((word) => ({
            word,
            reason: "This word helps you unlock the article's meaning.",
            tip: "Try to paraphrase it before checking the original sentence again.",
          })),
          check_in: "Which word feels familiar, and which one should you watch carefully?",
        },
      },
      {
        id: "close-reading",
        type: "close_reading",
        title: "分段精读",
        goal: "按部分推进理解，并在需要时回看原文。",
        content: {
          segments,
        },
      },
      {
        id: "explanation",
        type: "explanation",
        title: "难点拆解",
        goal: "把文章里的高价值难点讲透。",
        content: {
          points: (keywords.length > 0 ? keywords : ["structure"]).slice(0, 4).map((word) => ({
            label: word,
            explanation: `Link "${word}" back to the surrounding sentence before translating it word by word.`,
            example: "Explain the idea in simpler English, then compare with the original wording.",
          })),
        },
      },
      {
        id: "quiz",
        type: "quiz",
        title: "理解检查",
        goal: "确认你抓住了文章重点。",
        content: {
          instructions: "Answer these quick checks before moving to the writing task.",
          questions: [
            {
              type: "mcq",
              question: "What should you focus on first when reading this lesson?",
              options: [
                "The main idea of each part",
                "Every difficult word separately",
                "Only the title",
                "Only the last sentence",
              ],
              answer: "The main idea of each part",
            },
          ],
        },
      },
      {
        id: "output",
        type: "output",
        title: "输出任务",
        goal: "用自己的英语重新组织内容。",
        content: {
          prompt: "Write 3-4 sentences to explain the article's main idea and one supporting detail.",
          guidance: "Use at least one lesson word and keep your explanation clear.",
          checklist: [
            "State the main idea",
            "Add one supporting detail",
            "Use one key word from the lesson",
          ],
        },
      },
      {
        id: "wrap-up",
        type: "wrap_up",
        title: "课堂收束",
        goal: "把课堂重点收回来，告诉你下一步练什么。",
        content: {
          takeaways: [
            "Use i+1 text to enter the article quickly",
            "Return to original wording for precise understanding",
            "Turn reading into output to reinforce memory",
          ],
          teacher_closing: "Meaning first, precision second, output last. That is the rhythm of this reading class.",
          next_step: "Pick one segment and paraphrase it aloud in your own English.",
        },
      },
    ],
    runtime: createRuntime([
      "intro",
      "warmup",
      "close-reading",
      "explanation",
      "quiz",
      "output",
      "wrap-up",
    ]),
  };
}

export function buildFallbackReadingCourseFromPack(pack = {}, articleId = "") {
  if (!pack) return null;
  return buildFallbackReadingCourse({
    articleId,
    articleTitle: pack.title || "",
    originalText: pack.originalText || "",
    rewrittenText: pack.rewrittenText || pack.originalText || "",
    targetLevel: pack.targetLevel || "B1",
    validI1Words: pack.validI1Words || [],
    validAboveI1Words: pack.validAboveI1Words || [],
  });
}

export function normalizeReadingCourse(value, fallback = null) {
  if (!looksLikeReadingCourse(value)) {
    return fallback;
  }

  const scenes = value.scenes.map((scene, index) => ({
    id: String(scene?.id || `scene-${index + 1}`),
    type: String(scene?.type || "intro"),
    title: String(scene?.title || `Scene ${index + 1}`),
    goal: String(scene?.goal || ""),
    content: typeof scene?.content === "object" && scene.content ? scene.content : {},
  }));

  return {
    ...value,
    scenes,
    runtime: {
      ...createRuntime(scenes),
      ...(value.runtime || {}),
      completedSceneIds: Array.isArray(value?.runtime?.completedSceneIds)
        ? value.runtime.completedSceneIds
        : [],
      activeSceneIndex: Math.max(
        0,
        Math.min(
          scenes.length - 1,
          Number.isFinite(Number(value?.runtime?.activeSceneIndex))
            ? Number(value.runtime.activeSceneIndex)
            : 0,
        ),
      ),
      quiz: value?.runtime?.quiz && typeof value.runtime.quiz === "object" ? value.runtime.quiz : {},
      output: value?.runtime?.output && typeof value.runtime.output === "object" ? value.runtime.output : {},
      totalScenes: scenes.length,
      lastViewedAt: value?.runtime?.lastViewedAt || Date.now(),
    },
  };
}
