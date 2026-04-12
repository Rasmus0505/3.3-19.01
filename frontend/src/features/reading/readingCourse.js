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

function buildBeatId(sceneId, index) {
  return `${sceneId}-beat-${index + 1}`;
}

function createRuntimeV2(scenes) {
  const firstSceneId = scenes?.[0]?.id;
  return {
    activeSceneIndex: 0,
    revealCountsByScene: firstSceneId ? { [firstSceneId]: 1 } : {},
    completedSceneIds: [],
    quiz: {},
    output: {},
    discussion: {},
    completedAt: null,
    lastViewedAt: Date.now(),
    totalScenes: Array.isArray(scenes) ? scenes.length : 0,
  };
}

const DEFAULT_READING_CAST_STUDENTS = [
  {
    avatarKey: "student-curious",
    name: "Lena",
    persona: "A curious student who asks the question you were about to ask.",
  },
  {
    avatarKey: "student-thinker",
    name: "Max",
    persona: "A thoughtful student who pauses, connects ideas, and checks the logic.",
  },
];

function buildCastStudents(students = []) {
  return DEFAULT_READING_CAST_STUDENTS.map((fallback, index) => {
    const fromAvatarKey = students.find(
      (student) =>
        String(student?.avatarKey || student?.avatar_key || "").trim().toLowerCase() ===
        fallback.avatarKey,
    );
    const student = fromAvatarKey || students[index] || {};
    return {
      avatarKey: String(student.avatarKey || student.avatar_key || fallback.avatarKey),
      name: String(student.name || fallback.name),
      persona: String(student.persona || fallback.persona),
    };
  });
}

function toConversationMessages(segments = []) {
  const students = buildCastStudents();
  return segments.slice(0, 2).flatMap((segment, index) => {
    const student = students[index % students.length];
    const heading = segment.heading || `Part ${index + 1}`;
    return [
      {
        speaker: index === 0 ? "teacher" : "assistant",
        avatarKey: index === 0 ? "teacher" : "assistant",
        text:
          index === 0
            ? `Let's anchor on ${heading}. The writer is pushing one central idea before layering detail.`
            : `I notice ${heading} becomes easier once we track the cause-and-effect chain instead of every single word.`,
      },
      {
        speaker: "student",
        avatarKey: student.avatarKey,
        name: student.name,
        text:
          index === 0
            ? `So I should read for the main direction first, then come back for the precise wording?`
            : `That means the difficult phrases are supporting the argument, not replacing it.`,
      },
    ];
  });
}

function createScene(type, title, goal, beats = [], extra = {}) {
  return {
    id: extra.id || type,
    type,
    title,
    goal,
    beats: beats.map((beat, index) => ({
      id: String(beat?.id || buildBeatId(extra.id || type, index)),
      type: String(beat?.type || "teacher_talk"),
      speaker: beat?.speaker ? String(beat.speaker) : null,
      avatarKey: beat?.avatarKey ? String(beat.avatarKey) : "",
      name: beat?.name ? String(beat.name) : "",
      title: beat?.title ? String(beat.title) : "",
      text: beat?.text ? String(beat.text) : "",
      items: Array.isArray(beat?.items) ? beat.items : [],
      keywords: Array.isArray(beat?.keywords) ? beat.keywords : [],
      points: Array.isArray(beat?.points) ? beat.points : [],
      messages: Array.isArray(beat?.messages) ? beat.messages : [],
      segment: beat?.segment && typeof beat.segment === "object" ? beat.segment : null,
      aside: beat?.aside ? String(beat.aside) : "",
      cta: beat?.cta ? String(beat.cta) : "",
    })),
    task: extra.task && typeof extra.task === "object" ? extra.task : null,
    liveHook: extra.liveHook && typeof extra.liveHook === "object" ? extra.liveHook : null,
  };
}

