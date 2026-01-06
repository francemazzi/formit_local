import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import * as fs from "node:fs";
import * as path from "node:path";
import { randomUUID } from "node:crypto";

import { checks, ComplianceResult } from "../modules/checks";
import { extractTextFromPdf } from "../modules/extract_text_from_pdf";

interface PdfCheckResult {
  fileName: string;
  success: boolean;
  results: ComplianceResult[];
  error?: string;
}

interface ConformityPdfResponse {
  totalFiles: number;
  processedFiles: number;
  results: PdfCheckResult[];
}

interface UploadedFile {
  filename: string;
  mimetype: string;
  buffer: Buffer;
}

const UPLOAD_DIR = path.resolve(process.cwd(), "uploads", "conformity");

const ensureUploadDir = async (): Promise<void> => {
  if (!fs.existsSync(UPLOAD_DIR)) {
    await fs.promises.mkdir(UPLOAD_DIR, { recursive: true });
  }
};

const saveTempFile = async (
  buffer: Buffer,
  originalName: string
): Promise<string> => {
  await ensureUploadDir();
  const uniqueId = randomUUID();
  const extension = path.extname(originalName) || ".pdf";
  const tempFileName = `${uniqueId}${extension}`;
  const tempFilePath = path.join(UPLOAD_DIR, tempFileName);

  await fs.promises.writeFile(tempFilePath, buffer);
  return tempFilePath;
};

const cleanupTempFile = async (filePath: string): Promise<void> => {
  try {
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }
  } catch {
    // Ignore cleanup errors
  }
};

const processSinglePdf = async (
  file: UploadedFile
): Promise<PdfCheckResult> => {
  let tempFilePath: string | null = null;

  try {
    tempFilePath = await saveTempFile(file.buffer, file.filename);

    const textObjects = await extractTextFromPdf(tempFilePath);
    const results = await checks(textObjects);

    return {
      fileName: file.filename,
      success: true,
      results,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    return {
      fileName: file.filename,
      success: false,
      results: [],
      error: errorMessage,
    };
  } finally {
    if (tempFilePath) {
      await cleanupTempFile(tempFilePath);
    }
  }
};

export class ConformityPdfController {
  async registerRoutes(fastify: FastifyInstance): Promise<void> {
    fastify.post<{
      Reply: ConformityPdfResponse;
    }>(
      "/conformity-pdf",
      {
        schema: {
          description:
            "Upload one or more PDF files for compliance checking against CEIRSA or beverage standards. Use multipart/form-data with field name 'files'",
          tags: ["Conformity"],
          summary: "Check PDF compliance",
          response: {
            200: {
              description: "Successful compliance check",
              type: "object",
              properties: {
                totalFiles: {
                  type: "number",
                  description: "Total number of files uploaded",
                },
                processedFiles: {
                  type: "number",
                  description: "Number of files successfully processed",
                },
                results: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      fileName: {
                        type: "string",
                        description: "Original file name",
                      },
                      success: {
                        type: "boolean",
                        description: "Whether processing was successful",
                      },
                      results: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            name: {
                              type: "string",
                              description: "Parameter name",
                            },
                            matrix: {
                              type: "object",
                              description: "Extracted matrix information",
                              properties: {
                                matrix: {
                                  type: "string",
                                  description: "Matrix type (e.g., 'Tampone ambientale')",
                                },
                                description: {
                                  type: "string",
                                  nullable: true,
                                  description: "Matrix description",
                                },
                                product: {
                                  type: "string",
                                  nullable: true,
                                  description: "Product name",
                                },
                                category: {
                                  type: "string",
                                  enum: ["food", "beverage", "other"],
                                  description: "Product category",
                                },
                                ceirsaCategory: {
                                  type: "string",
                                  nullable: true,
                                  description: "Matched CEIRSA category name",
                                },
                              },
                            },
                            value: {
                              type: "string",
                              description: "Limit value applied",
                            },
                            isCheck: {
                              type: "boolean",
                              description: "Whether the check passed",
                            },
                            description: {
                              type: "string",
                              description: "Detailed description of the check",
                            },
                            sources: {
                              type: "array",
                              items: {
                                type: "object",
                                properties: {
                                  id: { type: "string" },
                                  title: { type: "string" },
                                  url: {
                                    type: "string",
                                    nullable: true,
                                  },
                                  excerpt: { type: "string" },
                                },
                              },
                            },
                          },
                        },
                      },
                      error: {
                        type: "string",
                        nullable: true,
                        description: "Error message if processing failed",
                      },
                    },
                  },
                },
              },
            },
            400: {
              description: "Bad request - no files uploaded",
              type: "object",
              properties: {
                error: { type: "string" },
              },
            },
          },
        },
      },
      async (request: FastifyRequest, reply: FastifyReply) => {
        const files = await this.extractFiles(request);

        if (files.length === 0) {
          return reply.status(400).send({
            error: "No PDF files uploaded. Please upload at least one PDF file.",
          });
        }

        const pdfFiles = files.filter(
          (file) =>
            file.mimetype === "application/pdf" ||
            file.filename.toLowerCase().endsWith(".pdf")
        );

        if (pdfFiles.length === 0) {
          return reply.status(400).send({
            error: "No valid PDF files found. Please upload PDF files only.",
          });
        }

        const results = await Promise.all(
          pdfFiles.map((file) => processSinglePdf(file))
        );

        const processedCount = results.filter((r) => r.success).length;

        const response: ConformityPdfResponse = {
          totalFiles: pdfFiles.length,
          processedFiles: processedCount,
          results,
        };

        return reply.status(200).send(response);
      }
    );
  }

  private async extractFiles(request: FastifyRequest): Promise<UploadedFile[]> {
    const files: UploadedFile[] = [];

    try {
      const parts = request.parts();
      for await (const part of parts) {
        if (part.type === "file") {
          const buffer = await part.toBuffer();
          files.push({
            filename: part.filename,
            mimetype: part.mimetype,
            buffer,
          });
        }
      }
    } catch {
      // Fallback: try single file upload
      try {
        const file = await request.file();
        if (file) {
          const buffer = await file.toBuffer();
          files.push({
            filename: file.filename,
            mimetype: file.mimetype,
            buffer,
          });
        }
      } catch {
        // No files found
      }
    }

    return files;
  }
}

export const conformityPdfController = new ConformityPdfController();

