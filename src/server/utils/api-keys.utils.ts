import { getDatabaseClient } from "../prisma.client";

export type AiProviderType = "OPENAI" | "ANTHROPIC_CLAUDE" | "BEDROCK_CLAUDE";

export interface ApiKeyConfig {
  tavilyApiKey: string | null;
  openaiApiKey: string | null;
  claudeApiKey: string | null;
  awsAccessKeyId: string | null;
  awsSecretAccessKey: string | null;
  awsRegion: string | null;
  activeProvider: AiProviderType;
}

const DEFAULT_AWS_REGION = "us-east-1";

/**
 * Retrieves API keys and provider configuration from the database.
 * Falls back to environment variables if not found in database (for backward compatibility).
 */
export async function getApiKeys(): Promise<ApiKeyConfig> {
  const prisma = getDatabaseClient();

  try {
    // Try to get API keys from database
    const apiKeys = await prisma.apiKey.findUnique({
      where: { id: "singleton" },
    });

    // If found in database, use them
    if (apiKeys) {
      return {
        tavilyApiKey: apiKeys.tavilyApiKey,
        openaiApiKey: apiKeys.openaiApiKey,
        claudeApiKey: apiKeys.claudeApiKey,
        awsAccessKeyId: apiKeys.awsAccessKeyId,
        awsSecretAccessKey: apiKeys.awsSecretAccessKey,
        awsRegion: apiKeys.awsRegion ?? DEFAULT_AWS_REGION,
        activeProvider: apiKeys.activeProvider,
      };
    }

    // Fallback to environment variables for backward compatibility
    // This allows the system to work even if database is not initialized
    return {
      tavilyApiKey: process.env.TAVILY_API_KEY || null,
      openaiApiKey: process.env.OPENAI_API_KEY || null,
      claudeApiKey: process.env.CLAUDE_API_KEY || null,
      awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID || null,
      awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || null,
      awsRegion: process.env.AWS_REGION || DEFAULT_AWS_REGION,
      activeProvider: "OPENAI",
    };
  } catch (error) {
    // If database query fails, fallback to environment variables
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
      activeProvider: "OPENAI",
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
 * Checks if a provider is properly configured
 */
export async function isProviderConfigured(
  provider: "openai" | "anthropic" | "bedrock"
): Promise<boolean> {
  const keys = await getApiKeys();

  if (provider === "openai") {
    return !!keys.openaiApiKey;
  }

  if (provider === "anthropic") {
    return !!keys.claudeApiKey;
  }

  return !!(keys.awsAccessKeyId && keys.awsSecretAccessKey);
}
