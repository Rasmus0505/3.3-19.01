import { createApiClient } from "./client";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").trim();

export const adminApi = createApiClient({ baseUrl: API_BASE_URL });
