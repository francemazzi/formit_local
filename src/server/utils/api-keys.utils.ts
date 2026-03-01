import { getDatabaseClient } from "../prisma.client";
import { decryptOrNull } from "./crypto.utils";

export type AiProviderType = "OPENAI" | "ANTHROPIC_CLAUDE" | "BEDROCK_CLAUDE" | "OLLAMA";

export interface ApiKeyConfig {
  tavilyApiKey: string | null;
  openaiApiKey: string | null;
  claudeApiKey: string | null;
  awsAccessKeyId: string | null;
  awsSecretAccessKey: string | null;
  awsRegion: string | null;
  ollamaBaseUrl: string | null;
  ollamaModel: string | null;
  activeProvider: AiProviderType;
}

const DEFAULT_AWS_REGION = "us-east-1";

const isProduction = () => process.env.NODE_ENV === "production";

/**
 * Retrieves API keys and provider configuration from the database.
 * In development, falls back to environment variables if not found in database.
 * In production, requires database to be available (no env fallback).
 */
export async function getApiKeys(): Promise<ApiKeyConfig> {
  const prisma = getDatabaseClient();

  try {
    // Try to get API keys from database
    const apiKeys = await prisma.apiKey.findUnique({
      where: { id: "singleton" },
    });

    // If found in database, decrypt and return
    if (apiKeys) {
      return {
        tavilyApiKey: decryptOrNull(apiKeys.tavilyApiKey),
        openaiApiKey: decryptOrNull(apiKeys.openaiApiKey),
        claudeApiKey: decryptOrNull(apiKeys.claudeApiKey),
        awsAccessKeyId: decryptOrNull(apiKeys.awsAccessKeyId),
        awsSecretAccessKey: decryptOrNull(apiKeys.awsSecretAccessKey),
        awsRegion: apiKeys.awsRegion ?? DEFAULT_AWS_REGION,
        ollamaBaseUrl: apiKeys.ollamaBaseUrl ?? null,
        ollamaModel: apiKeys.ollamaModel ?? null,
        activeProvider: apiKeys.activeProvider,
      };
    }

    // In production, do not fall back to environment variables
    if (isProduction()) {
      console.warn("[api-keys] No API keys found in database and env fallback is disabled in production");
      return {
        tavilyApiKey: null,
        openaiApiKey: null,
        claudeApiKey: null,
        awsAccessKeyId: null,
        awsSecretAccessKey: null,
        awsRegion: DEFAULT_AWS_REGION,
        ollamaBaseUrl: null,
        ollamaModel: null,
        activeProvider: "OLLAMA",
      };
    }

    // Dev-only fallback to environment variables
    return {
      tavilyApiKey: process.env.TAVILY_API_KEY || null,
      openaiApiKey: process.env.OPENAI_API_KEY || null,
      claudeApiKey: process.env.CLAUDE_API_KEY || null,
      awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID || null,
      awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || null,
      awsRegion: process.env.AWS_REGION || DEFAULT_AWS_REGION,
      ollamaBaseUrl: process.env.OLLAMA_BASE_URL || null,
      ollamaModel: process.env.OLLAMA_MODEL || null,
      activeProvider: "OLLAMA",
    };
  } catch (error) {
    if (isProduction()) {
      console.error("[api-keys] Failed to retrieve API keys from database:", error);
      throw new Error("Database unavailable - cannot retrieve API keys");
    }
    // Dev-only fallback to environment variables
    console.warn(
      "[api-keys] Failed to retrieve API keys from database, falling back to environment variables:",
      error
    );
    return {
      tavilyApiKey: process.env.TAVILY_API_KEY || null,
      openaiApiKey: process.env.OPENAI_API_KEY || null,
      claudeApiKey: process.env.CLAUDE_API_KEY || null,
      awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID || null,
      awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || null,
      awsRegion: process.env.AWS_REGION || DEFAULT_AWS_REGION,
      ollamaBaseUrl: process.env.OLLAMA_BASE_URL || null,
      ollamaModel: process.env.OLLAMA_MODEL || null,
      activeProvider: "OLLAMA",
    };
  }
}

/**
 * Gets Tavily API key from database (or environment variable as fallback)
 */
export async function getTavilyApiKey(): Promise<string | null> {
  const keys = await getApiKeys();
  return keys.tavilyApiKey;
}

/**
 * Gets OpenAI API key from database (or environment variable as fallback)
 */
export async function getOpenAIApiKey(): Promise<string | null> {
  const keys = await getApiKeys();
  return keys.openaiApiKey;
}

/**
 * Gets AWS credentials from database (or environment variable as fallback)
 */
export async function getAwsCredentials(): Promise<{
  accessKeyId: string | null;
  secretAccessKey: string | null;
  region: string;
}> {
  const keys = await getApiKeys();
  return {
    accessKeyId: keys.awsAccessKeyId,
    secretAccessKey: keys.awsSecretAccessKey,
    region: keys.awsRegion ?? DEFAULT_AWS_REGION,
  };
}

/**
 * Gets the active AI provider
 */
export async function getActiveProvider(): Promise<AiProviderType> {
  const keys = await getApiKeys();
  return keys.activeProvider;
}

/**
 * Gets Claude API key (Anthropic direct)
 */
export async function getClaudeApiKey(): Promise<string | null> {
  const keys = await getApiKeys();
  return keys.claudeApiKey;
}

/**
 * Checks if the Ollama server is reachable
 */
export async function isOllamaReachable(): Promise<boolean> {
  try {
    const keys = await getApiKeys();
    const baseUrl = keys.ollamaBaseUrl || process.env.OLLAMA_BASE_URL || "http://host.docker.internal:11434";

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(`${baseUrl}/api/tags`, {
      signal: controller.signal,
    });

    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Checks if a provider is properly configured
 */
export async function isProviderConfigured(
  provider: "openai" | "anthropic" | "bedrock" | "ollama"
): Promise<boolean> {
  if (provider === "ollama") {
    return isOllamaReachable();
  }

  const keys = await getApiKeys();

  if (provider === "openai") {
    return !!keys.openaiApiKey;
  }

  if (provider === "anthropic") {
    return !!keys.claudeApiKey;
  }

  return !!(keys.awsAccessKeyId && keys.awsSecretAccessKey);
}
