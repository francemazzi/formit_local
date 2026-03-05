import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getDatabaseClient } from "../prisma.client";
import { isProviderConfigured, getUserApiKeys } from "../utils/api-keys.utils";
import type { AiProvider } from "@prisma/client";
import { requireAuth, requireAdmin } from "../auth/auth.middleware";
import { encryptOrNull, decryptOrNull } from "../utils/crypto.utils";

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
// API Key Format Validation
// ========================================

function validateApiKeyFormat(key: string | undefined, type: "openai" | "claude" | "tavily" | "aws-key" | "aws-secret"): string | null {
  if (!key) return null;
  const trimmed = key.trim();
  if (!trimmed) return null;

  switch (type) {
    case "openai":
      if (!trimmed.startsWith("sk-")) return "OpenAI API key must start with 'sk-'";
      if (trimmed.length < 20) return "OpenAI API key is too short";
      break;
    case "claude":
      if (!trimmed.startsWith("sk-ant-")) return "Claude API key must start with 'sk-ant-'";
      if (trimmed.length < 20) return "Claude API key is too short";
      break;
    case "tavily":
      if (!trimmed.startsWith("tvly-")) return "Tavily API key must start with 'tvly-'";
      break;
    case "aws-key":
      if (!/^[A-Z0-9]{16,128}$/.test(trimmed)) return "AWS Access Key ID format is invalid";
      break;
    case "aws-secret":
      if (trimmed.length < 16) return "AWS Secret Access Key is too short";
      break;
  }
  return null;
}

// ========================================
// Controller Implementation
// ========================================

