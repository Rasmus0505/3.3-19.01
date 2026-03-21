export const TOKEN_KEY = "english_asr_access_token";
export const REFRESH_KEY = "english_asr_refresh_token";
export const USER_ID_KEY = "english_asr_user_id";
export const USER_EMAIL_KEY = "english_asr_user_email";
export const USER_IS_ADMIN_KEY = "english_asr_user_is_admin";

export function clearAuthStorage() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_ID_KEY);
  localStorage.removeItem(USER_EMAIL_KEY);
  localStorage.removeItem(USER_IS_ADMIN_KEY);
}
