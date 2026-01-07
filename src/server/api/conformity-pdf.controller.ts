import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import * as fs from "node:fs";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";

import { checksWithOptions, ComplianceResult } from "../modules/checks";
import { extractTextFromPdf, ExtractedTextEntry } from "../modules/extract_text_from_pdf";
import { extractMatrixFromText, MatrixExtractionResult } from "../modules/extract_matrix_from_text";
import { extractAnalysesFromText, Analyses } from "../modules/extract_analyses_from_text";
import { getDatabaseClient } from "../prisma.client";

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
    
    // Extract matrix and analyses separately to save them in database
    const matrix = await extractMatrixFromText(textObjects);
    const analyses = await extractAnalysesFromText(textObjects);
    
    // Use checksWithOptions with fallbackToCustom to enable custom category matching
    // for samples that don't fit standard CEIRSA categories (e.g., environmental swabs)
    // Pass pdfPath to enable GPT-4 Vision OCR fallback for corrupted text
    const results = await checksWithOptions(textObjects, {
      fallbackToCustom: true,
      pdfPath: tempFilePath,
    });

    // Save extracted data to database
    await saveExtractionToDatabase({
      fileName: file.filename,
      textObjects,
      matrix,
      analyses,
      results,
      success: true,
    });

    return {
      fileName: file.filename,
      success: true,
      results,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    // Save failed extraction to database
    await saveExtractionToDatabase({
      fileName: file.filename,
      textObjects: [],
      matrix: null,
      analyses: [],
      results: [],
      success: false,
      error: errorMessage,
    });

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

interface ExtractionData {
  fileName: string;
  textObjects: ExtractedTextEntry[];
  matrix: MatrixExtractionResult | null;
  analyses: Analyses[];
  results: ComplianceResult[];
  success: boolean;
  error?: string;
}

const saveExtractionToDatabase = async (
  data: ExtractionData
): Promise<void> => {
  try {
    const client = getDatabaseClient();
    
    // Serialize data to JSON-compatible format
    const extractedData: Prisma.InputJsonValue = JSON.parse(
      JSON.stringify({
        textObjects: data.textObjects,
        matrix: data.matrix,
        analyses: data.analyses,
        results: data.results,
        metadata: {
          extractedAt: new Date().toISOString(),
          totalTextEntries: data.textObjects.length,
          totalAnalyses: data.analyses.length,
          totalResults: data.results.length,
        },
      })
    );

    await client.pdfExtraction.create({
      data: {
        fileName: data.fileName,
        extractedData,
        success: data.success,
        error: data.error || null,
      },
    });
  } catch (error) {
    console.error("Failed to save extraction to database:", error);
    // Don't throw - we don't want to fail the request if DB save fails
  }
};

export class ConformityPdfController {
  async registerRoutes(fastify: FastifyInstance): Promise<void> {
    // Endpoint to get all PDF extractions
    fastify.get(
      "/conformity-pdf/extractions",
      {
        schema: {
          description: "Get all PDF extraction results",
          tags: ["Conformity"],
          summary: "List all PDF extractions",
          querystring: {
            type: "object",
            properties: {
              limit: {
                type: "number",
                description: "Maximum number of results to return",
                default: 50,
              },
              offset: {
                type: "number",
                description: "Number of results to skip",
                default: 0,
              },
            },
          },
          response: {
            200: {
              description: "List of PDF extractions",
              type: "object",
              properties: {
                total: { type: "number" },
                limit: { type: "number" },
                offset: { type: "number" },
                extractions: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      fileName: { type: "string" },
                      createdAt: { type: "string" },
                      updatedAt: { type: "string" },
                      success: { type: "boolean" },
                      error: { type: "string", nullable: true },
                      extractedData: { 
                        type: "object",
                        additionalProperties: true 
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      async (request: FastifyRequest, reply: FastifyReply) => {
        const query = request.query as { limit?: number; offset?: number };
        const limit = Math.min(query.limit || 50, 100); // Max 100
        const offset = query.offset || 0;

        const client = getDatabaseClient();
        
        // Get raw data from database to ensure JSON is properly retrieved
        // Note: Prisma $queryRaw with SQLite automatically deserializes JSON columns
        const rawExtractions = await client.$queryRaw<Array<{
          id: string;
          fileName: string;
          createdAt: Date;
          updatedAt: Date;
          success: number;
          error: string | null;
          extractedData: any; // Can be string or already parsed object
        }>>`SELECT * FROM PdfExtraction ORDER BY createdAt DESC LIMIT ${limit} OFFSET ${offset}`;
        
        const total = await client.pdfExtraction.count();

        // Parse JSON data from SQLite text field
        const serializedExtractions = rawExtractions.map((extraction) => {
          let extractedData = {};
          try {
            // Prisma with $queryRaw already deserializes JSON fields as objects
            // If it's already an object, use it directly. If it's a string, parse it.
            if (typeof extraction.extractedData === 'string') {
              extractedData = JSON.parse(extraction.extractedData);
            } else if (extraction.extractedData && typeof extraction.extractedData === 'object' && !Array.isArray(extraction.extractedData)) {
              // Already an object, use it directly
              extractedData = extraction.extractedData;
            }
          } catch (error) {
            console.error(`[ERROR] Failed to parse extractedData for ${extraction.fileName}:`, error);
          }
          
          // SQLite stores booleans as integers (0/1)
          // Convert to boolean: any truthy number becomes true
          const success = Boolean(extraction.success);
          
          return {
            id: extraction.id,
            fileName: extraction.fileName,
            createdAt: new Date(extraction.createdAt).toISOString(),
            updatedAt: new Date(extraction.updatedAt).toISOString(),
            success,
            error: extraction.error,
            extractedData,
          };
        });

        return reply.status(200).send({
          total,
          limit,
          offset,
          extractions: serializedExtractions,
        });
      }
    );

    // Endpoint to get a specific PDF extraction by ID
    fastify.get(
      "/conformity-pdf/extractions/:id",
      {
        schema: {
          description: "Get a specific PDF extraction by ID",
          tags: ["Conformity"],
          summary: "Get PDF extraction by ID",
          params: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "Extraction ID",
              },
            },
          },
          response: {
            200: {
              description: "PDF extraction details",
              type: "object",
              additionalProperties: true,
            },
            404: {
              description: "Extraction not found",
              type: "object",
              properties: {
                error: { type: "string" },
              },
            },
          },
        },
      },
      async (request: FastifyRequest, reply: FastifyReply) => {
        const params = request.params as { id: string };
        const client = getDatabaseClient();
        
        // Get raw data from database to ensure JSON is properly retrieved
        // Note: Prisma $queryRaw with SQLite automatically deserializes JSON columns
        const rawExtractions = await client.$queryRaw<Array<{
          id: string;
          fileName: string;
          createdAt: Date;
          updatedAt: Date;
          success: number;
          error: string | null;
          extractedData: any; // Can be string or already parsed object
        }>>`SELECT * FROM PdfExtraction WHERE id = ${params.id}`;

        if (!rawExtractions || rawExtractions.length === 0) {
          return reply.status(404).send({
            error: "Extraction not found",
          });
        }

        const extraction = rawExtractions[0]!;
        
        let extractedData = {};
        try {
          // Prisma with $queryRaw already deserializes JSON fields as objects
          // If it's already an object, use it directly. If it's a string, parse it.
          if (typeof extraction.extractedData === 'string') {
            extractedData = JSON.parse(extraction.extractedData);
          } else if (extraction.extractedData && typeof extraction.extractedData === 'object' && !Array.isArray(extraction.extractedData)) {
            // Already an object, use it directly
            extractedData = extraction.extractedData;
          }
        } catch (error) {
          console.error(`[ERROR] Failed to parse extractedData for ${extraction.fileName}:`, error);
        }
        
        // SQLite stores booleans as integers (0/1)
        // Convert to boolean: any truthy number becomes true
        const success = Boolean(extraction.success);
        
        const serializedExtraction = {
          id: extraction.id,
          fileName: extraction.fileName,
          createdAt: new Date(extraction.createdAt).toISOString(),
          updatedAt: new Date(extraction.updatedAt).toISOString(),
          success,
          error: extraction.error,
          extractedData,
        };

        return reply.status(200).send(serializedExtraction);
      }
    );

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

