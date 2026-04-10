/**
 * extractApi.js — Phase 39: 多模态内容提取 API 客户端
 * =====================================================
 * URL 提取 (服务端) 和图片 OCR (服务端) 的前端封装
 */
import { api } from "../../../shared/api/client.js";

/**
 * 提取网页文章文本
 * @param {string} url — 目标网页 URL
 * @param {string} accessToken — 用户 JWT token
 * @returns {Promise<{ text: string, title: string }>}
 */
export async function extractUrl(url, accessToken) {
  const resp = await api("/api/extract/url", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ url }),
  });

  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    const detail = data?.detail || data?.message;
    if (resp.status === 400) {
      throw new Error(detail || "该网页内容过少，无法生成阅读包");
    }
    if (resp.status === 502) {
      throw new Error(detail || "无法访问该网页，请检查链接是否正确");
    }
    throw new Error(detail || "无法提取该网页内容，请检查链接是否正确");
  }

  return resp.json();
}

/**
 * 图片 OCR 文本提取
 * @param {File} file — 图片文件
 * @param {string} accessToken — 用户 JWT token
 * @returns {Promise<{ text: string, confidence: number }>}
 */
export async function extractOcr(file, accessToken) {
  // 文件大小检查 (D-16: 5MB)
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("文件过大，请选择小于 5MB 的图片文件");
  }

  const formData = new FormData();
  formData.append("file", file);

  const resp = await api("/api/extract/ocr", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: formData,
  });

  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    const detail = data?.detail || data?.message;
    if (resp.status === 402) {
      throw new Error(detail || "积分不足，请充值后再使用图片识别功能");
    }
    if (resp.status === 503) {
      throw new Error(detail || "图片识别服务暂时不可用，请稍后重试");
    }
    throw new Error(detail || "图片识别失败，请确保图片清晰且包含英文文字");
  }

  return resp.json();
}