function buildV2Course({
  articleId,
  articleTitle = "",
  originalText = "",
  rewrittenText = "",
  targetLevel = "B1",
  validI1Words = [],
  validAboveI1Words = [],
}) {
  const title = String(articleTitle || "").trim() || "Reading Classroom";
  const primaryText = normalizeText(rewrittenText) || normalizeText(originalText);
  const supportText = normalizeText(originalText) || primaryText;
  const segments = buildFallbackSegments(supportText, primaryText);
  const keywords = dedupeWords([...validAboveI1Words, ...validI1Words]);
  const explanationPoints = (keywords.length > 0 ? keywords : ["structure", "signal", "detail"]).slice(0, 4);

  const scenes = [
    createScene(
      "entry",
      "进入课堂",
      "先知道这节阅读课要怎么推进。",
      [
        {
          type: "hero",
          speaker: "teacher",
          title: "今天这节课怎么学",
          text: "We will move through this article as a guided classroom, not as a wall of text.",
        },
        {
          type: "bullet_list",
          title: "课堂目标",
          items: [
            "先用 i+1 版本抓住主线意思",
            "遇到关键难点再回看原文支撑",
            "最后把理解变成你自己的英文输出",
          ],
        },
        {
          type: "teacher_talk",
          speaker: "teacher",
          text: "Stay with the flow. You do not need to solve every difficult word before the meaning appears.",
        },
      ],
    ),
    createScene(
      "preview",
      "预热与关键词",
      "先建立阅读预期，再带着关注点进入正文。",
      [
        {
          type: "teacher_talk",
          speaker: "teacher",
          text: "Before we read closely, scan the watchwords and predict what kind of argument or story is coming.",
        },
        {
          type: "keyword_grid",
          title: "Watchwords",
          keywords: keywords.map((word) => ({
            word,
            reason: "This word carries part of the article's meaning load.",
            tip: "Try paraphrasing it in simpler English before checking the original line again.",
          })),
        },
        {
          type: "teacher_talk",
          speaker: "teacher",
          text: "When you already know the likely pressure points, the reading becomes much smoother.",
        },
      ],
    ),
    createScene(
      "guided_reading",
      "老师带读",
      "一段一段推进理解，不再上下扫整篇文章。",
      segments.map((segment) => ({
        type: "reading_segment",
        speaker: "teacher",
        title: segment.heading,
        segment,
        aside: segment.focus,
        cta: segment.question,
      })),
    ),
    createScene(
      "deep_explain",
      "讲透难点",
      "把真正值钱的词、表达和逻辑讲明白。",
      [
        {
          type: "teacher_talk",
          speaker: "teacher",
          text: "Now we slow down only for the places that actually change your understanding of the article.",
        },
        {
          type: "explanation_grid",
          title: "重点拆解",
          points: explanationPoints.map((label) => ({
            label,
            explanation: `Link "${label}" back to the surrounding sentence before translating it word by word.`,
            example: "Explain the idea in simpler English, then compare it with the original wording.",
          })),
        },
      ],
    ),
    createScene(
      "checkpoint",
      "理解检查",
      "确认你已经抓住文章主线。",
      [
        {
          type: "teacher_talk",
          speaker: "teacher",
          text: "Answer quickly. This checkpoint is here to confirm direction, not to trap you.",
        },
      ],
      {
        task: {
          instructions: "Answer the questions before moving to the discussion scene.",
          questions: [
            {
              type: "mcq",
              question: "What should you focus on first in this lesson?",
              options: [
                "The main idea of each part",
                "Every difficult word separately",
                "Only the title",
                "Only the final paragraph",
              ],
              answer: "The main idea of each part",
            },
            {
              type: "fill",
              sentence: "One useful lesson word is ___.",
              answer: keywords[0] || "main idea",
            },
          ],
        },
      },
    ),
    createScene(
      "discussion",
      "课堂讨论",
      "先看老师和同学怎么谈，再决定你要不要追问。",
      [
        {
          type: "conversation",
          title: "示范讨论",
          messages: toConversationMessages(segments),
        },
        {
          type: "teacher_talk",
          speaker: "teacher",
          text: "If one point still feels fuzzy, this is the moment to ask it instead of carrying confusion into the writing task.",
        },
      ],
      {
        liveHook: {
          enabled: true,
          prompt: "Continue the classroom discussion as the lead reading teacher. Keep the explanation concise, natural, and tied to the article.",
          suggestedQuestions: [
            "Can you restate the main claim in simpler English?",
            "Which sentence should I reread if I still feel lost?",
            "What is the most important word or phrase in this article?",
          ],
        },
      },
    ),
    createScene(
      "output",
      "你的输出",
      "把输入转成你自己的表达。",
      [
        {
          type: "teacher_talk",
          speaker: "teacher",
          text: "Now use your own English. Short, clear, and controlled is better than sounding advanced but vague.",
        },
      ],
      {
        task: {
          prompt: "Write 3-4 sentences to explain the article's main idea and one supporting detail.",
          guidance: "Use at least one lesson word and keep your explanation clear.",
          checklist: [
            "State the main idea",
            "Add one supporting detail",
            "Use one key word from the lesson",
          ],
        },
      },
    ),
    createScene(
      "wrap_up",
      "收束与下一步",
      "把今天的节奏和重点收回来。",
      [
        {
          type: "teacher_talk",
          speaker: "teacher",
          text: "Meaning first, precision second, output last. That is the rhythm of this reading class.",
        },
        {
          type: "bullet_list",
          title: "带走三件事",
          items: [
            "Use the i+1 version to enter the text quickly",
            "Return to the original wording only when precision matters",
            "Turn reading into output so the language sticks",
          ],
        },
        {
          type: "teacher_talk",
          speaker: "teacher",
          text: "Pick one segment after class and paraphrase it aloud in your own English.",
        },
      ],
    ),
  ];

  return {
    schema_version: 2,
    mode: "reading_classroom_v2",
    article_id: articleId || "",
    article_title: title,
    target_level: targetLevel,
    generated_at: new Date().toISOString(),
    course_meta: {
      cover_kicker: "Immersive Reading",
      summary: "Teacher-led reading flow with guided explanation, discussion, and output.",
      estimated_minutes: Math.max(8, scenes.length * 2),
    },
    cast: {
      teacher: {
        name: "Coach Mira",
        persona: "A calm reading coach who helps you move from meaning to language and then to output.",
        tone: "focused and encouraging",
      },
      assistant: {
        name: "Noah",
        persona: "A concise teaching assistant who reframes ideas in simpler English.",
        tone: "clear and practical",
      },
      students: buildCastStudents(),
    },
    source: {
      primary_text: "rewritten",
      segment_count: segments.length,
      keywords,
      word_counts: {
        original: splitSentences(supportText).length,
        rewritten: splitSentences(primaryText).length,
      },
    },
    scenes,
    runtime: createRuntimeV2(scenes),
  };
}

