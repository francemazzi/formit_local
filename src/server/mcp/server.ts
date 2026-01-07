import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { bulkPdfCheckService } from "./tools/bulk_pdf_check.tool";
import type { PdfCheckRequest, BulkPdfCheckResponse } from "./types";

/**
 * Input schema for bulk_pdf_check tool validation.
 */
const BulkPdfCheckInputSchema = z.object({
  pdfPaths: z
    .array(z.string())
    .min(1, "At least one PDF path is required")
    .describe("List of absolute or relative paths to PDF files to analyze"),
});

/**
 * MCP Server for microbiological PDF analysis.
 * Exposes tools for bulk compliance checking of PDF documents.
 */
export class FormitMcpServer {
  private readonly server: Server;

  constructor() {
    this.server = new Server(
      {
        name: "formit-microbiological-analysis",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.registerHandlers();
  }

  /**
   * Register all MCP request handlers.
   */
  private registerHandlers(): void {
    this.registerListToolsHandler();
    this.registerCallToolHandler();
    this.registerErrorHandler();
  }

  /**
   * Handler for listing available tools.
   */
  private registerListToolsHandler(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "bulk_pdf_check",
          description:
            "Analyze multiple PDF documents containing microbiological analysis results. " +
            "Extracts text from each PDF, identifies analysis parameters, and checks compliance " +
            "against CEIRSA regulations or beverage standards. Returns detailed compliance results " +
            "for each document with sources and descriptions.",
          inputSchema: {
            type: "object" as const,
            properties: {
              pdfPaths: {
                type: "array",
                items: { type: "string" },
                minItems: 1,
                description:
                  "List of file paths to PDF documents to analyze. " +
                  "Paths can be absolute or relative to the server working directory.",
              },
            },
            required: ["pdfPaths"],
          },
        },
        {
          name: "single_pdf_check",
          description:
            "Analyze a single PDF document containing microbiological analysis results. " +
            "Extracts text, identifies analysis parameters, and checks compliance. " +
            "Use bulk_pdf_check for multiple documents.",
          inputSchema: {
            type: "object" as const,
            properties: {
              pdfPath: {
                type: "string",
                description:
                  "File path to the PDF document to analyze. " +
                  "Can be absolute or relative to the server working directory.",
              },
            },
            required: ["pdfPath"],
          },
        },
      ],
    }));
  }

  /**
   * Handler for executing tool calls.
   */
  private registerCallToolHandler(): void {
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      switch (name) {
        case "bulk_pdf_check":
          return this.handleBulkPdfCheck(args);

        case "single_pdf_check":
          return this.handleSinglePdfCheck(args);

        default:
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${name}`
          );
      }
    });
  }

  /**
   * Handle bulk_pdf_check tool invocation.
   */
  private async handleBulkPdfCheck(
    args: unknown
  ): Promise<{ content: Array<{ type: "text"; text: string }> }> {
    const validated = BulkPdfCheckInputSchema.safeParse(args);

    if (!validated.success) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Invalid input: ${validated.error.message}`
      );
    }

    const request: PdfCheckRequest = {
      pdfPaths: validated.data.pdfPaths,
    };

    const response = await bulkPdfCheckService.execute(request);

    return {
      content: [
        {
          type: "text",
          text: this.formatBulkResponse(response),
        },
      ],
    };
  }

  /**
   * Handle single_pdf_check tool invocation.
   */
  private async handleSinglePdfCheck(
    args: unknown
  ): Promise<{ content: Array<{ type: "text"; text: string }> }> {
    const schema = z.object({
      pdfPath: z.string().min(1, "PDF path is required"),
    });

    const validated = schema.safeParse(args);

    if (!validated.success) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Invalid input: ${validated.error.message}`
      );
    }

    const request: PdfCheckRequest = {
      pdfPaths: [validated.data.pdfPath],
    };

    const response = await bulkPdfCheckService.execute(request);
    const singleResult = response.results[0];

    if (!singleResult) {
      throw new McpError(
        ErrorCode.InternalError,
        "No result returned for PDF analysis"
      );
    }

    return {
      content: [
        {
          type: "text",
          text: this.formatSingleResult(singleResult),
        },
      ],
    };
  }

  /**
   * Format bulk check response for display.
   */
  private formatBulkResponse(response: BulkPdfCheckResponse): string {
    const lines: string[] = [
      "# Bulk PDF Analysis Results",
      "",
      `**Total Processed:** ${response.totalProcessed}`,
      `**Success:** ${response.successCount}`,
      `**Errors:** ${response.errorCount}`,
      "",
      "---",
      "",
    ];

    for (const result of response.results) {
      lines.push(this.formatSingleResult(result));
      lines.push("");
      lines.push("---");
      lines.push("");
    }

    return lines.join("\n");
  }

  /**
   * Format a single PDF result for display.
   */
  private formatSingleResult(
    result: BulkPdfCheckResponse["results"][number]
  ): string {
    const lines: string[] = [`## ${result.fileName}`, ""];

    if (result.status === "error") {
      lines.push(`**Status:** ❌ Error`);
      lines.push(`**Error:** ${result.error}`);
      return lines.join("\n");
    }

    lines.push(`**Status:** ✅ Success`);
    lines.push(`**Path:** ${result.pdfPath}`);
    lines.push("");

    if (result.complianceResults.length === 0) {
      lines.push(
        "*No compliance checks applicable for this document (not CEIRSA or beverage category)*"
      );
      return lines.join("\n");
    }

    lines.push("### Compliance Results");
    lines.push("");

    for (const check of result.complianceResults) {
      const status =
        check.isCompliant === true
          ? "✅"
          : check.isCompliant === false
          ? "❌"
          : "⚠️"; // null = da confermare
      lines.push(`- **${check.name}:** ${check.value} ${status}`);
      lines.push(`  - ${check.description}`);

      if (check.sources.length > 0) {
        lines.push(`  - Sources:`);
        for (const source of check.sources) {
          const link = source.url ? ` ([link](${source.url}))` : "";
          lines.push(`    - ${source.title}${link}`);
        }
      }
    }

    return lines.join("\n");
  }

  /**
   * Register error handler for unhandled exceptions.
   */
  private registerErrorHandler(): void {
    this.server.onerror = (error): void => {
      console.error("[MCP Server Error]", error);
    };
  }

  /**
   * Start the MCP server with stdio transport.
   */
  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Formit MCP Server started on stdio");
  }

  /**
   * Gracefully shutdown the server.
   */
  async shutdown(): Promise<void> {
    await this.server.close();
  }
}

