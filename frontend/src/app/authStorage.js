export const TOKEN_KEY = "english_asr_access_token";
export const REFRESH_KEY = "english_asr_refresh_token";

export function clearAuthStorage() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
}