function upgradeV1CourseToV2(course) {
  const intro = course?.scenes?.find((scene) => scene.type === "intro");
  const warmup = course?.scenes?.find((scene) => scene.type === "warmup");
  const guided = course?.scenes?.find((scene) => scene.type === "close_reading");
  const explain = course?.scenes?.find((scene) => scene.type === "explanation");
  const quiz = course?.scenes?.find((scene) => scene.type === "quiz");
  const output = course?.scenes?.find((scene) => scene.type === "output");
  const wrapUp = course?.scenes?.find((scene) => scene.type === "wrap_up");

  const keywordItems = warmup?.content?.keywords || [];
  const keywords = keywordItems.map((item) => item.word).filter(Boolean);
  const segments = guided?.content?.segments || [];

  const scenes = [
    createScene(
      "entry",
      intro?.title || "进入课堂",
      intro?.goal || "建立课堂目标。",
      [
        {
          type: "hero",
          speaker: "teacher",
          title: "进入课堂",
          text: intro?.content?.hook || "This lesson turns one article into a guided reading classroom.",
        },
        {
          type: "teacher_talk",
          speaker: "teacher",
          text: intro?.content?.teacher_opening || "We will read for meaning first and return to precise language later.",
        },
        {
          type: "bullet_list",
          title: "课堂目标",
          items: intro?.content?.objectives || [],
        },
      ],
    ),
    createScene(
      "preview",
      warmup?.title || "预热与关键词",
      warmup?.goal || "建立预期。",
      [
        {
          type: "teacher_talk",
          speaker: "teacher",
          text: warmup?.content?.preview || "Scan the keywords before reading closely.",
        },
        {
          type: "keyword_grid",
          title: "Watchwords",
          keywords: keywordItems,
        },
        {
          type: "teacher_talk",
          speaker: "teacher",
          text: warmup?.content?.check_in || "Which word do you want to watch for?",
        },
      ],
    ),
    createScene(
      "guided_reading",
      guided?.title || "老师带读",
      guided?.goal || "按段推进。",
      segments.map((segment) => ({
        type: "reading_segment",
        speaker: "teacher",
        title: segment.heading,
        segment,
        aside: segment.focus,
        cta: segment.question,
      })),
    ),
    createScene(
      "deep_explain",
      explain?.title || "讲透难点",
      explain?.goal || "拆解重点。",
      [
        {
          type: "explanation_grid",
          title: "重点拆解",
          points: explain?.content?.points || [],
        },
      ],
    ),
    createScene(
      "checkpoint",
      quiz?.title || "理解检查",
      quiz?.goal || "确认理解。",
      [
        {
          type: "teacher_talk",
          speaker: "teacher",
          text: quiz?.content?.instructions || "Answer these quick checks before moving on.",
        },
      ],
      {
        task: {
          instructions: quiz?.content?.instructions || "",
          questions: quiz?.content?.questions || [],
        },
      },
    ),
    createScene(
      "discussion",
      "课堂讨论",
      "补上还没问出来的问题。",
      [
        {
          type: "conversation",
          title: "示范讨论",
          messages: toConversationMessages(segments),
        },
      ],
      {
        liveHook: {
          enabled: true,
          prompt: "Continue the classroom discussion as the lead reading teacher.",
          suggestedQuestions: [
            "Can you explain the core idea again?",
            "Which part should I reread?",
            "What does the hardest phrase really mean here?",
          ],
        },
      },
    ),
    createScene(
      "output",
      output?.title || "你的输出",
      output?.goal || "完成输出。",
      [
        {
          type: "teacher_talk",
          speaker: "teacher",
          text: output?.content?.guidance || "Use your own English to restate the article.",
        },
      ],
      {
        task: {
          prompt: output?.content?.prompt || "Write a short summary in your own words.",
          guidance: output?.content?.guidance || "",
          checklist: output?.content?.checklist || [],
        },
      },
    ),
    createScene(
      "wrap_up",
      wrapUp?.title || "收束与下一步",
      wrapUp?.goal || "回收重点。",
      [
        {
          type: "teacher_talk",
          speaker: "teacher",
          text: wrapUp?.content?.teacher_closing || "Meaning first, precision second, output last.",
        },
        {
          type: "bullet_list",
          title: "带走三件事",
          items: wrapUp?.content?.takeaways || [],
        },
        {
          type: "teacher_talk",
          speaker: "teacher",
          text: wrapUp?.content?.next_step || "Paraphrase one segment aloud after class.",
        },
      ],
    ),
  ];

  return {
    schema_version: 2,
    mode: "reading_classroom_v2",
    article_id: course?.article_id || "",
    article_title: course?.article_title || "Reading Classroom",
    target_level: course?.target_level || "B1",
    generated_at: course?.generated_at || new Date().toISOString(),
    course_meta: {
      cover_kicker: "Immersive Reading",
      summary: "Teacher-led reading flow upgraded from the legacy classroom format.",
      estimated_minutes: Math.max(8, scenes.length * 2),
    },
    cast: {
      teacher: course?.teacher || {
        name: "Coach Mira",
        persona: "A calm reading coach.",
        tone: "focused",
      },
      assistant: {
        name: "Noah",
        persona: "A concise teaching assistant who reframes ideas simply.",
        tone: "clear",
      },
      students: buildCastStudents(course?.cast?.students),
    },
    source: course?.source || {
      primary_text: "rewritten",
      segment_count: segments.length,
      keywords,
    },
    scenes,
    runtime: createRuntimeV2(scenes),
  };
}

