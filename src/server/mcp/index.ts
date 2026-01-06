import "dotenv/config";

import { initializeDatabase, shutdownDatabase } from "../prisma.client";
import { FormitMcpServer } from "./server";

/**
 * Entry point for the Formit MCP Server.
 * Initializes database connection and starts the MCP server.
 */
const main = async (): Promise<void> => {
  const server = new FormitMcpServer();

  // Handle graceful shutdown
  const handleShutdown = async (): Promise<void> => {
    console.error("Shutting down MCP server...");
    await server.shutdown();
    await shutdownDatabase();
    process.exit(0);
  };

  process.on("SIGINT", () => void handleShutdown());
  process.on("SIGTERM", () => void handleShutdown());

  try {
    // Initialize database before starting server
    await initializeDatabase();
    console.error("Database initialized");

    // Start MCP server
    await server.start();
  } catch (error) {
    console.error("Failed to start MCP server:", error);
    await shutdownDatabase();
    process.exit(1);
  }
};

void main();

