import axios from "axios";

// In development, use proxy (empty string). In production, use full URL
const API_BASE_URL = import.meta.env.VITE_API_URL || "";

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true,
});

// ========================================
// API Keys Types
// ========================================

export type AiProvider = "OPENAI" | "ANTHROPIC_CLAUDE" | "BEDROCK_CLAUDE" | "OLLAMA";

export interface ApiKeysConfig {
  tavilyApiKey: string | null;
  openaiApiKey: string | null;
  claudeApiKey: string | null;
  awsAccessKeyId: string | null;
  awsSecretAccessKey: string | null;
  awsRegion: string | null;
  ollamaBaseUrl: string | null;
  ollamaModel: string | null;
  activeProvider: AiProvider;
}

export interface UpdateClaudeApiKeyInput {
  claudeApiKey?: string | null;
}

export interface UpdateApiKeysInput {
  tavilyApiKey?: string | null;
  openaiApiKey?: string | null;
}

export interface UpdateAwsCredentialsInput {
  awsAccessKeyId?: string | null;
  awsSecretAccessKey?: string | null;
  awsRegion?: string | null;
}

export interface UpdateOllamaConfigInput {
  ollamaBaseUrl?: string | null;
  ollamaModel?: string | null;
}

export interface ProviderInfo {
  id: AiProvider;
  name: string;
  configured: boolean;
  active: boolean;
}

export interface ProvidersResponse {
  providers: ProviderInfo[];
  activeProvider: AiProvider;
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

  getProviders: async (): Promise<ProvidersResponse> => {
    const response = await api.get<ProvidersResponse>("/api-keys/providers");
    return response.data;
  },

  setActiveProvider: async (
    provider: AiProvider
  ): Promise<{ success: boolean; activeProvider: AiProvider }> => {
    const response = await api.put<{
      success: boolean;
      activeProvider: AiProvider;
    }>("/api-keys/provider", { provider });
    return response.data;
  },

  updateAwsCredentials: async (
    data: UpdateAwsCredentialsInput
  ): Promise<{ success: boolean; awsAccessKeyId: string | null; awsRegion: string | null }> => {
    const response = await api.put<{
      success: boolean;
      awsAccessKeyId: string | null;
      awsRegion: string | null;
    }>("/api-keys/aws", data);
    return response.data;
  },

  updateClaudeApiKey: async (
    data: UpdateClaudeApiKeyInput
  ): Promise<{ success: boolean; claudeApiKey: string | null }> => {
    const response = await api.put<{
      success: boolean;
      claudeApiKey: string | null;
    }>("/api-keys/claude", data);
    return response.data;
  },

  updateOllamaConfig: async (
    data: UpdateOllamaConfigInput
  ): Promise<{ success: boolean; ollamaBaseUrl: string; ollamaModel: string }> => {
    const response = await api.put<{
      success: boolean;
      ollamaBaseUrl: string;
      ollamaModel: string;
    }>("/api-keys/ollama", data);
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
  activeProvider: AiProvider;
  ollamaAvailable: boolean;
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

export interface CleanupResponse {
  success: boolean;
  message: string;
  details: {
    failedJobsRemoved: number;
    cacheEntriesCleared: number;
    complianceDecisionEntriesCleared: number;
    parameterMatchEntriesCleared: number;
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

  cleanup: async (): Promise<CleanupResponse> => {
    const response = await api.post<CleanupResponse>("/maintenance/cleanup");
    return response.data;
  },
};

