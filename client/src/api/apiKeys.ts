import axios from "axios";

// In development, use proxy (empty string). In production, use full URL
const API_BASE_URL = import.meta.env.VITE_API_URL || "";

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// ========================================
// API Keys Types
// ========================================

export interface ApiKeysConfig {
  tavilyApiKey: string | null;
  openaiApiKey: string | null;
}

export interface UpdateApiKeysInput {
  tavilyApiKey?: string | null;
  openaiApiKey?: string | null;
}

// ========================================
// API Keys API
// ========================================

export const apiKeysApi = {
  get: async (): Promise<ApiKeysConfig> => {
    const response = await api.get<ApiKeysConfig>("/api-keys");
    return response.data;
  },

  update: async (data: UpdateApiKeysInput): Promise<ApiKeysConfig> => {
    const response = await api.put<ApiKeysConfig>("/api-keys", data);
    return response.data;
  },
};

