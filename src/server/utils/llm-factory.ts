import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatBedrockConverse } from "@langchain/aws";
import { getApiKeys, type ApiKeyConfig } from "./api-keys.utils.js";

export type LLMCapability = "text" | "vision";

export interface LLMConfig {
  capability: LLMCapability;
  temperature?: number;
  maxTokens?: number;
}

export interface LLMFactoryResult {
  model: BaseChatModel;
  provider: "openai" | "anthropic" | "bedrock";
  modelName: string;
}

// Default model mappings
const MODEL_MAPPING = {
  openai: {
    text: "gpt-4o-mini",
    vision: "gpt-4o",
  },
  anthropic: {
    text: "claude-sonnet-4-20250514",
    vision: "claude-sonnet-4-20250514",
  },
  bedrock: {
    text: "anthropic.claude-sonnet-4-20250514-v1:0",
    vision: "anthropic.claude-sonnet-4-20250514-v1:0",
  },
} as const;

// Default AWS region
const DEFAULT_AWS_REGION = "us-east-1";

/**
 * Creates an LLM instance based on the configured provider.
 * Reads configuration from database and creates the appropriate model.
 */
export async function createLLM(config: LLMConfig): Promise<LLMFactoryResult> {
  const apiKeys = await getApiKeys();
  const provider = apiKeys.activeProvider;

  if (provider === "ANTHROPIC_CLAUDE") {
    return createAnthropicLLM(config, apiKeys);
  }

  if (provider === "BEDROCK_CLAUDE") {
    return createBedrockLLM(config, apiKeys);
  }

  return createOpenAILLM(config, apiKeys);
}

/**
 * Creates an OpenAI LLM instance
 */
async function createOpenAILLM(
  config: LLMConfig,
  apiKeys: ApiKeyConfig
): Promise<LLMFactoryResult> {
  const modelName = MODEL_MAPPING.openai[config.capability];

  if (!apiKeys.openaiApiKey) {
    throw new Error(
      "OpenAI API key is required. Please configure it in Settings."
    );
  }

  const model = new ChatOpenAI({
    openAIApiKey: apiKeys.openaiApiKey,
    modelName,
    temperature: config.temperature ?? 0,
    ...(config.maxTokens !== undefined && { maxTokens: config.maxTokens }),
  });

  return { model, provider: "openai", modelName };
}

/**
 * Creates an Anthropic Claude LLM instance (direct API)
 */
async function createAnthropicLLM(
  config: LLMConfig,
  apiKeys: ApiKeyConfig
): Promise<LLMFactoryResult> {
  const modelName = MODEL_MAPPING.anthropic[config.capability];

  if (!apiKeys.claudeApiKey) {
    throw new Error(
      "Claude API key is required. Please configure it in Settings."
    );
  }

  const model = new ChatAnthropic({
    anthropicApiKey: apiKeys.claudeApiKey,
    modelName,
    temperature: config.temperature ?? 0,
    ...(config.maxTokens !== undefined && { maxTokens: config.maxTokens }),
  });

  return { model, provider: "anthropic", modelName };
}

/**
 * Creates a Bedrock Claude LLM instance
 */
async function createBedrockLLM(
  config: LLMConfig,
  apiKeys: ApiKeyConfig
): Promise<LLMFactoryResult> {
  if (!apiKeys.awsAccessKeyId || !apiKeys.awsSecretAccessKey) {
    throw new Error(
      "AWS credentials are required for Bedrock. Please configure them in Settings."
    );
  }

  const modelName = MODEL_MAPPING.bedrock[config.capability];

  const model = new ChatBedrockConverse({
    model: modelName,
    region: apiKeys.awsRegion ?? DEFAULT_AWS_REGION,
    credentials: {
      accessKeyId: apiKeys.awsAccessKeyId,
      secretAccessKey: apiKeys.awsSecretAccessKey,
    },
    temperature: config.temperature ?? 0,
    ...(config.maxTokens !== undefined && { maxTokens: config.maxTokens }),
  });

  return { model, provider: "bedrock", modelName };
}

/**
 * Gets the vision provider configuration.
 * Used for direct SDK access (e.g., OpenAI file API, Anthropic images, or Bedrock images)
 */
export async function getVisionProvider(): Promise<{
  provider: "openai" | "anthropic" | "bedrock";
  config: OpenAIVisionConfig | AnthropicVisionConfig | BedrockVisionConfig;
}> {
  const apiKeys = await getApiKeys();

  if (apiKeys.activeProvider === "ANTHROPIC_CLAUDE") {
    if (!apiKeys.claudeApiKey) {
      throw new Error(
        "Claude API key is required for vision. Please configure it in Settings."
      );
    }

    return {
      provider: "anthropic",
      config: {
        apiKey: apiKeys.claudeApiKey,
        model: MODEL_MAPPING.anthropic.vision,
      },
    };
  }

  if (apiKeys.activeProvider === "BEDROCK_CLAUDE") {
    if (!apiKeys.awsAccessKeyId || !apiKeys.awsSecretAccessKey) {
      throw new Error(
        "AWS credentials are required for Bedrock vision. Please configure them in Settings."
      );
    }

    return {
      provider: "bedrock",
      config: {
        modelId: MODEL_MAPPING.bedrock.vision,
        region: apiKeys.awsRegion ?? DEFAULT_AWS_REGION,
        credentials: {
          accessKeyId: apiKeys.awsAccessKeyId,
          secretAccessKey: apiKeys.awsSecretAccessKey,
        },
      },
    };
  }

  if (!apiKeys.openaiApiKey) {
    throw new Error(
      "OpenAI API key is required for vision. Please configure it in Settings."
    );
  }

  return {
    provider: "openai",
    config: {
      apiKey: apiKeys.openaiApiKey,
      model: MODEL_MAPPING.openai.vision,
    },
  };
}

export interface OpenAIVisionConfig {
  apiKey: string;
  model: string;
}

export interface AnthropicVisionConfig {
  apiKey: string;
  model: string;
}

export interface BedrockVisionConfig {
  modelId: string;
  region: string;
  credentials: {
    accessKeyId: string;
    secretAccessKey: string;
  };
}

/**
 * Checks if a specific provider is properly configured
 */
export async function isProviderConfigured(
  provider: "openai" | "anthropic" | "bedrock"
): Promise<boolean> {
  const apiKeys = await getApiKeys();

  if (provider === "openai") {
    return !!apiKeys.openaiApiKey;
  }

  if (provider === "anthropic") {
    return !!apiKeys.claudeApiKey;
  }

  return !!(apiKeys.awsAccessKeyId && apiKeys.awsSecretAccessKey);
}

/**
 * Gets the current active provider
 */
export async function getActiveProvider(): Promise<
  "OPENAI" | "ANTHROPIC_CLAUDE" | "BEDROCK_CLAUDE"
> {
  const apiKeys = await getApiKeys();
  return apiKeys.activeProvider;
}
