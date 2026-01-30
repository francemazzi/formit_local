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

// ========================================
// Env Setup Types
// ========================================

export interface EnvStatus {
  exists: boolean;
  hasOpenaiKey: boolean;
  hasTavilyKey: boolean;
  hasDatabaseUrl: boolean;
  isConfigured: boolean;
}

export interface EnvSetupInput {
  openaiApiKey: string;
  tavilyApiKey: string;
}

export interface EnvSetupResponse {
  success: boolean;
  message: string;
}

// ========================================
// Env Setup API
// ========================================

export const envSetupApi = {
  getStatus: async (): Promise<EnvStatus> => {
    const response = await api.get<EnvStatus>("/env-status");
    return response.data;
  },

  setup: async (data: EnvSetupInput): Promise<EnvSetupResponse> => {
    const response = await api.post<EnvSetupResponse>("/env-setup", data);
    return response.data;
  },
};

// ========================================
// Update Types
// ========================================

export interface UpdateCheckResponse {
  hasUpdates: boolean;
  currentCommit: string;
  remoteCommit: string;
  behindBy: number;
}

export interface UpdateResponse {
  success: boolean;
  message: string;
  details?: {
    gitOutput?: string;
    hasChanges: boolean;
    restartScheduled: boolean;
  };
}

// ========================================
// Update API
// ========================================

export const updateApi = {
  check: async (): Promise<UpdateCheckResponse> => {
    const response = await api.get<UpdateCheckResponse>("/update/check");
    return response.data;
  },

  update: async (): Promise<UpdateResponse> => {
    const response = await api.post<UpdateResponse>("/update");
    return response.data;
  },
};

