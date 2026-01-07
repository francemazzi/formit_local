import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getDatabaseClient } from "../prisma.client";

// ========================================
// Request Body Types
// ========================================

interface UpdateApiKeysBody {
  tavilyApiKey?: string;
  openaiApiKey?: string;
}

// ========================================
// Controller Implementation
// ========================================

export class ApiKeysController {
  async registerRoutes(fastify: FastifyInstance): Promise<void> {
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

          // Mask the keys for security (show only last 4 characters)
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
  }
}

export const apiKeysController = new ApiKeysController();

