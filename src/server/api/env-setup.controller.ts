import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { existsSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";

interface EnvSetupBody {
  openaiApiKey: string;
  tavilyApiKey: string;
}

interface EnvStatus {
  exists: boolean;
  hasOpenaiKey: boolean;
  hasTavilyKey: boolean;
  hasDatabaseUrl: boolean;
  isConfigured: boolean;
}

export class EnvSetupController {
  private getEnvPath(): string {
    return join(process.cwd(), ".env");
  }

  private parseEnvFile(content: string): Record<string, string> {
    const env: Record<string, string> = {};
    const lines = content.split("\n");

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const eqIndex = trimmed.indexOf("=");
        if (eqIndex > 0) {
          const key = trimmed.substring(0, eqIndex).trim();
          let value = trimmed.substring(eqIndex + 1).trim();
          // Remove quotes if present
          if ((value.startsWith('"') && value.endsWith('"')) ||
              (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
          }
          env[key] = value;
        }
      }
    }

    return env;
  }

  private createEnvContent(openaiApiKey: string, tavilyApiKey: string): string {
    return `DATABASE_URL="file:./dev.db"
OPENAI_API_KEY=${openaiApiKey}
TAVILY_API_KEY=${tavilyApiKey}
`;
  }

  async registerRoutes(fastify: FastifyInstance): Promise<void> {
    // GET /env-status - Check if .env file exists and is configured
    fastify.get(
      "/env-status",
      {
        schema: {
          description: "Check if .env file exists and has required API keys configured",
          tags: ["Settings"],
          summary: "Get environment configuration status",
          response: {
            200: {
              description: "Environment status",
              type: "object",
              properties: {
                exists: { type: "boolean" },
                hasOpenaiKey: { type: "boolean" },
                hasTavilyKey: { type: "boolean" },
                hasDatabaseUrl: { type: "boolean" },
                isConfigured: { type: "boolean" },
              },
            },
          },
        },
      },
      async (request: FastifyRequest, reply: FastifyReply) => {
        try {
          const envPath = this.getEnvPath();
          const exists = existsSync(envPath);

          let hasOpenaiKey = false;
          let hasTavilyKey = false;
          let hasDatabaseUrl = false;

          if (exists) {
            const content = readFileSync(envPath, "utf-8");
            const env = this.parseEnvFile(content);

            hasOpenaiKey = !!(env.OPENAI_API_KEY && env.OPENAI_API_KEY.length > 0);
            hasTavilyKey = !!(env.TAVILY_API_KEY && env.TAVILY_API_KEY.length > 0);
            hasDatabaseUrl = !!(env.DATABASE_URL && env.DATABASE_URL.length > 0);
          }

          const status: EnvStatus = {
            exists,
            hasOpenaiKey,
            hasTavilyKey,
            hasDatabaseUrl,
            isConfigured: hasOpenaiKey && hasTavilyKey && hasDatabaseUrl,
          };

          return reply.send(status);
        } catch (error) {
          request.log.error(error);
          return reply.status(500).send({ error: "Failed to check environment status" });
        }
      }
    );

    // POST /env-setup - Create or update .env file with API keys
    fastify.post<{ Body: EnvSetupBody }>(
      "/env-setup",
      {
        schema: {
          description: "Create or update .env file with API keys",
          tags: ["Settings"],
          summary: "Setup environment configuration",
          body: {
            type: "object",
            required: ["openaiApiKey", "tavilyApiKey"],
            properties: {
              openaiApiKey: { type: "string", description: "OpenAI API Key" },
              tavilyApiKey: { type: "string", description: "Tavily API Key" },
            },
          },
          response: {
            200: {
              description: "Environment setup successful",
              type: "object",
              properties: {
                success: { type: "boolean" },
                message: { type: "string" },
              },
            },
            400: {
              description: "Invalid request",
              type: "object",
              properties: {
                error: { type: "string" },
              },
            },
          },
        },
      },
      async (request: FastifyRequest<{ Body: EnvSetupBody }>, reply: FastifyReply) => {
        const { openaiApiKey, tavilyApiKey } = request.body;

        // Validate input
        if (!openaiApiKey || openaiApiKey.trim().length === 0) {
          return reply.status(400).send({ error: "OpenAI API Key è obbligatoria" });
        }

        if (!tavilyApiKey || tavilyApiKey.trim().length === 0) {
          return reply.status(400).send({ error: "Tavily API Key è obbligatoria" });
        }

        try {
          const envPath = this.getEnvPath();
          const content = this.createEnvContent(openaiApiKey.trim(), tavilyApiKey.trim());

          writeFileSync(envPath, content, "utf-8");

          // Also set the environment variables for the current process
          process.env.OPENAI_API_KEY = openaiApiKey.trim();
          process.env.TAVILY_API_KEY = tavilyApiKey.trim();
          process.env.DATABASE_URL = "file:./dev.db";

          return reply.send({
            success: true,
            message: "File .env creato con successo",
          });
        } catch (error) {
          request.log.error(error);
          return reply.status(500).send({ error: "Failed to create .env file" });
        }
      }
    );
  }
}

export const envSetupController = new EnvSetupController();
