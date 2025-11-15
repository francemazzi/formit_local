import type { Job, Prisma, PrismaClient } from "@prisma/client";
import { StatusJob, TypeJob } from "@prisma/client";

import { getDatabaseClient } from "./prisma.client";

export interface JobFilters {
  status?: StatusJob;
  type?: TypeJob;
  limit?: number;
}

export interface JobUpdatePayload {
  status?: StatusJob;
  error?: string | null;
  data?: Prisma.InputJsonValue;
}

const DEFAULT_JOB_LIST_LIMIT = 50;

export class JobService {
  constructor(private readonly clientFactory: () => PrismaClient) {}

  private get client(): PrismaClient {
    return this.clientFactory();
  }

  async createJob(type: TypeJob, data: Prisma.InputJsonValue): Promise<Job> {
    return this.client.job.create({
      data: {
        type,
        data,
      },
    });
  }

  async getJobById(id: string): Promise<Job | null> {
    return this.client.job.findUnique({ where: { id } });
  }

  async listJobs(filters: JobFilters = {}): Promise<Job[]> {
    const { status, type, limit = DEFAULT_JOB_LIST_LIMIT } = filters;

    return this.client.job.findMany({
      where: {
        ...(typeof status === "undefined" ? {} : { status }),
        ...(typeof type === "undefined" ? {} : { type }),
      },
      orderBy: {
        createdAt: "asc",
      },
      take: limit,
    });
  }

  async updateJob(id: string, updates: JobUpdatePayload): Promise<Job> {
    const data: Prisma.JobUpdateInput = {};

    if (typeof updates.status !== "undefined") {
      data.status = updates.status;
    }

    if (typeof updates.error !== "undefined") {
      data.error = updates.error;
    }

    if (typeof updates.data !== "undefined") {
      data.data = updates.data;
    }

    if (Object.keys(data).length === 0) {
      throw new Error("Cannot update job without any changes");
    }

    return this.client.job.update({
      where: { id },
      data,
    });
  }

  async deleteJob(id: string): Promise<Job> {
    return this.client.job.delete({ where: { id } });
  }

  async claimNextJob(type: TypeJob): Promise<Job | null> {
    return this.client.$transaction(async (tx) => {
      const pendingJob = await tx.job.findFirst({
        where: {
          type,
          status: StatusJob.PENDING,
        },
        orderBy: {
          createdAt: "asc",
        },
      });

      if (!pendingJob) {
        return null;
      }

      return tx.job.update({
        where: { id: pendingJob.id },
        data: {
          status: StatusJob.PROCESSING,
          error: null,
        },
      });
    });
  }

  async markJobProcessing(id: string): Promise<Job> {
    return this.updateJob(id, {
      status: StatusJob.PROCESSING,
      error: null,
    });
  }

  async markJobCompleted(
    id: string,
    data?: Prisma.InputJsonValue
  ): Promise<Job> {
    return this.updateJob(id, {
      status: StatusJob.COMPLETED,
      error: null,
      ...(typeof data === "undefined" ? {} : { data }),
    });
  }

  async markJobFailed(id: string, message: string): Promise<Job> {
    return this.updateJob(id, {
      status: StatusJob.FAILED,
      error: message,
    });
  }
}

export const jobService = new JobService(getDatabaseClient);