function normalizeMessage(message, index) {
  if (!message || typeof message !== "object") return null;
  const text = String(message.text || message.content || "").trim();
  if (!text) return null;
  return {
    id: String(message.id || `message-${index + 1}`),
    speaker: String(message.speaker || message.role || "teacher"),
    avatarKey: String(
      message.avatarKey || message.avatar_key || message.speakerKey || message.speaker_key || "",
    ),
    name: String(message.name || ""),
    text,
  };
}

function normalizeBeat(beat, sceneId, index) {
  const normalized = {
    id: String(beat?.id || buildBeatId(sceneId, index)),
    type: String(beat?.type || "teacher_talk"),
    speaker: beat?.speaker ? String(beat.speaker) : null,
    avatarKey: String(beat?.avatarKey || beat?.avatar_key || ""),
    name: String(beat?.name || ""),
    title: String(beat?.title || ""),
    text: String(beat?.text || ""),
    aside: String(beat?.aside || ""),
    cta: String(beat?.cta || ""),
    items: Array.isArray(beat?.items) ? beat.items.map((item) => String(item || "").trim()).filter(Boolean) : [],
    keywords: Array.isArray(beat?.keywords)
      ? beat.keywords
          .map((item) => {
            if (!item || typeof item !== "object") return null;
            const word = String(item.word || "").trim();
            if (!word) return null;
            return {
              word,
              reason: String(item.reason || ""),
              tip: String(item.tip || ""),
            };
          })
          .filter(Boolean)
      : [],
    points: Array.isArray(beat?.points)
      ? beat.points
          .map((item) => {
            if (!item || typeof item !== "object") return null;
            const label = String(item.label || "").trim();
            const explanation = String(item.explanation || "").trim();
            if (!label || !explanation) return null;
            return {
              label,
              explanation,
              example: String(item.example || ""),
            };
          })
          .filter(Boolean)
      : [],
    messages: Array.isArray(beat?.messages)
      ? beat.messages.map(normalizeMessage).filter(Boolean)
      : [],
    segment: beat?.segment && typeof beat.segment === "object"
      ? {
          id: String(beat.segment.id || `segment-${index + 1}`),
          heading: String(beat.segment.heading || beat.title || `Part ${index + 1}`),
          rewritten_text: String(beat.segment.rewritten_text || ""),
          original_text: String(beat.segment.original_text || ""),
          focus: String(beat.segment.focus || ""),
          teacher_note: String(beat.segment.teacher_note || ""),
          question: String(beat.segment.question || ""),
        }
      : null,
  };
  return normalized;
}

