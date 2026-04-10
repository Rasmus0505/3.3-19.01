/**
 * subtitleParser.js — 客户端 SRT/VTT 字幕解析工具
 * =================================================
 * Phase 39: Multi-Modal Input Pipeline (D-06, D-08, D-09)
 *
 * 支持格式: SRT, VTT
 * 输出: 纯英文对白文本（去除时间戳、序号、标签、格式标记）
 */

/**
 * 判断字幕格式
 * @param {string} content
 * @returns {'srt'|'vtt'|null}
 */
function detectFormat(content) {
  const trimmed = content.trimStart();
  if (trimmed.startsWith("WEBVTT")) return "vtt";
  // SRT 以数字序号开头
  if (/^\d+\s*\r?\n/.test(trimmed)) return "srt";
  // 尝试检测时间戳格式
  if (/\d{2}:\d{2}:\d{2}[,\.]\d{3}\s*-->/.test(content)) return "srt";
  if (/\d{2}:\d{2}:\d{2}\.\d{3}\s*-->/.test(content)) return "vtt";
  return null;
}

/**
 * 从 SRT 内容提取对白文本
 * @param {string} content
 * @returns {string}
 */
function parseSrt(content) {
  const lines = content.split(/\r?\n/);
  const dialogueLines = [];
  let skipNext = false;

  for (const line of lines) {
    const trimmed = line.trim();
    // 跳过序号行（纯数字）
    if (/^\d+$/.test(trimmed)) {
      skipNext = true; // 下一行是时间戳
      continue;
    }
    // 跳过时间戳行
    if (/^\d{2}:\d{2}:\d{2},\d{3}\s*-->\s*\d{2}:\d{2}:\d{2},\d{3}/.test(trimmed)) {
      skipNext = false;
      continue;
    }
    if (skipNext) {
      skipNext = false;
      continue;
    }
    // 空行作为段落分隔符
    if (trimmed === "") {
      continue;
    }
    dialogueLines.push(trimmed);
  }

  return mergeDialogueLines(dialogueLines);
}

/**
 * 从 VTT 内容提取对白文本
 * @param {string} content
 * @returns {string}
 */
function parseVtt(content) {
  const lines = content.split(/\r?\n/);
  const dialogueLines = [];
  let inCue = false;

  for (const line of lines) {
    const trimmed = line.trim();
    // 跳过 WEBVTT 头和 NOTE/STYLE/REGION 块
    if (
      trimmed.startsWith("WEBVTT") ||
      trimmed.startsWith("NOTE") ||
      trimmed.startsWith("STYLE") ||
      trimmed.startsWith("REGION")
    ) {
      inCue = false;
      continue;
    }
    // 时间戳行
    if (/\d{2}:\d{2}:\d{2}\.\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}\.\d{3}/.test(trimmed) ||
        /\d{2}:\d{2}\.\d{3}\s*-->\s*\d{2}:\d{2}\.\d{3}/.test(trimmed)) {
      inCue = true;
      continue;
    }
    // 空行 = cue 结束
    if (trimmed === "") {
      inCue = false;
      continue;
    }
    // cue 文本或 cue 标识符（纯文字 ID 跳过）
    if (inCue) {
      dialogueLines.push(trimmed);
    }
  }

  return mergeDialogueLines(dialogueLines);
}

/**
 * 清理单行对白文本
 * 去除 HTML 标签、说话人标签
 * @param {string} line
 * @returns {string}
 */
function cleanLine(line) {
  return line
    // 去除 HTML 标签 <i>, <b>, <u>, <font>, <c.>, 等
    .replace(/<[^>]+>/g, "")
    // 去除 VTT 内联时间码 <00:00:01.000>
    .replace(/<\d{2}:\d{2}:\d{2}\.\d{3}>/g, "")
    // 去除说话人标签 [Speaker]: 或 (Speaker):
    .replace(/^[\[(][^\])\n]+[\])]:\s*/i, "")
    // 去除常见音效标注 [Music] [Applause]
    .replace(/^\[[^\]]+\]\s*/, "")
    .trim();
}

/**
 * 合并对白行，根据句子边界决定是否用空格连接或换行
 * D-09: 如果行尾没有句子结束符，与下一行用空格连接
 * @param {string[]} lines
 * @returns {string}
 */
function mergeDialogueLines(lines) {
  const cleaned = lines.map(cleanLine).filter((l) => l.length > 0);
  if (cleaned.length === 0) return "";

  const paragraphs = [];
  let current = cleaned[0];

  for (let i = 1; i < cleaned.length; i++) {
    const prev = current;
    const isSentenceEnd = /[.?!…]$/.test(prev);

    if (isSentenceEnd) {
      // 句子结束 → 当前段落完成，开始新段落
      paragraphs.push(current);
      current = cleaned[i];
    } else {
      // 句子未完 → 用空格连接
      current = current + " " + cleaned[i];
    }
  }
  paragraphs.push(current);

  return paragraphs.join("\n\n");
}

/**
 * 解析字幕文件内容为纯文本
 * @param {string} content — 字幕文件的文本内容
 * @returns {{ text: string, format: 'srt'|'vtt' }} 成功
 * @throws {Error} 无法识别格式
 */
export function parseSubtitle(content) {
  const format = detectFormat(content);
  if (!format) {
    throw new Error("无法解析字幕文件格式");
  }

  const text = format === "srt" ? parseSrt(content) : parseVtt(content);

  if (text.trim().length < 10) {
    throw new Error("字幕文件内容过少，无法生成阅读包");
  }

  return { text: text.trim(), format };
}

/**
 * 从 File 对象读取并解析字幕
 * @param {File} file
 * @returns {Promise<{ text: string, format: 'srt'|'vtt', filename: string }>}
 */
export function readSubtitleFile(file) {
  return new Promise((resolve, reject) => {
    // 文件大小检查 (D-16: 2MB)
    if (file.size > 2 * 1024 * 1024) {
      reject(new Error("文件过大，请选择小于 2MB 的字幕文件"));
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target.result;
        const result = parseSubtitle(content);
        resolve({ ...result, filename: file.name });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("无法读取字幕文件"));
    reader.readAsText(file, "utf-8");
  });
}
