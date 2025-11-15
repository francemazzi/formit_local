import * as path from "node:path";

import { StatusJob, TypeJob } from "@prisma/client";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import {
  getDatabaseClient,
  initializeDatabase,
  shutdownDatabase,
} from "../../src/server/prisma.client";
import {
  extractTextFromExistingJob,
  type ExtractedTextEntry,
} from "../../src/server/modules/extract_text_from_pdf";
import { jobService } from "../../src/server/job.service";

describe("PDF text extraction", () => {
  const samplePdf = path.resolve(
    __dirname,
    "../../data/analisi_microbiologiche/25LA27791.pdf"
  );

  beforeAll(async () => {
    await initializeDatabase();
  });

  beforeEach(async () => {
    const client = getDatabaseClient();
    await client.job.deleteMany();
  });

  afterEach(async () => {
    const client = getDatabaseClient();
    await client.job.deleteMany();
  });

  afterAll(async () => {
    await shutdownDatabase();
  });

  it("should keep a job pending until processed", async () => {
    const payload = { resourcePath: samplePdf };
    const pendingJob = await jobService.createJob(
      TypeJob.EXTRACT_TEXT_FROM_PDF,
      payload
    );

    expect(pendingJob.status).toBe(StatusJob.PENDING);
    expect(pendingJob.data).toStrictEqual(payload);

    const client = getDatabaseClient();
    const storedJob = await client.job.findUnique({
      where: { id: pendingJob.id },
    });
    expect(storedJob?.status).toBe(StatusJob.PENDING);
  });

  it("should process a pending job and store the extraction result", async () => {
    const payload = { resourcePath: samplePdf };
    const pendingJob = await jobService.createJob(
      TypeJob.EXTRACT_TEXT_FROM_PDF,
      payload
    );

    expect(pendingJob.status).toBe(StatusJob.PENDING);

    const entries = await extractTextFromExistingJob(pendingJob.id);

    expect(entries.length).toBe(2);

    const firstEntry = entries.at(0);
    expect(firstEntry).toBeDefined();
    expect(firstEntry?.resource).toBe(path.basename(samplePdf));
    expect(firstEntry?.word_number).toBeGreaterThan(0);
    expect(firstEntry?.letter_number).toBeGreaterThan(0);
    expect(firstEntry?.text_extracted.length).toBeGreaterThan(0);
    expect(firstEntry?.text_extracted).toMatch(/Rapporto/iu);

    const secondEntry = entries.at(1);
    expect(secondEntry).toBeDefined();
    expect(secondEntry?.resource).toBe(path.basename(samplePdf));
    expect(secondEntry?.text_extracted.length).toBeGreaterThan(0);
    expect(secondEntry?.text_extracted).toMatch(/Responsabile/iu);

    const client = getDatabaseClient();
    const processedJob = await client.job.findUnique({
      where: { id: pendingJob.id },
    });

    expect(processedJob).toBeDefined();
    expect(processedJob?.status).toBe(StatusJob.COMPLETED);

    const jobData =
      processedJob?.data &&
      typeof processedJob.data === "object" &&
      !Array.isArray(processedJob.data)
        ? (processedJob.data as Record<string, unknown>)
        : null;

    expect(jobData).not.toBeNull();
    expect(jobData?.resource).toBe(path.basename(samplePdf));
    expect(jobData?.totalPages).toBe(entries.length);

    const totalWords = entries.reduce(
      (sum, entry) => sum + (entry.word_number ?? 0),
      0
    );
    expect(jobData?.totalWords).toBe(totalWords);
    expect(Array.isArray(jobData?.entries)).toBe(true);
    expect((jobData?.entries as unknown[]).length).toBe(entries.length);
    expect(
      (jobData?.entries as ExtractedTextEntry[]).at(0)?.text_extracted
    ).toBe(entries.at(0)?.text_extracted);
  });

  it("should mark the job as failed for missing resources", async () => {
    const nonExistingPdf = path.resolve(
      __dirname,
      "../../data/analisi_microbiologiche/missing.pdf"
    );

    const pendingJob = await jobService.createJob(
      TypeJob.EXTRACT_TEXT_FROM_PDF,
      { resourcePath: nonExistingPdf }
    );

    await expect(extractTextFromExistingJob(pendingJob.id)).rejects.toThrow(
      /was not found/iu
    );

    const client = getDatabaseClient();
    const failedJob = await client.job.findUnique({
      where: { id: pendingJob.id },
    });

    expect(failedJob).toBeDefined();
    expect(failedJob?.status).toBe(StatusJob.FAILED);
    expect(failedJob?.error).toMatch(/was not found/iu);
  });
});