function normalizeScene(scene, index) {
  const sceneId = String(scene?.id || scene?.type || `scene-${index + 1}`);
  return {
    id: sceneId,
    type: String(scene?.type || "entry"),
    title: String(scene?.title || `Scene ${index + 1}`),
    goal: String(scene?.goal || ""),
    beats: Array.isArray(scene?.beats) ? scene.beats.map((beat, beatIndex) => normalizeBeat(beat, sceneId, beatIndex)) : [],
    task: scene?.task && typeof scene.task === "object"
      ? {
          ...scene.task,
          instructions: String(scene.task.instructions || ""),
          questions: Array.isArray(scene.task.questions) ? scene.task.questions : [],
          prompt: String(scene.task.prompt || ""),
          guidance: String(scene.task.guidance || ""),
          checklist: Array.isArray(scene.task.checklist)
            ? scene.task.checklist.map((item) => String(item || "").trim()).filter(Boolean)
            : [],
        }
      : null,
    liveHook: (scene?.liveHook || scene?.live_hook) && typeof (scene?.liveHook || scene?.live_hook) === "object"
      ? {
          enabled: (scene.liveHook || scene.live_hook).enabled !== false,
          prompt: String((scene.liveHook || scene.live_hook).prompt || ""),
          suggestedQuestions: Array.isArray((scene.liveHook || scene.live_hook).suggestedQuestions || (scene.liveHook || scene.live_hook).suggested_questions)
            ? ((scene.liveHook || scene.live_hook).suggestedQuestions || (scene.liveHook || scene.live_hook).suggested_questions)
                .map((item) => String(item || "").trim())
                .filter(Boolean)
            : [],
        }
      : null,
  };
}

