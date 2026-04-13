import { parseJsonSafely } from "./errorFormatter";

const TONE_BY_STATE = {
  healthy: "success",
  warning: "warning",
  critical: "danger",
};

const BADGE_VARIANT_BY_STATE = {
  healthy: "default",
  warning: "secondary",
  critical: "destructive",
};

const LABEL_BY_STATE = {
  healthy: "健康",
  warning: "需处理",
  critical: "高风险",
};

export async function fetchAdminSecurityStatus(apiCall) {
  const response = await apiCall("/api/admin/security/status");
  const data = await parseJsonSafely(response);
  return { response, data };
}

export function getSecurityStateTone(state) {
  return TONE_BY_STATE[String(state || "").trim().toLowerCase()] || "default";
}

export function getSecurityStateBadgeVariant(state) {
  return BADGE_VARIANT_BY_STATE[String(state || "").trim().toLowerCase()] || "outline";
}

export function getSecurityStateLabel(state) {
  return LABEL_BY_STATE[String(state || "").trim().toLowerCase()] || "待确认";
}

export function buildExportProtectionPrompt(exportProtection) {
  const configured = Boolean(exportProtection?.confirm_text_configured);
  const strong = Boolean(exportProtection?.confirm_text_strong);
  const detail = String(exportProtection?.detail || "").trim();

  if (!configured) {
    return {
      title: "当前环境尚未正确配置导出确认词",
      description: detail || "请先由后端或部署环境配置确认词，前端不会展示该确认词本身。",
      placeholder: "输入当前环境中的确认词",
    };
  }

  return {
    title: strong ? "请输入当前环境已配置的高强度确认词" : "请输入当前环境已配置的确认词",
    description: detail || "该确认词由服务端环境变量控制，前端只负责收集输入并提交校验。",
    placeholder: strong ? "输入当前环境中的高强度确认词" : "输入当前环境中的确认词",
  };
}
