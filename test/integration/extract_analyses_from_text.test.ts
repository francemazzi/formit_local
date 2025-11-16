import "dotenv/config";

import * as path from "node:path";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { StatusJob } from "@prisma/client";

import { extractAnalysesFromText } from "../../src/server/modules/extract_analyses_from_text";
import {
  extractTextFromPdf,
  type ExtractedTextEntry,
} from "../../src/server/modules/extract_text_from_pdf";
import {
  getDatabaseClient,
  initializeDatabase,
  shutdownDatabase,
} from "../../src/server/prisma.client";

type IsolatedDatabase = {
  databaseUrl: string;
  cleanup: () => void;
};

const createIsolatedDatabase = (): IsolatedDatabase => {
  const tempDir = mkdtempSync(
    path.join(tmpdir(), "formit-analyses-integration-")
  );
  const tempDbPath = path.join(tempDir, "dev.db");
  const sourceDbPath = path.resolve(__dirname, "../../prisma/dev.db");
  cpSync(sourceDbPath, tempDbPath);

  return {
    databaseUrl: `file:${tempDbPath}`,
    cleanup: () => {
      rmSync(tempDir, { recursive: true, force: true });
    },
  };
};

const previousDatabaseUrl = process.env.DATABASE_URL;
const isolatedDatabase = createIsolatedDatabase();
process.env.DATABASE_URL = isolatedDatabase.databaseUrl;

const ensureOpenAiKey = (): void => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error(
      "OPENAI_API_KEY must be defined to run this integration test"
    );
  }
};

const assertAnalyses = (
  analyses: Awaited<ReturnType<typeof extractAnalysesFromText>>
): void => {
  expect(Array.isArray(analyses)).toBe(true);
  expect(analyses.length).toBeGreaterThan(1);
  analyses.forEach((item) => {
    expect(item.parameter.length).toBeGreaterThan(0);
    expect(item.result.length).toBeGreaterThan(0);
    expect(item.um_result.length).toBeGreaterThan(0);
  });
};

describe("Analyses extraction", () => {
  const samplePdfs = [
    path.resolve(
      __dirname,
      "../../data/analisi_microbiologiche/25LA38227_20250626_Bricco graduato _Selosseria srl Gelateria Cherubino _19062025.pdf"
    ),
    path.resolve(
      __dirname,
      "../../data/analisi_microbiologiche/25LA39496_20250701_Coltello_Bar Savoy di Baccanelli Riccardo _24062025.pdf"
    ),
  ];

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
    isolatedDatabase.cleanup();
    process.env.DATABASE_URL = previousDatabaseUrl;
  });

  it("should extract analyses from multiple real PDF flows", async () => {
    ensureOpenAiKey();

    const combinedEntries: ExtractedTextEntry[] = [];
    for (const pdfPath of samplePdfs) {
      const extractedEntries = await extractTextFromPdf(pdfPath);
      expect(extractedEntries.length).toBeGreaterThan(0);
      combinedEntries.push(...extractedEntries);
    }

    const analyses = await extractAnalysesFromText(combinedEntries);
    console.log("Analyses extraction result:", analyses);
    assertAnalyses(analyses);

    const client = getDatabaseClient();
    const storedJobs = await client.job.findMany();
    expect(storedJobs.length).toBe(samplePdfs.length);
    storedJobs.forEach((job) => {
      expect(job.status).toBe(StatusJob.COMPLETED);
    });
  }, 60000);
});
