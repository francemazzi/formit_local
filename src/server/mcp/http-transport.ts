import "dotenv/config";
import { createServer, IncomingMessage, ServerResponse } from "node:http";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";

import { initializeDatabase, shutdownDatabase } from "../prisma.client";
import { FormitMcpServer } from "./server";

const HTTP_PORT = parseInt(process.env.MCP_HTTP_PORT ?? "3007", 10);

/**
 * HTTP/SSE Transport for MCP Server.
 * Required for deployment on OpenAI Apps SDK (public endpoint).
 */
class HttpMcpTransport {
  private readonly mcpServer: FormitMcpServer;
  private activeTransports: Map<string, SSEServerTransport> = new Map();

  constructor() {
    this.mcpServer = new FormitMcpServer();
  }

  /**
   * Handle incoming HTTP requests for MCP over SSE.
   */
  private handleRequest(req: IncomingMessage, res: ServerResponse): void {
    // CORS headers for ChatGPT
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization"
    );

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

    // Health check endpoint
    if (url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", service: "formit-mcp" }));
      return;
    }

    // SSE endpoint for MCP
    if (url.pathname === "/sse" && req.method === "GET") {
      this.handleSseConnection(req, res);
      return;
    }

    // Message endpoint for MCP
    if (url.pathname === "/message" && req.method === "POST") {
      this.handleMessage(req, res);
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  }

  /**
   * Handle SSE connection establishment.
   */
  private handleSseConnection(
    _req: IncomingMessage,
    res: ServerResponse
  ): void {
    const sessionId = crypto.randomUUID();
    const transport = new SSEServerTransport("/message", res);

    this.activeTransports.set(sessionId, transport);

    res.on("close", () => {
      this.activeTransports.delete(sessionId);
    });

    // Note: In production, connect transport to server instance
    console.log(`SSE connection established: ${sessionId}`);
  }

  /**
   * Handle incoming MCP messages.
   */
  private handleMessage(req: IncomingMessage, res: ServerResponse): void {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk.toString();
    });

    req.on("end", () => {
      try {
        const message = JSON.parse(body);
        // Route message to appropriate transport
        console.log("Received MCP message:", message);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ received: true }));
      } catch (error) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON" }));
      }
    });
  }

  /**
   * Start HTTP server.
   */
  async start(): Promise<void> {
    await initializeDatabase();
    console.log("Database initialized");

    const server = createServer((req, res) => this.handleRequest(req, res));

    server.listen(HTTP_PORT, () => {
      console.log(`Formit MCP Server (HTTP) running on port ${HTTP_PORT}`);
      console.log(`Health check: http://localhost:${HTTP_PORT}/health`);
      console.log(`SSE endpoint: http://localhost:${HTTP_PORT}/sse`);
    });

    // Graceful shutdown
    const shutdown = async (): Promise<void> => {
      console.log("Shutting down...");
      server.close();
      await shutdownDatabase();
      process.exit(0);
    };

    process.on("SIGINT", () => void shutdown());
    process.on("SIGTERM", () => void shutdown());
  }
}

const transport = new HttpMcpTransport();
void transport.start();
