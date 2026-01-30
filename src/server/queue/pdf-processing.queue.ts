import { Queue, Job, ConnectionOptions } from "bullmq";
import { getRedisClient } from "../redis.client";

export interface PdfProcessingJobData {
  fileId: string;
  fileName: string;
  filePath: string;
  /** If true, force OCR extraction even if text appears valid */
  forceOcr?: boolean;
  /** ID of existing extraction to update (for reprocessing) */
  existingExtractionId?: string;
}

export interface PdfProcessingJobResult {
  fileName: string;
  success: boolean;
  extractionId?: string;
  results?: any[];
  error?: string;
}

export class PdfProcessingQueue {
  private queue: Queue<PdfProcessingJobData, PdfProcessingJobResult>;

  constructor() {
    const redis = getRedisClient();
    const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
    const connection: ConnectionOptions = {
      host: redisUrl.includes("://") ? new URL(redisUrl).hostname : "localhost",
      port: redisUrl.includes("://") ? parseInt(new URL(redisUrl).port) || 6379 : 6379,
    };
    
    this.queue = new Queue<PdfProcessingJobData, PdfProcessingJobResult>(
      "pdf-processing",
      {
        connection,
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 2000,
          },
          removeOnComplete: {
            age: 24 * 3600, // Keep completed jobs for 24 hours
            count: 1000, // Keep max 1000 completed jobs
          },
          removeOnFail: {
            age: 7 * 24 * 3600, // Keep failed jobs for 7 days
          },
        },
      }
    );
  }

  async addJob(
    data: PdfProcessingJobData,
    options?: { priority?: number; delay?: number }
  ): Promise<Job<PdfProcessingJobData, PdfProcessingJobResult>> {
    return this.queue.add("process-pdf", data, {
      priority: options?.priority || 0,
      delay: options?.delay || 0,
    });
  }

  async getJob(jobId: string): Promise<Job<PdfProcessingJobData, PdfProcessingJobResult> | undefined> {
    return this.queue.getJob(jobId);
  }

  async getJobState(jobId: string): Promise<{
    id: string;
    state: string;
    progress?: number;
    result?: PdfProcessingJobResult;
    error?: string;
  } | null> {
    const job = await this.getJob(jobId);
    if (!job) {
      return null;
    }

    const state = await job.getState();
    const progress = job.progress as number | undefined;
    const result = job.returnvalue;
    const failedReason = job.failedReason;

    return {
      id: job.id!,
      state,
      ...(progress !== undefined && { progress }),
      ...(result && { result }),
      ...(failedReason && { error: failedReason }),
    };
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}

export const pdfProcessingQueue = new PdfProcessingQueue();

