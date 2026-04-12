export const READING_ACTION_TYPES = {
  SPEECH: "speech",
  SPOTLIGHT: "spotlight",
  DISCUSSION: "discussion",
  QUIZ: "quiz",
  OUTPUT: "output",
};

function createAction(base = {}) {
  return {
    id: String(base.id || crypto.randomUUID()),
    type: String(base.type || READING_ACTION_TYPES.SPEECH),
    role: base.role ? String(base.role) : "teacher",
    title: base.title ? String(base.title) : "",
    text: base.text ? String(base.text) : "",
    panel: base.panel && typeof base.panel === "object" ? base.panel : null,
    prompt: base.prompt ? String(base.prompt) : "",
    suggestedQuestions: Array.isArray(base.suggestedQuestions) ? base.suggestedQuestions : [],
    task: base.task && typeof base.task === "object" ? base.task : null,
  };
}

function speechFromBeat(beat) {
  return createAction({
    id: `${beat.id}-speech`,
    type: READING_ACTION_TYPES.SPEECH,
    role: beat.speaker || "teacher",
    title: beat.title || "",
    text: beat.text || beat.segment?.teacher_note || "",
  });
}

function spotlightFromBeat(beat) {
  return createAction({
    id: `${beat.id}-spotlight`,
    type: READING_ACTION_TYPES.SPOTLIGHT,
    role: beat.speaker || "teacher",
    title: beat.title || beat.segment?.heading || "",
    panel: {
      kind: beat.type,
      items: beat.items || [],
      keywords: beat.keywords || [],
      points: beat.points || [],
      segment: beat.segment || null,
      aside: beat.aside || "",
      cta: beat.cta || "",
    },
  });
}

export function buildSceneActionSequence(scene) {
  const actions = [];

  (scene?.beats || []).forEach((beat) => {
    if (!beat || typeof beat !== "object") return;

    if (beat.type === "teacher_talk" || beat.type === "hero") {
      if (beat.text || beat.segment?.teacher_note) {
        actions.push(speechFromBeat(beat));
      }
      return;
    }

    if (beat.type === "reading_segment") {
      const teacherText = beat.segment?.teacher_note || beat.aside;
      if (teacherText) {
        actions.push(
          createAction({
            id: `${beat.id}-lead`,
            type: READING_ACTION_TYPES.SPEECH,
            role: beat.speaker || "teacher",
            title: beat.segment?.heading || beat.title || "",
            text: teacherText,
          }),
        );
      }
      actions.push(spotlightFromBeat(beat));
      return;
    }

    if (beat.type === "bullet_list" || beat.type === "keyword_grid" || beat.type === "explanation_grid") {
      actions.push(spotlightFromBeat(beat));
      return;
    }

    if (beat.type === "conversation") {
      // Each message becomes an individual speech action — dialogue plays out one line at a time
      (beat.messages || []).forEach((message, index) => {
        const text = String(message.text || message.content || "").trim();
        if (!text) return;
        actions.push(
          createAction({
            id: `${beat.id}-msg-${index + 1}`,
            type: READING_ACTION_TYPES.SPEECH,
            role: String(message.speaker || message.role || "teacher"),
            title: beat.title || "",
            text,
          }),
        );
      });
      // After the scripted dialogue, optionally open live discussion
      if (scene.liveHook?.enabled !== false) {
        actions.push(
          createAction({
            id: `${beat.id}-live`,
            type: READING_ACTION_TYPES.DISCUSSION,
            role: "teacher",
            title: beat.title || scene.title || "",
            prompt: scene.liveHook?.prompt || "",
            suggestedQuestions: scene.liveHook?.suggestedQuestions || [],
          }),
        );
      }
      return;
    }

    // Fallback: any beat with text becomes a speech action
    if (beat.text) {
      actions.push(speechFromBeat(beat));
    }
  });

  if (scene?.task && scene.type === "checkpoint") {
    actions.push(
      createAction({
        id: `${scene.id}-quiz`,
        type: READING_ACTION_TYPES.QUIZ,
        role: "teacher",
        task: scene.task,
      }),
    );
  }

  if (scene?.task && scene.type === "output") {
    actions.push(
      createAction({
        id: `${scene.id}-output`,
        type: READING_ACTION_TYPES.OUTPUT,
        role: "teacher",
        task: scene.task,
      }),
    );
  }

  return actions;
}