export class ApiKeysController {
  async registerRoutes(fastify: FastifyInstance): Promise<void> {
    // All API key routes require authentication
    fastify.addHook("preHandler", requireAuth);

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
                ollamaBaseUrl: { type: "string", nullable: true },
                ollamaModel: { type: "string", nullable: true },
                activeProvider: { type: "string", enum: ["OPENAI", "ANTHROPIC_CLAUDE", "BEDROCK_CLAUDE", "OLLAMA"] },
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
            tavilyApiKey: maskKey(decryptOrNull(apiKeys.tavilyApiKey)),
            openaiApiKey: maskKey(decryptOrNull(apiKeys.openaiApiKey)),
            claudeApiKey: maskKey(decryptOrNull(apiKeys.claudeApiKey)),
            awsAccessKeyId: maskKey(decryptOrNull(apiKeys.awsAccessKeyId)),
            awsSecretAccessKey: maskKey(decryptOrNull(apiKeys.awsSecretAccessKey)),
            awsRegion: apiKeys.awsRegion ?? "us-east-1",
            ollamaBaseUrl: apiKeys.ollamaBaseUrl ?? "http://host.docker.internal:11434",
            ollamaModel: apiKeys.ollamaModel ?? "qwen2.5:3b",
            activeProvider: apiKeys.activeProvider,
          });
        } catch (error) {
          request.log.error(error);
          return reply.status(500).send({ error: "Failed to retrieve API keys" });
        }
      }
    );

    // PUT /api/api-keys - Update API keys (admin only)
    fastify.put<{ Body: UpdateApiKeysBody }>(
      "/api-keys",
      {
        preHandler: [requireAdmin],
        schema: {
          description: "Update API keys configuration (admin only)",
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

        // Validate API key formats
        if (tavilyApiKey) {
          const err = validateApiKeyFormat(tavilyApiKey, "tavily");
          if (err) return reply.status(400).send({ error: err });
        }
        if (openaiApiKey) {
          const err = validateApiKeyFormat(openaiApiKey, "openai");
          if (err) return reply.status(400).send({ error: err });
        }

        try {
          // Check if record exists in database
          let apiKeys = await prisma.apiKey.findUnique({
            where: { id: "singleton" },
          });

          const updateData: { tavilyApiKey?: string | null; openaiApiKey?: string | null } = {};

          // Only update fields that are provided - encrypt before storing
          if (tavilyApiKey !== undefined) {
            updateData.tavilyApiKey = encryptOrNull(tavilyApiKey || null);
          }
          if (openaiApiKey !== undefined) {
            updateData.openaiApiKey = encryptOrNull(openaiApiKey || null);
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
                tavilyApiKey: encryptOrNull(tavilyApiKey || null),
                openaiApiKey: encryptOrNull(openaiApiKey || null),
              },
            });
          }

          const updatedFields = [tavilyApiKey !== undefined && "tavilyApiKey", openaiApiKey !== undefined && "openaiApiKey"].filter(Boolean);
          request.log.info({ userId: request.user?.userId, action: "update_api_keys", fields: updatedFields }, "API keys updated");

          return reply.send({
            tavilyApiKey: maskKey(decryptOrNull(apiKeys.tavilyApiKey)),
            openaiApiKey: maskKey(decryptOrNull(apiKeys.openaiApiKey)),
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

          const openaiConfigured = !!decryptOrNull(apiKeys.openaiApiKey);
          const anthropicConfigured = !!decryptOrNull(apiKeys.claudeApiKey);
          const bedrockConfigured = !!(decryptOrNull(apiKeys.awsAccessKeyId) && decryptOrNull(apiKeys.awsSecretAccessKey));

          return reply.send({
            providers: [
              {
                id: "OLLAMA",
                name: `Ollama (Locale - ${apiKeys.ollamaModel ?? "qwen2.5:3b"})`,
                configured: true, // Ollama doesn't need API keys
                active: apiKeys.activeProvider === "OLLAMA",
              },
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

    // PUT /api-keys/provider - Set active AI provider (admin only)
    fastify.put<{ Body: SetActiveProviderBody }>(
      "/api-keys/provider",
      {
        preHandler: [requireAdmin],
        schema: {
          description: "Set the active AI provider (admin only)",
          tags: ["Settings"],
          summary: "Set active provider",
          body: {
            type: "object",
            required: ["provider"],
            properties: {
              provider: { type: "string", enum: ["OPENAI", "ANTHROPIC_CLAUDE", "BEDROCK_CLAUDE", "OLLAMA"] },
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
          const providerTypeMap: Record<string, "openai" | "anthropic" | "bedrock" | "ollama"> = {
            OPENAI: "openai",
            ANTHROPIC_CLAUDE: "anthropic",
            BEDROCK_CLAUDE: "bedrock",
            OLLAMA: "ollama",
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

          request.log.info({ userId: request.user?.userId, action: "set_active_provider", provider }, "Active provider changed");

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

    // PUT /api-keys/aws - Update AWS Bedrock credentials (admin only)
    fastify.put<{ Body: UpdateAwsCredentialsBody }>(
      "/api-keys/aws",
      {
        preHandler: [requireAdmin],
        schema: {
          description: "Update AWS Bedrock credentials (admin only)",
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

        // Validate AWS credential formats
        if (awsAccessKeyId) {
          const err = validateApiKeyFormat(awsAccessKeyId, "aws-key");
          if (err) return reply.status(400).send({ error: err });
        }
        if (awsSecretAccessKey) {
          const err = validateApiKeyFormat(awsSecretAccessKey, "aws-secret");
          if (err) return reply.status(400).send({ error: err });
        }

        try {
          const updateData: {
            awsAccessKeyId?: string | null;
            awsSecretAccessKey?: string | null;
            awsRegion?: string | null;
          } = {};

          if (awsAccessKeyId !== undefined) {
            updateData.awsAccessKeyId = encryptOrNull(awsAccessKeyId || null);
          }
          if (awsSecretAccessKey !== undefined) {
            updateData.awsSecretAccessKey = encryptOrNull(awsSecretAccessKey || null);
          }
          if (awsRegion !== undefined) {
            updateData.awsRegion = awsRegion || null;
          }

          const apiKeys = await prisma.apiKey.upsert({
            where: { id: "singleton" },
            update: updateData,
            create: {
              id: "singleton",
              awsAccessKeyId: encryptOrNull(awsAccessKeyId || null),
              awsSecretAccessKey: encryptOrNull(awsSecretAccessKey || null),
              awsRegion: awsRegion ?? "us-east-1",
            },
          });

          request.log.info({ userId: request.user?.userId, action: "update_aws_credentials" }, "AWS credentials updated");

          return reply.send({
            success: true,
            awsAccessKeyId: maskKey(decryptOrNull(apiKeys.awsAccessKeyId)),
            awsRegion: apiKeys.awsRegion ?? "us-east-1",
          });
        } catch (error) {
          request.log.error(error);
          return reply.status(500).send({ error: "Failed to update AWS credentials" });
        }
      }
    );

    // PUT /api-keys/claude - Update Claude API key (admin only)
    fastify.put<{ Body: UpdateClaudeApiKeyBody }>(
      "/api-keys/claude",
      {
        preHandler: [requireAdmin],
        schema: {
          description: "Update Claude API key (admin only)",
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

        // Validate API key format
        if (claudeApiKey) {
          const err = validateApiKeyFormat(claudeApiKey, "claude");
          if (err) return reply.status(400).send({ error: err });
        }

        try {
          const apiKeys = await prisma.apiKey.upsert({
            where: { id: "singleton" },
            update: { claudeApiKey: encryptOrNull(claudeApiKey || null) },
            create: {
              id: "singleton",
              claudeApiKey: encryptOrNull(claudeApiKey || null),
            },
          });

          request.log.info({ userId: request.user?.userId, action: "update_claude_api_key" }, "Claude API key updated");

          return reply.send({
            success: true,
            claudeApiKey: maskKey(decryptOrNull(apiKeys.claudeApiKey)),
          });
        } catch (error) {
          request.log.error(error);
          return reply.status(500).send({ error: "Failed to update Claude API key" });
        }
      }
    );

    // PUT /api-keys/ollama - Update Ollama configuration (admin only)
    fastify.put<{ Body: { ollamaBaseUrl?: string; ollamaModel?: string } }>(
      "/api-keys/ollama",
      {
        preHandler: [requireAdmin],
        schema: {
          description: "Update Ollama local LLM configuration (admin only)",
          tags: ["Settings"],
          summary: "Update Ollama config",
          body: {
            type: "object",
            properties: {
              ollamaBaseUrl: { type: "string", nullable: true },
              ollamaModel: { type: "string", nullable: true },
            },
          },
          response: {
            200: {
              description: "Ollama configuration updated successfully",
              type: "object",
              properties: {
                success: { type: "boolean" },
                ollamaBaseUrl: { type: "string" },
                ollamaModel: { type: "string" },
              },
            },
          },
        },
      },
      async (request: FastifyRequest<{ Body: { ollamaBaseUrl?: string; ollamaModel?: string } }>, reply: FastifyReply) => {
        const prisma = getDatabaseClient();
        const { ollamaBaseUrl, ollamaModel } = request.body;

        try {
          const updateData: { ollamaBaseUrl?: string | null; ollamaModel?: string | null } = {};
          if (ollamaBaseUrl !== undefined) {
            updateData.ollamaBaseUrl = ollamaBaseUrl?.trim() || null;
          }
          if (ollamaModel !== undefined) {
            updateData.ollamaModel = ollamaModel?.trim() || null;
          }

          const apiKeys = await prisma.apiKey.upsert({
            where: { id: "singleton" },
            update: updateData,
            create: {
              id: "singleton",
              ollamaBaseUrl: ollamaBaseUrl?.trim() || null,
              ollamaModel: ollamaModel?.trim() || null,
            },
          });

          request.log.info({ userId: request.user?.userId, action: "update_ollama_config" }, "Ollama configuration updated");

          return reply.send({
            success: true,
            ollamaBaseUrl: apiKeys.ollamaBaseUrl ?? "http://host.docker.internal:11434",
            ollamaModel: apiKeys.ollamaModel ?? "qwen2.5:3b",
          });
        } catch (error) {
          request.log.error(error);
          return reply.status(500).send({ error: "Failed to update Ollama configuration" });
        }
      }
    );

    // ========================================
    // Per-User API Key Endpoints (no admin required)
    // ========================================

    // GET /api-keys/user - Get current user's own API keys (masked)
    fastify.get(
      "/api-keys/user",
      {
        schema: {
          description: "Retrieve current user's own API keys configuration (keys are masked for security)",
          tags: ["Settings"],
          summary: "Get user API keys",
          response: {
            200: {
              description: "User API keys configuration",
              type: "object",
              properties: {
                hasKeys: { type: "boolean" },
                tavilyApiKey: { type: "string", nullable: true },
                openaiApiKey: { type: "string", nullable: true },
                claudeApiKey: { type: "string", nullable: true },
                awsAccessKeyId: { type: "string", nullable: true },
                awsSecretAccessKey: { type: "string", nullable: true },
                awsRegion: { type: "string", nullable: true },
                activeProvider: { type: "string", nullable: true },
              },
            },
          },
        },
      },
      async (request: FastifyRequest, reply: FastifyReply) => {
        const prisma = getDatabaseClient();
        const userId = request.user!.userId;

        try {
          const userKeys = await prisma.userApiKey.findUnique({
            where: { userId },
          });

          if (!userKeys) {
            return reply.send({
              hasKeys: false,
              tavilyApiKey: null,
              openaiApiKey: null,
              claudeApiKey: null,
              awsAccessKeyId: null,
              awsSecretAccessKey: null,
              awsRegion: null,
              activeProvider: null,
            });
          }

          return reply.send({
            hasKeys: true,
            tavilyApiKey: maskKey(decryptOrNull(userKeys.tavilyApiKey)),
            openaiApiKey: maskKey(decryptOrNull(userKeys.openaiApiKey)),
            claudeApiKey: maskKey(decryptOrNull(userKeys.claudeApiKey)),
            awsAccessKeyId: maskKey(decryptOrNull(userKeys.awsAccessKeyId)),
            awsSecretAccessKey: maskKey(decryptOrNull(userKeys.awsSecretAccessKey)),
            awsRegion: userKeys.awsRegion ?? null,
            activeProvider: userKeys.activeProvider ?? null,
          });
        } catch (error) {
          request.log.error(error);
          return reply.status(500).send({ error: "Failed to retrieve user API keys" });
        }
      }
    );

    // PUT /api-keys/user - Update current user's own API keys
    fastify.put<{
      Body: {
        tavilyApiKey?: string;
        openaiApiKey?: string;
        claudeApiKey?: string;
        awsAccessKeyId?: string;
        awsSecretAccessKey?: string;
        awsRegion?: string;
        activeProvider?: string;
      };
    }>(
      "/api-keys/user",
      {
        schema: {
          description: "Update current user's own API keys",
          tags: ["Settings"],
          summary: "Update user API keys",
          body: {
            type: "object",
            properties: {
              tavilyApiKey: { type: "string", nullable: true },
              openaiApiKey: { type: "string", nullable: true },
              claudeApiKey: { type: "string", nullable: true },
              awsAccessKeyId: { type: "string", nullable: true },
              awsSecretAccessKey: { type: "string", nullable: true },
              awsRegion: { type: "string", nullable: true },
              activeProvider: { type: "string", enum: ["OPENAI", "ANTHROPIC_CLAUDE", "BEDROCK_CLAUDE", "OLLAMA"], nullable: true },
            },
          },
          response: {
            200: {
              description: "User API keys updated successfully",
              type: "object",
              properties: {
                success: { type: "boolean" },
                tavilyApiKey: { type: "string", nullable: true },
                openaiApiKey: { type: "string", nullable: true },
                claudeApiKey: { type: "string", nullable: true },
                awsAccessKeyId: { type: "string", nullable: true },
                activeProvider: { type: "string", nullable: true },
              },
            },
          },
        },
      },
      async (request: FastifyRequest<{
        Body: {
          tavilyApiKey?: string;
          openaiApiKey?: string;
          claudeApiKey?: string;
          awsAccessKeyId?: string;
          awsSecretAccessKey?: string;
          awsRegion?: string;
          activeProvider?: string;
        };
      }>, reply: FastifyReply) => {
        const prisma = getDatabaseClient();
        const userId = request.user!.userId;
        const { tavilyApiKey, openaiApiKey, claudeApiKey, awsAccessKeyId, awsSecretAccessKey, awsRegion, activeProvider } = request.body;

        // Validate API key formats
        if (tavilyApiKey) {
          const err = validateApiKeyFormat(tavilyApiKey, "tavily");
          if (err) return reply.status(400).send({ error: err });
        }
        if (openaiApiKey) {
          const err = validateApiKeyFormat(openaiApiKey, "openai");
          if (err) return reply.status(400).send({ error: err });
        }
        if (claudeApiKey) {
          const err = validateApiKeyFormat(claudeApiKey, "claude");
          if (err) return reply.status(400).send({ error: err });
        }
        if (awsAccessKeyId) {
          const err = validateApiKeyFormat(awsAccessKeyId, "aws-key");
          if (err) return reply.status(400).send({ error: err });
        }
        if (awsSecretAccessKey) {
          const err = validateApiKeyFormat(awsSecretAccessKey, "aws-secret");
          if (err) return reply.status(400).send({ error: err });
        }

        try {
          const updateData: Record<string, any> = {};

          if (tavilyApiKey !== undefined) {
            updateData.tavilyApiKey = encryptOrNull(tavilyApiKey || null);
          }
          if (openaiApiKey !== undefined) {
            updateData.openaiApiKey = encryptOrNull(openaiApiKey || null);
          }
          if (claudeApiKey !== undefined) {
            updateData.claudeApiKey = encryptOrNull(claudeApiKey || null);
          }
          if (awsAccessKeyId !== undefined) {
            updateData.awsAccessKeyId = encryptOrNull(awsAccessKeyId || null);
          }
          if (awsSecretAccessKey !== undefined) {
            updateData.awsSecretAccessKey = encryptOrNull(awsSecretAccessKey || null);
          }
          if (awsRegion !== undefined) {
            updateData.awsRegion = awsRegion || null;
          }
          if (activeProvider !== undefined) {
            updateData.activeProvider = (activeProvider as AiProvider) || null;
          }

          const userKeys = await prisma.userApiKey.upsert({
            where: { userId },
            update: updateData,
            create: {
              userId,
              ...updateData,
            },
          });

          request.log.info({ userId, action: "update_user_api_keys" }, "User API keys updated");

          return reply.send({
            success: true,
            tavilyApiKey: maskKey(decryptOrNull(userKeys.tavilyApiKey)),
            openaiApiKey: maskKey(decryptOrNull(userKeys.openaiApiKey)),
            claudeApiKey: maskKey(decryptOrNull(userKeys.claudeApiKey)),
            awsAccessKeyId: maskKey(decryptOrNull(userKeys.awsAccessKeyId)),
            activeProvider: userKeys.activeProvider ?? null,
          });
        } catch (error) {
          request.log.error(error);
          return reply.status(500).send({ error: "Failed to update user API keys" });
        }
      }
    );

    // DELETE /api-keys/user - Remove current user's own API keys (revert to global)
    fastify.delete(
      "/api-keys/user",
      {
        schema: {
          description: "Remove current user's own API keys (revert to using global keys)",
          tags: ["Settings"],
          summary: "Delete user API keys",
          response: {
            200: {
              description: "User API keys removed",
              type: "object",
              properties: {
                success: { type: "boolean" },
              },
            },
          },
        },
      },
      async (request: FastifyRequest, reply: FastifyReply) => {
        const prisma = getDatabaseClient();
        const userId = request.user!.userId;

        try {
          await prisma.userApiKey.deleteMany({
            where: { userId },
          });

          request.log.info({ userId, action: "delete_user_api_keys" }, "User API keys removed");

          return reply.send({ success: true });
        } catch (error) {
          request.log.error(error);
          return reply.status(500).send({ error: "Failed to remove user API keys" });
        }
      }
    );
  }
}

export const apiKeysController = new ApiKeysController();

