import Fastify, { FastifyInstance } from "fastify";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";
import fastifyMultipart from "@fastify/multipart";
import fastifyCors from "@fastify/cors";

import { conformityPdfController } from "./conformity-pdf.controller";
import { customChecksController } from "./custom-checks.controller";
import { apiKeysController } from "./api-keys.controller";

interface ServerConfig {
  port: number;
  host: string;
}

const DEFAULT_CONFIG: ServerConfig = {
  port: Number(process.env.API_PORT) || 3007,
  host: process.env.API_HOST || "0.0.0.0",
};

const createFastifyInstance = (): FastifyInstance => {
  return Fastify({
    logger: {
      level: process.env.LOG_LEVEL || "info",
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "HH:MM:ss Z",
          ignore: "pid,hostname",
        },
      },
    },
  });
};

const registerPlugins = async (fastify: FastifyInstance): Promise<void> => {
  // CORS
  await fastify.register(fastifyCors, {
    origin: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  });

  // Multipart for file uploads
  await fastify.register(fastifyMultipart, {
    limits: {
      fileSize: 50 * 1024 * 1024, // 50MB max file size
      files: 20, // Max 20 files per request
    },
  });

  // Swagger documentation
  await fastify.register(fastifySwagger, {
    openapi: {
      openapi: "3.0.0",
      info: {
        title: "Formit Conformity API",
        description:
          "API for checking PDF documents against CEIRSA and beverage compliance standards",
        version: "1.0.0",
        contact: {
          name: "Formit",
          url: "https://github.com/francemazzi/formit_local",
        },
      },
      servers: [
        {
          url: `http://localhost:${DEFAULT_CONFIG.port}`,
          description: "Local development server",
        },
      ],
      tags: [
        {
          name: "Conformity",
          description: "PDF compliance checking endpoints",
        },
        {
          name: "Custom Checks",
          description: "Custom compliance check categories and parameters management",
        },
        {
          name: "Health",
          description: "Health check endpoints",
        },
        {
          name: "Settings",
          description: "API keys and settings management",
        },
      ],
    },
    transform: ({ schema, url }) => {
      // Add file upload schema for conformity-pdf endpoint
      if (url === "/conformity-pdf") {
        return {
          schema: {
            ...schema,
            consumes: ["multipart/form-data"],
            body: {
              type: "object",
              properties: {
                files: {
                  type: "array",
                  items: { type: "string", format: "binary" },
                  description: "PDF files to upload for compliance checking",
                },
              },
            },
          },
          url,
        };
      }
      return { schema, url };
    },
  });

  // Swagger UI
  await fastify.register(fastifySwaggerUi, {
    routePrefix: "/docs",
    uiConfig: {
      docExpansion: "list",
      deepLinking: true,
      displayRequestDuration: true,
    },
    staticCSP: true,
  });
};

const registerRoutes = async (fastify: FastifyInstance): Promise<void> => {
  // Health check endpoint
  fastify.get(
    "/health",
    {
      schema: {
        description: "Health check endpoint",
        tags: ["Health"],
        summary: "Check API health",
        response: {
          200: {
            type: "object",
            properties: {
              status: { type: "string" },
              timestamp: { type: "string" },
              uptime: { type: "number" },
            },
          },
        },
      },
    },
    async () => ({
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    })
  );

  // Register conformity controller
  await conformityPdfController.registerRoutes(fastify);

  // Register custom checks controller
  await customChecksController.registerRoutes(fastify);

  // Register API keys controller
  await apiKeysController.registerRoutes(fastify);
};

export class ApiServer {
  private fastify: FastifyInstance;
  private config: ServerConfig;

  constructor(config: Partial<ServerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.fastify = createFastifyInstance();
  }

  async start(): Promise<void> {
    try {
      await registerPlugins(this.fastify);
      await registerRoutes(this.fastify);

      await this.fastify.listen({
        port: this.config.port,
        host: this.config.host,
      });

      console.log(`
╔══════════════════════════════════════════════════════════════════╗
║              Formit Conformity API Server                        ║
╠══════════════════════════════════════════════════════════════════╣
║  Server running at: http://${this.config.host}:${this.config.port}                    ║
║  Swagger docs at:   http://localhost:${this.config.port}/docs                ║
║                                                                  ║
║  Endpoints:                                                      ║
║  - POST /conformity-pdf                   PDF compliance check   ║
║  - GET  /health                           Health check           ║
║                                                                  ║
║  Custom Checks API:                                              ║
║  - GET/POST /custom-checks/categories     Manage categories      ║
║  - POST /custom-checks/categories/:id/parameters  Add parameters ║
║  - PUT/DELETE /custom-checks/parameters/:id       Edit/Delete    ║
║  - POST /custom-checks/import             Import category        ║
║  - GET  /custom-checks/export/:id         Export category        ║
╚══════════════════════════════════════════════════════════════════╝
      `);
    } catch (error) {
      this.fastify.log.error(error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    await this.fastify.close();
  }

  getInstance(): FastifyInstance {
    return this.fastify;
  }
}

export const createApiServer = (config?: Partial<ServerConfig>): ApiServer => {
  return new ApiServer(config);
};

// Start server if run directly
if (require.main === module) {
  const server = createApiServer();
  server.start().catch((error) => {
    console.error("Failed to start server:", error);
    process.exit(1);
  });
}
