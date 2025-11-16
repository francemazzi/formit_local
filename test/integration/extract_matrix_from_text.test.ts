import "dotenv/config";

import * as fs from "node:fs";
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

import {
  extractMatrixFromText,
  type MatrixExtractionResult,
} from "../../src/server/modules/extract_matrix_from_text";
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
    path.join(tmpdir(), "formit-matrix-integration-")
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

type GroundTruthRecord = {
  path: string;
  matrix: string;
};

const loadGroundTruth = (): GroundTruthRecord[] => {
  const datasetPath = path.resolve(
    __dirname,
    "../../dataset/ground_truth/analisi_microbiologiche.json"
  );

  const rawContent = fs.readFileSync(datasetPath, "utf8");
  const parsedContent = JSON.parse(rawContent);

  if (!Array.isArray(parsedContent)) {
    throw new Error("Ground truth dataset must be an array");
  }

  return parsedContent.map((entry, index) => {
    if (!entry || typeof entry !== "object") {
      throw new Error(`Invalid entry at index ${index}`);
    }

    const typedEntry = entry as { path?: unknown; matrix?: unknown };
    if (typeof typedEntry.path !== "string" || typedEntry.path.length === 0) {
      throw new Error(`Missing path for entry at index ${index}`);
    }
    if (
      typeof typedEntry.matrix !== "string" ||
      typedEntry.matrix.length === 0
    ) {
      throw new Error(`Missing matrix for entry at index ${index}`);
    }

    return {
      path: typedEntry.path,
      matrix: typedEntry.matrix,
    };
  });
};

const ensureOpenAiKey = (): void => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error(
      "OPENAI_API_KEY must be defined to run the matrix extraction test"
    );
  }
};

const convertToTextEntries = async (
  pdfRelativePath: string
): Promise<ExtractedTextEntry[]> => {
  const pdfAbsolutePath = path.resolve(__dirname, "../../", pdfRelativePath);
  const extractedEntries = await extractTextFromPdf(pdfAbsolutePath);
  expect(extractedEntries.length).toBeGreaterThan(0);
  return extractedEntries;
};

describe("Matrix extraction", () => {
  const groundTruthRecords = loadGroundTruth();

  beforeAll(async () => {
    ensureOpenAiKey();
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

  it("should reach at least 50% accuracy compared to ground truth", async () => {
    let processedCount = 0;
    let matchedCount = 0;

    for (const record of groundTruthRecords) {
      const textEntries = await convertToTextEntries(record.path);
      const matrixResult: MatrixExtractionResult = await extractMatrixFromText(
        textEntries
      );

      expect(matrixResult.matrix).toBeTruthy();

      processedCount += 1;
      if (matrixResult.matrix === record.matrix) {
        matchedCount += 1;
      }
    }

    expect(processedCount).toBeGreaterThan(0);

    const accuracy = matchedCount / processedCount;
    expect(accuracy).toBeGreaterThan(0.5);
  }, 180_000);
});
