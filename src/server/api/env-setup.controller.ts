import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { existsSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { requireAuth } from "../auth/auth.middleware";
import { isProviderConfigured, getActiveProvider, isOllamaReachable } from "../utils/api-keys.utils";

interface EnvSetupBody {
  openaiApiKey: string;
  tavilyApiKey?: string;  // optional - Tavily is not required
}

interface EnvStatus {
  exists: boolean;
  hasOpenaiKey: boolean;
  hasTavilyKey: boolean;
  hasDatabaseUrl: boolean;
  isConfigured: boolean;
  activeProvider: string;
  ollamaAvailable: boolean;
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

  private createEnvContent(openaiApiKey: string, tavilyApiKey?: string): string {
    let content = `DATABASE_URL="file:./dev.db"
OPENAI_API_KEY=${openaiApiKey}
`;
    if (tavilyApiKey) {
      content += `TAVILY_API_KEY=${tavilyApiKey}\n`;
    }
    return content;
  }

  async registerRoutes(fastify: FastifyInstance): Promise<void> {
    // All env setup routes require authentication
    fastify.addHook("preHandler", requireAuth);

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
                activeProvider: { type: "string" },
                ollamaAvailable: { type: "boolean" },
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

          // Check Ollama reachability and active provider configuration
          const activeProvider = await getActiveProvider();
          const ollamaAvailable = await isOllamaReachable();
          const providerTypeMap: Record<string, "openai" | "anthropic" | "bedrock" | "ollama"> = {
            OPENAI: "openai",
            ANTHROPIC_CLAUDE: "anthropic",
            BEDROCK_CLAUDE: "bedrock",
            OLLAMA: "ollama",
          };
          const providerType = providerTypeMap[activeProvider] || "ollama";
          const providerReady = await isProviderConfigured(providerType);

          const status: EnvStatus = {
            exists,
            hasOpenaiKey,
            hasTavilyKey,
            hasDatabaseUrl,
            // Configured if the active provider is ready (Ollama must be reachable)
            isConfigured: providerReady,
            activeProvider,
            ollamaAvailable,
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
            required: ["openaiApiKey"],  // tavilyApiKey is optional
            properties: {
              openaiApiKey: { type: "string", description: "OpenAI API Key" },
              tavilyApiKey: { type: "string", description: "Tavily API Key (optional)" },
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

        // Validate input - only OpenAI key is required, Tavily is optional
        if (!openaiApiKey || openaiApiKey.trim().length === 0) {
          return reply.status(400).send({ error: "OpenAI API Key è obbligatoria" });
        }
        // Tavily API key is optional - no validation required

        try {
          const envPath = this.getEnvPath();
          const trimmedTavilyKey = tavilyApiKey?.trim() || undefined;
          const content = this.createEnvContent(openaiApiKey.trim(), trimmedTavilyKey);

          writeFileSync(envPath, content, "utf-8");

          // Also set the environment variables for the current process
          process.env.OPENAI_API_KEY = openaiApiKey.trim();
          if (trimmedTavilyKey) {
            process.env.TAVILY_API_KEY = trimmedTavilyKey;
          }
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
