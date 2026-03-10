import { getDatabaseClient } from "../prisma.client";
import { decryptOrNull } from "./crypto.utils";
import { getCurrentUserId } from "./processing-context";

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
 * Retrieves per-user API keys from the database.
 * Returns null if the user has no keys configured.
 */
async function getUserApiKeys(userId: string): Promise<ApiKeyConfig | null> {
  const prisma = getDatabaseClient();

  try {
    const userKeys = await prisma.userApiKey.findUnique({
      where: { userId },
    });

    if (!userKeys) return null;

    // Check if the user has any actual keys configured
    const hasAnyKey = !!(
      decryptOrNull(userKeys.openaiApiKey) ||
      decryptOrNull(userKeys.claudeApiKey) ||
      decryptOrNull(userKeys.awsAccessKeyId) ||
      decryptOrNull(userKeys.tavilyApiKey)
    );

    if (!hasAnyKey && !userKeys.activeProvider) return null;

    // If user has no explicit activeProvider, resolve from global settings
    let resolvedProvider: AiProviderType;
    if (userKeys.activeProvider) {
      resolvedProvider = userKeys.activeProvider as AiProviderType;
    } else {
      // Infer provider from user's configured keys, or fall back to global provider
      const userOpenAI = decryptOrNull(userKeys.openaiApiKey);
      const userClaude = decryptOrNull(userKeys.claudeApiKey);
      const userAws = decryptOrNull(userKeys.awsAccessKeyId);

      if (userOpenAI) {
        resolvedProvider = "OPENAI";
      } else if (userClaude) {
        resolvedProvider = "ANTHROPIC_CLAUDE";
      } else if (userAws) {
        resolvedProvider = "BEDROCK_CLAUDE";
      } else {
        // Fall back to global provider setting
        try {
          const globalKeys = await prisma.apiKey.findUnique({
            where: { id: "singleton" },
          });
          resolvedProvider = (globalKeys?.activeProvider as AiProviderType) ?? "OLLAMA";
        } catch {
          resolvedProvider = "OLLAMA";
        }
      }
    }

    return {
      tavilyApiKey: decryptOrNull(userKeys.tavilyApiKey),
      openaiApiKey: decryptOrNull(userKeys.openaiApiKey),
      claudeApiKey: decryptOrNull(userKeys.claudeApiKey),
      awsAccessKeyId: decryptOrNull(userKeys.awsAccessKeyId),
      awsSecretAccessKey: decryptOrNull(userKeys.awsSecretAccessKey),
      awsRegion: userKeys.awsRegion ?? DEFAULT_AWS_REGION,
      ollamaBaseUrl: null,
      ollamaModel: null,
      activeProvider: resolvedProvider,
    };
  } catch (error) {
    console.warn("[api-keys] Failed to retrieve user API keys:", error);
    return null;
  }
}

/**
 * Retrieves API keys and provider configuration.
 * Priority: per-user keys (from AsyncLocalStorage context) > global keys > env vars (dev only).
 */
export async function getApiKeys(): Promise<ApiKeyConfig> {
  const prisma = getDatabaseClient();

  // Check for per-user keys via processing context
  const userId = getCurrentUserId();
  if (userId) {
    const userKeys = await getUserApiKeys(userId);
    if (userKeys) {
      return userKeys;
    }
  }

  try {
    // Try to get global API keys from database
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
 * Retrieves per-user API keys for a specific user (used by endpoints).
 */
export { getUserApiKeys };

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
