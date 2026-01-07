import { getDatabaseClient } from "../prisma.client";

/**
 * Retrieves API keys from the database.
 * Falls back to environment variables if not found in database (for backward compatibility).
 *
 * @returns Object with tavilyApiKey and openaiApiKey
 */
export async function getApiKeys(): Promise<{
  tavilyApiKey: string | null;
  openaiApiKey: string | null;
}> {
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
      };
    }

    // Fallback to environment variables for backward compatibility
    // This allows the system to work even if database is not initialized
    return {
      tavilyApiKey: process.env.TAVILY_API_KEY || null,
      openaiApiKey: process.env.OPENAI_API_KEY || null,
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
