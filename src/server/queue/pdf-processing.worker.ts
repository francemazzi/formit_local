import { Worker, Job, ConnectionOptions } from "bullmq";
import * as fs from "node:fs";
import { PdfProcessingJobData, PdfProcessingJobResult } from "./pdf-processing.queue";
import { checksWithOptions, ComplianceResult } from "../modules/checks";
import { extractTextFromPdf } from "../modules/extract_text_from_pdf";
import { extractMatrixFromText } from "../modules/extract_matrix_from_text";
import { extractAnalysesFromText } from "../modules/extract_analyses_from_text";
import { getDatabaseClient } from "../prisma.client";

interface ExtractionData {
  fileName: string;
  textObjects: any[];
  matrix: any;
  analyses: any[];
  results: ComplianceResult[];
  success: boolean;
  error?: string;
}

const saveExtractionToDatabase = async (data: ExtractionData): Promise<string | null> => {
  try {
    const client = getDatabaseClient();
    const extraction = await client.pdfExtraction.create({
      data: {
        fileName: data.fileName,
        extractedData: {
          textObjects: data.textObjects,
          matrix: data.matrix,
          analyses: data.analyses,
          results: data.results,
        } as any,
        success: data.success,
        error: data.error || null,
      },
    });
    return extraction.id;
  } catch (error) {
    console.error("[Worker] Failed to save extraction to database:", error);
    return null;
  }
};

const updateExtractionInDatabase = async (
  extractionId: string,
  data: Omit<ExtractionData, "fileName">
): Promise<boolean> => {
  try {
    const client = getDatabaseClient();
    await client.pdfExtraction.update({
      where: { id: extractionId },
      data: {
        extractedData: {
          textObjects: data.textObjects,
          matrix: data.matrix,
          analyses: data.analyses,
          results: data.results,
        } as any,
        success: data.success,
        error: data.error || null,
      },
    });
    return true;
  } catch (error) {
    console.error("[Worker] Failed to update extraction in database:", error);
    return false;
  }
};

const cleanupTempFile = async (filePath: string): Promise<void> => {
  try {
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }
  } catch (error) {
    console.error("[Worker] Failed to cleanup temp file:", error);
  }
};

export class PdfProcessingWorker {
  private worker: Worker<PdfProcessingJobData, PdfProcessingJobResult>;

  constructor() {
    const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
    const connection: ConnectionOptions = {
      host: redisUrl.includes("://") ? new URL(redisUrl).hostname : "localhost",
      port: redisUrl.includes("://") ? parseInt(new URL(redisUrl).port) || 6379 : 6379,
    };
    
    this.worker = new Worker<PdfProcessingJobData, PdfProcessingJobResult>(
      "pdf-processing",
      async (job: Job<PdfProcessingJobData, PdfProcessingJobResult>) => {
        const { fileName, filePath, forceOcr, existingExtractionId } = job.data;

        console.log(`[Worker] Processing PDF: ${fileName} (Job ID: ${job.id})${forceOcr ? " [FORCE OCR]" : ""}`);

        try {
          // Update progress
          await job.updateProgress(10);

          // Extract text from PDF
          const textObjects = await extractTextFromPdf(filePath);
          await job.updateProgress(30);

          // Extract matrix and analyses (these may be replaced by OCR data)
          const matrix = await extractMatrixFromText(textObjects);
          const analyses = await extractAnalysesFromText(textObjects);
          await job.updateProgress(50);

          // Run compliance checks - this may use OCR fallback for corrupted PDFs or when forceOcr is true
          const checkResult = await checksWithOptions(textObjects, {
            fallbackToCustom: true,
            pdfPath: filePath,
            forceOcr: forceOcr ?? false,
          });
          await job.updateProgress(80);

          // Use effective data from checksWithOptions (OCR data if fallback was triggered)
          // This ensures corrupted PDF data is replaced with OCR-extracted data
          const effectiveTextObjects = checkResult.effectiveTextObjects;
          const effectiveMatrix = checkResult.effectiveMatrix ?? matrix;
          const effectiveAnalyses = checkResult.effectiveAnalyses.length > 0
            ? checkResult.effectiveAnalyses
            : analyses;

          if (checkResult.usedOcrFallback) {
            console.log(`[Worker] OCR fallback was used for ${fileName} - saving OCR-extracted data`);
          }

          // Save or update extraction in database
          let extractionId: string | null = null;
          if (existingExtractionId) {
            // Update existing extraction (reprocessing)
            const updated = await updateExtractionInDatabase(existingExtractionId, {
              textObjects: effectiveTextObjects,
              matrix: effectiveMatrix,
              analyses: effectiveAnalyses,
              results: checkResult.results,
              success: true,
            });
            if (updated) {
              extractionId = existingExtractionId;
              console.log(`[Worker] Updated existing extraction: ${existingExtractionId}`);
            }
          } else {
            // Create new extraction
            extractionId = await saveExtractionToDatabase({
              fileName,
              textObjects: effectiveTextObjects,
              matrix: effectiveMatrix,
              analyses: effectiveAnalyses,
              results: checkResult.results,
              success: true,
            });
          }
          await job.updateProgress(100);

          // Cleanup temp file
          await cleanupTempFile(filePath);

          const result: PdfProcessingJobResult = {
            fileName,
            success: true,
            ...(extractionId && { extractionId }),
            results: checkResult.results,
          };

          console.log(`[Worker] Successfully processed: ${fileName}`);
          return result;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Unknown error";

          // Save failed extraction to database
          await saveExtractionToDatabase({
            fileName,
            textObjects: [],
            matrix: null,
            analyses: [],
            results: [],
            success: false,
            error: errorMessage,
          });

          // Cleanup temp file
          await cleanupTempFile(filePath);

          console.error(`[Worker] Failed to process ${fileName}:`, errorMessage);
          throw error;
        }
      },
      {
        connection,
        concurrency: 2, // Process 2 PDFs concurrently
        limiter: {
          max: 5, // Max 5 jobs per second
          duration: 1000,
        },
      }
    );

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.worker.on("completed", (job) => {
      console.log(`[Worker] Job ${job.id} completed successfully`);
    });

    this.worker.on("failed", (job, err) => {
      console.error(`[Worker] Job ${job?.id} failed:`, err.message);
    });

    this.worker.on("error", (err) => {
      console.error("[Worker] Worker error:", err);
    });
  }

  async close(): Promise<void> {
    await this.worker.close();
  }
}

let workerInstance: PdfProcessingWorker | null = null;

export function startPdfProcessingWorker(): PdfProcessingWorker {
  if (!workerInstance) {
    workerInstance = new PdfProcessingWorker();
    console.log("[Worker] PDF processing worker started");
  }
  return workerInstance;
}

export function stopPdfProcessingWorker(): Promise<void> {
  if (workerInstance) {
    return workerInstance.close();
  }
  return Promise.resolve();
}

