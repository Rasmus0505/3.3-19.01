/**
 * pdfExtractor.js — 客户端 PDF 文本提取工具
 * ===========================================
 * Phase 39: Multi-Modal Input Pipeline (D-05, D-13, D-16)
 *
 * 使用 pdfjs-dist 在浏览器端提取 PDF 文本，无需上传到服务器
 */

/**
 * 提取 PDF 文件中的文本
 * @param {File} file — PDF 文件对象
 * @returns {Promise<{ text: string, pageCount: number, filename: string }>}
 */
export async function extractPdfText(file) {
  // 文件大小检查 (D-16: 10MB)
  if (file.size > 10 * 1024 * 1024) {
    throw new Error("文件过大，请选择小于 10MB 的 PDF 文件");
  }

  const pdfjsLib = await loadPdfJs();

  const arrayBuffer = await file.arrayBuffer();
  let pdf;
  try {
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    pdf = await loadingTask.promise;
  } catch {
    throw new Error("无法解析该 PDF 文件");
  }

  const pageCount = pdf.numPages;
  const textParts = [];

  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .filter((item) => item.str)
      .map((item) => item.str)
      .join(" ");
    if (pageText.trim()) {
      textParts.push(pageText.trim());
    }
  }

  const text = textParts.join("\n\n");

  if (text.trim().length < 50) {
    throw new Error("该 PDF 为扫描件，请使用图片 OCR 功能");
  }

  return { text: text.trim(), pageCount, filename: file.name };
}

/**
 * 懒加载 pdfjs-dist 并配置 worker
 * @returns {Promise<typeof import('pdfjs-dist')>}
 */
async function loadPdfJs() {
  const pdfjsLib = await import("pdfjs-dist");

  // 配置 worker，使用 CDN 避免打包体积过大
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    const version = pdfjsLib.version;
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${version}/pdf.worker.min.mjs`;
  }

  return pdfjsLib;
}