function normalizeRuntime(runtime, scenes) {
  const fallback = createRuntimeV2(scenes);
  const sceneIds = new Set(scenes.map((scene) => scene.id));
  const revealCounts = {};
  Object.entries(runtime?.revealCountsByScene || {}).forEach(([sceneId, count]) => {
    if (!sceneIds.has(sceneId)) return;
    const totalBeats = scenes.find((scene) => scene.id === sceneId)?.beats?.length || 0;
    revealCounts[sceneId] = Math.max(0, Math.min(totalBeats || 0, Number(count) || 0));
  });
  const activeSceneIndex = Math.max(
    0,
    Math.min(
      scenes.length - 1,
      Number.isFinite(Number(runtime?.activeSceneIndex)) ? Number(runtime.activeSceneIndex) : fallback.activeSceneIndex,
    ),
  );
  const activeSceneId = scenes[activeSceneIndex]?.id;
  if (activeSceneId && !revealCounts[activeSceneId]) {
    revealCounts[activeSceneId] = 1;
  }

  return {
    ...fallback,
    ...(runtime || {}),
    activeSceneIndex,
    revealCountsByScene: revealCounts,
    completedSceneIds: Array.isArray(runtime?.completedSceneIds)
      ? runtime.completedSceneIds.filter((sceneId) => sceneIds.has(sceneId))
      : [],
    quiz: runtime?.quiz && typeof runtime.quiz === "object" ? runtime.quiz : {},
    output: runtime?.output && typeof runtime.output === "object" ? runtime.output : {},
    discussion: runtime?.discussion && typeof runtime.discussion === "object" ? runtime.discussion : {},
    totalScenes: scenes.length,
    lastViewedAt: runtime?.lastViewedAt || Date.now(),
  };
}

export function looksLikeReadingCourse(value) {
  return Boolean(
    value &&
    (value.mode === "reading_classroom_v1" || value.mode === "reading_classroom_v2") &&
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
  return buildV2Course({
    articleId,
    articleTitle,
    originalText,
    rewrittenText,
    targetLevel,
    validI1Words,
    validAboveI1Words,
  });
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
  let course = value;
  if (!looksLikeReadingCourse(course)) {
    course = fallback;
  }
  if (!looksLikeReadingCourse(course)) {
    return null;
  }

  if (course.mode === "reading_classroom_v1") {
    course = upgradeV1CourseToV2(course);
  }

  const scenes = (Array.isArray(course.scenes) ? course.scenes : []).map(normalizeScene);
  if (scenes.length === 0) {
    return null;
  }

  return {
    ...course,
    schema_version: 2,
    mode: "reading_classroom_v2",
    article_id: String(course.article_id || ""),
    article_title: String(course.article_title || "Reading Classroom"),
    target_level: String(course.target_level || "B1"),
    generated_at: course.generated_at || new Date().toISOString(),
    courseMeta: {
      coverKicker: String(course.courseMeta?.coverKicker || course.course_meta?.cover_kicker || "Immersive Reading"),
      summary: String(course.courseMeta?.summary || course.course_meta?.summary || ""),
      estimatedMinutes: Number(
        course.courseMeta?.estimatedMinutes || course.course_meta?.estimated_minutes || Math.max(8, scenes.length * 2),
      ),
    },
    cast: {
      teacher: {
        name: String(course.cast?.teacher?.name || course.teacher?.name || "Coach Mira"),
        persona: String(course.cast?.teacher?.persona || course.teacher?.persona || "A calm reading coach."),
        tone: String(course.cast?.teacher?.tone || course.teacher?.tone || "focused"),
      },
      assistant: {
        name: String(course.cast?.assistant?.name || "Noah"),
        persona: String(course.cast?.assistant?.persona || "A concise teaching assistant."),
        tone: String(course.cast?.assistant?.tone || "clear"),
      },
      students: buildCastStudents(course.cast?.students),
    },
    source: {
      ...(course.source || {}),
      primary_text: String(course.source?.primary_text || "rewritten"),
      segment_count: Number(course.source?.segment_count || scenes.find((scene) => scene.type === "guided_reading")?.beats?.length || 0),
      keywords: Array.isArray(course.source?.keywords) ? course.source.keywords.map((item) => String(item || "").trim()).filter(Boolean) : [],
    },
    scenes,
    runtime: normalizeRuntime(course.runtime, scenes),
  };
}
