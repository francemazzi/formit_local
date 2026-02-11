import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getDatabaseClient } from "../prisma.client";
import { isProviderConfigured } from "../utils/api-keys.utils";
import type { AiProvider } from "@prisma/client";

// ========================================
// Request Body Types
// ========================================

interface UpdateApiKeysBody {
  tavilyApiKey?: string;
  openaiApiKey?: string;
  claudeApiKey?: string;
}

interface UpdateAwsCredentialsBody {
  awsAccessKeyId?: string;
  awsSecretAccessKey?: string;
  awsRegion?: string;
}

interface UpdateClaudeApiKeyBody {
  claudeApiKey?: string;
}

interface SetActiveProviderBody {
  provider: AiProvider;
}

// ========================================
// Controller Implementation
// ========================================

export class ApiKeysController {
  async registerRoutes(fastify: FastifyInstance): Promise<void> {
    // Mask keys for security (show only last 4 characters)
    const maskKey = (key: string | null): string | null => {
      if (!key || key.length <= 4) return key;
      return `****${key.slice(-4)}`;
    };

    // GET /api/api-keys - Get current API keys (masked)
    fastify.get(
      "/api-keys",
      {
        schema: {
          description: "Retrieve current API keys configuration (keys are masked for security)",
          tags: ["Settings"],
          summary: "Get API keys",
          response: {
            200: {
              description: "API keys configuration",
              type: "object",
              properties: {
                tavilyApiKey: { type: "string", nullable: true },
                openaiApiKey: { type: "string", nullable: true },
                claudeApiKey: { type: "string", nullable: true },
                awsAccessKeyId: { type: "string", nullable: true },
                awsSecretAccessKey: { type: "string", nullable: true },
                awsRegion: { type: "string", nullable: true },
                activeProvider: { type: "string", enum: ["OPENAI", "ANTHROPIC_CLAUDE", "BEDROCK_CLAUDE"] },
              },
            },
          },
        },
      },
      async (request: FastifyRequest, reply: FastifyReply) => {
        const prisma = getDatabaseClient();

        try {
          // Retrieve API keys from database
          let apiKeys = await prisma.apiKey.findUnique({
            where: { id: "singleton" },
          });

          // If no record exists in database, create one
          if (!apiKeys) {
            apiKeys = await prisma.apiKey.create({
              data: {
                id: "singleton",
                tavilyApiKey: null,
                openaiApiKey: null,
              },
            });
          }

          return reply.send({
            tavilyApiKey: maskKey(apiKeys.tavilyApiKey),
            openaiApiKey: maskKey(apiKeys.openaiApiKey),
            claudeApiKey: maskKey(apiKeys.claudeApiKey),
            awsAccessKeyId: maskKey(apiKeys.awsAccessKeyId),
            awsSecretAccessKey: maskKey(apiKeys.awsSecretAccessKey),
            awsRegion: apiKeys.awsRegion ?? "us-east-1",
            activeProvider: apiKeys.activeProvider,
          });
        } catch (error) {
          request.log.error(error);
          return reply.status(500).send({ error: "Failed to retrieve API keys" });
        }
      }
    );

    // PUT /api/api-keys - Update API keys
    fastify.put<{ Body: UpdateApiKeysBody }>(
      "/api-keys",
      {
        schema: {
          description: "Update API keys configuration",
          tags: ["Settings"],
          summary: "Update API keys",
          body: {
            type: "object",
            properties: {
              tavilyApiKey: { type: "string", nullable: true },
              openaiApiKey: { type: "string", nullable: true },
            },
          },
          response: {
            200: {
              description: "API keys updated successfully",
              type: "object",
              properties: {
                tavilyApiKey: { type: "string", nullable: true },
                openaiApiKey: { type: "string", nullable: true },
              },
            },
          },
        },
      },
      async (request: FastifyRequest<{ Body: UpdateApiKeysBody }>, reply: FastifyReply) => {
        const prisma = getDatabaseClient();
        const { tavilyApiKey, openaiApiKey } = request.body;

        try {
          // Check if record exists in database
          let apiKeys = await prisma.apiKey.findUnique({
            where: { id: "singleton" },
          });

          const updateData: { tavilyApiKey?: string | null; openaiApiKey?: string | null } = {};

          // Only update fields that are provided
          if (tavilyApiKey !== undefined) {
            updateData.tavilyApiKey = tavilyApiKey || null;
          }
          if (openaiApiKey !== undefined) {
            updateData.openaiApiKey = openaiApiKey || null;
          }

          if (apiKeys) {
            // Update existing record in database
            apiKeys = await prisma.apiKey.update({
              where: { id: "singleton" },
              data: updateData,
            });
          } else {
            // Create new record in database
            apiKeys = await prisma.apiKey.create({
              data: {
                id: "singleton",
                tavilyApiKey: tavilyApiKey || null,
                openaiApiKey: openaiApiKey || null,
              },
            });
          }

          // Mask the keys in response
          const maskKey = (key: string | null): string | null => {
            if (!key || key.length <= 4) return key;
            return `****${key.slice(-4)}`;
          };

          return reply.send({
            tavilyApiKey: maskKey(apiKeys.tavilyApiKey),
            openaiApiKey: maskKey(apiKeys.openaiApiKey),
          });
        } catch (error) {
          request.log.error(error);
          return reply.status(500).send({ error: "Failed to update API keys" });
        }
      }
    );

    // GET /api-keys/providers - Get available providers and their configuration status
    fastify.get(
      "/api-keys/providers",
      {
        schema: {
          description: "Get list of available AI providers and their configuration status",
          tags: ["Settings"],
          summary: "Get AI providers",
          response: {
            200: {
              description: "AI providers list",
              type: "object",
              properties: {
                providers: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      name: { type: "string" },
                      configured: { type: "boolean" },
                      active: { type: "boolean" },
                    },
                  },
                },
                activeProvider: { type: "string" },
              },
            },
          },
        },
      },
      async (request: FastifyRequest, reply: FastifyReply) => {
        const prisma = getDatabaseClient();

        try {
          let apiKeys = await prisma.apiKey.findUnique({
            where: { id: "singleton" },
          });

          if (!apiKeys) {
            apiKeys = await prisma.apiKey.create({
              data: { id: "singleton" },
            });
          }

          const openaiConfigured = !!apiKeys.openaiApiKey;
          const anthropicConfigured = !!apiKeys.claudeApiKey;
          const bedrockConfigured = !!(apiKeys.awsAccessKeyId && apiKeys.awsSecretAccessKey);

          return reply.send({
            providers: [
              {
                id: "OPENAI",
                name: "OpenAI",
                configured: openaiConfigured,
                active: apiKeys.activeProvider === "OPENAI",
              },
              {
                id: "ANTHROPIC_CLAUDE",
                name: "Claude (Anthropic API)",
                configured: anthropicConfigured,
                active: apiKeys.activeProvider === "ANTHROPIC_CLAUDE",
              },
              {
                id: "BEDROCK_CLAUDE",
                name: "Claude (AWS Bedrock)",
                configured: bedrockConfigured,
                active: apiKeys.activeProvider === "BEDROCK_CLAUDE",
              },
            ],
            activeProvider: apiKeys.activeProvider,
          });
        } catch (error) {
          request.log.error(error);
          return reply.status(500).send({ error: "Failed to retrieve providers" });
        }
      }
    );

    // PUT /api-keys/provider - Set active AI provider
    fastify.put<{ Body: SetActiveProviderBody }>(
      "/api-keys/provider",
      {
        schema: {
          description: "Set the active AI provider",
          tags: ["Settings"],
          summary: "Set active provider",
          body: {
            type: "object",
            required: ["provider"],
            properties: {
              provider: { type: "string", enum: ["OPENAI", "ANTHROPIC_CLAUDE", "BEDROCK_CLAUDE"] },
            },
          },
          response: {
            200: {
              description: "Provider updated successfully",
              type: "object",
              properties: {
                success: { type: "boolean" },
                activeProvider: { type: "string" },
              },
            },
          },
        },
      },
      async (request: FastifyRequest<{ Body: SetActiveProviderBody }>, reply: FastifyReply) => {
        const prisma = getDatabaseClient();
        const { provider } = request.body;

        try {
          // Validate provider is configured before switching
          const providerTypeMap: Record<string, "openai" | "anthropic" | "bedrock"> = {
            OPENAI: "openai",
            ANTHROPIC_CLAUDE: "anthropic",
            BEDROCK_CLAUDE: "bedrock",
          };
          const providerType = providerTypeMap[provider];
          if (!providerType) {
            return reply.status(400).send({
              error: `Invalid provider: ${provider}`,
            });
          }
          const configured = await isProviderConfigured(providerType);

          if (!configured) {
            return reply.status(400).send({
              error: `Provider ${provider} is not configured. Please add credentials first.`,
            });
          }

          // Update the active provider
          await prisma.apiKey.upsert({
            where: { id: "singleton" },
            update: { activeProvider: provider },
            create: { id: "singleton", activeProvider: provider },
          });

          return reply.send({
            success: true,
            activeProvider: provider,
          });
        } catch (error) {
          request.log.error(error);
          return reply.status(500).send({ error: "Failed to update provider" });
        }
      }
    );

    // PUT /api-keys/aws - Update AWS Bedrock credentials
    fastify.put<{ Body: UpdateAwsCredentialsBody }>(
      "/api-keys/aws",
      {
        schema: {
          description: "Update AWS Bedrock credentials",
          tags: ["Settings"],
          summary: "Update AWS credentials",
          body: {
            type: "object",
            properties: {
              awsAccessKeyId: { type: "string", nullable: true },
              awsSecretAccessKey: { type: "string", nullable: true },
              awsRegion: { type: "string", nullable: true },
            },
          },
          response: {
            200: {
              description: "AWS credentials updated successfully",
              type: "object",
              properties: {
                success: { type: "boolean" },
                awsAccessKeyId: { type: "string", nullable: true },
                awsRegion: { type: "string", nullable: true },
              },
            },
          },
        },
      },
      async (request: FastifyRequest<{ Body: UpdateAwsCredentialsBody }>, reply: FastifyReply) => {
        const prisma = getDatabaseClient();
        const { awsAccessKeyId, awsSecretAccessKey, awsRegion } = request.body;

        try {
          const updateData: {
            awsAccessKeyId?: string | null;
            awsSecretAccessKey?: string | null;
            awsRegion?: string | null;
          } = {};

          if (awsAccessKeyId !== undefined) {
            updateData.awsAccessKeyId = awsAccessKeyId || null;
          }
          if (awsSecretAccessKey !== undefined) {
            updateData.awsSecretAccessKey = awsSecretAccessKey || null;
          }
          if (awsRegion !== undefined) {
            updateData.awsRegion = awsRegion || null;
          }

          const apiKeys = await prisma.apiKey.upsert({
            where: { id: "singleton" },
            update: updateData,
            create: {
              id: "singleton",
              awsAccessKeyId: awsAccessKeyId || null,
              awsSecretAccessKey: awsSecretAccessKey || null,
              awsRegion: awsRegion ?? "us-east-1",
            },
          });

          return reply.send({
            success: true,
            awsAccessKeyId: maskKey(apiKeys.awsAccessKeyId),
            awsRegion: apiKeys.awsRegion ?? "us-east-1",
          });
        } catch (error) {
          request.log.error(error);
          return reply.status(500).send({ error: "Failed to update AWS credentials" });
        }
      }
    );

    // PUT /api-keys/claude - Update Claude API key (Anthropic direct)
    fastify.put<{ Body: UpdateClaudeApiKeyBody }>(
      "/api-keys/claude",
      {
        schema: {
          description: "Update Claude API key (Anthropic direct)",
          tags: ["Settings"],
          summary: "Update Claude API key",
          body: {
            type: "object",
            properties: {
              claudeApiKey: { type: "string", nullable: true },
            },
          },
          response: {
            200: {
              description: "Claude API key updated successfully",
              type: "object",
              properties: {
                success: { type: "boolean" },
                claudeApiKey: { type: "string", nullable: true },
              },
            },
          },
        },
      },
      async (request: FastifyRequest<{ Body: UpdateClaudeApiKeyBody }>, reply: FastifyReply) => {
        const prisma = getDatabaseClient();
        const { claudeApiKey } = request.body;

        try {
          const apiKeys = await prisma.apiKey.upsert({
            where: { id: "singleton" },
            update: { claudeApiKey: claudeApiKey || null },
            create: {
              id: "singleton",
              claudeApiKey: claudeApiKey || null,
            },
          });

          return reply.send({
            success: true,
            claudeApiKey: maskKey(apiKeys.claudeApiKey),
          });
        } catch (error) {
          request.log.error(error);
          return reply.status(500).send({ error: "Failed to update Claude API key" });
        }
      }
    );
  }
}

export const apiKeysController = new ApiKeysController();

