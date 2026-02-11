import "dotenv/config";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  getDatabaseClient,
  initializeDatabase,
  shutdownDatabase,
} from "../../src/server/prisma.client";
import { ocrPdfWithVision } from "../../src/server/modules/ocr_pdf_with_vision";
import { getVisionProvider } from "../../src/server/utils/llm-factory";

/**
 * Integration tests for Claude Vision OCR
 * These tests verify that Claude can correctly extract data from PDF images.
 *
 * Run with: npx vitest run test/integration/claude-ocr.integration.test.ts
 */
describe("Claude OCR Integration", () => {
  const claudeApiKey = process.env.CLAUDE_API_KEY;

  // Test PDF with known content
  const testPdf = path.resolve(
    __dirname,
    "../../data/analisi_microbiologiche/25LA27791.pdf"
  );

  beforeAll(async () => {
    await initializeDatabase();

    // Configure Claude as active provider for these tests
    if (claudeApiKey) {
      const prisma = getDatabaseClient();
      await prisma.apiKey.upsert({
        where: { id: "singleton" },
        update: {
          claudeApiKey: claudeApiKey,
          activeProvider: "ANTHROPIC_CLAUDE",
        },
        create: {
          id: "singleton",
          claudeApiKey: claudeApiKey,
          activeProvider: "ANTHROPIC_CLAUDE",
        },
      });
    }
  });

  afterAll(async () => {
    await shutdownDatabase();
  });

  it("should have CLAUDE_API_KEY environment variable set", () => {
    expect(claudeApiKey).toBeDefined();
    expect(claudeApiKey?.length).toBeGreaterThan(0);
    console.log(`✓ CLAUDE_API_KEY is set (length: ${claudeApiKey?.length})`);
  });

  it("should be configured to use Anthropic provider for vision", async () => {
    if (!claudeApiKey) {
      console.log("⚠ Skipping test: CLAUDE_API_KEY not set");
      return;
    }

    const { provider, config } = await getVisionProvider();

    expect(provider).toBe("anthropic");
    expect(config).toHaveProperty("apiKey");
    expect(config).toHaveProperty("model");

    console.log(`✓ Vision provider: ${provider}`);
    console.log(`✓ Model: ${(config as { model: string }).model}`);
  });

  it(
    "should extract text from PDF using Claude Vision",
    { timeout: 120_000 }, // 2 minutes for OCR
    async () => {
      if (!claudeApiKey) {
        console.log("⚠ Skipping test: CLAUDE_API_KEY not set");
        return;
      }

      console.log(`\n📄 Testing OCR on: ${path.basename(testPdf)}`);

      const results = await ocrPdfWithVision(testPdf);

      expect(results).toBeDefined();
      expect(results.length).toBeGreaterThan(0);

      console.log(`✓ Extracted ${results.length} page(s)`);

      // Check first page has content
      const firstPage = results[0];
      expect(firstPage).toBeDefined();
      expect(firstPage?.text.length).toBeGreaterThan(100);

      console.log(`✓ Page 1: ${firstPage?.text.length} chars extracted`);

      // Print a snippet of extracted text
      const snippet = firstPage?.text.substring(0, 500);
      console.log(`\n--- Text snippet (first 500 chars) ---\n${snippet}\n---`);
    }
  );

  it(
    "should extract key laboratory report fields",
    { timeout: 120_000 },
    async () => {
      if (!claudeApiKey) {
        console.log("⚠ Skipping test: CLAUDE_API_KEY not set");
        return;
      }

      const results = await ocrPdfWithVision(testPdf);
      const fullText = results.map((r) => r.text).join("\n");
      const textLower = fullText.toLowerCase();

      console.log(`\n🔍 Checking for expected laboratory report fields...`);

      // Expected fields in a lab report
      const expectedTerms = [
        { term: "rapporto", label: "Report header" },
        { term: "campione", label: "Sample reference" },
        { term: "risultat", label: "Results section" },
        { term: "metodo", label: "Method reference" },
      ];

      for (const { term, label } of expectedTerms) {
        const found = textLower.includes(term);
        console.log(`  ${found ? "✓" : "✗"} ${label}: "${term}"`);
        expect(found).toBe(true);
      }

      console.log(`\n✓ All expected fields found in extracted text`);
    }
  );

  it(
    "should extract allergen test data from report",
    { timeout: 120_000 },
    async () => {
      if (!claudeApiKey) {
        console.log("⚠ Skipping test: CLAUDE_API_KEY not set");
        return;
      }

      const results = await ocrPdfWithVision(testPdf);
      const fullText = results.map((r) => r.text).join("\n");
      const textLower = fullText.toLowerCase();

      console.log(`\n🥜 Checking for allergen test report data...`);

      // This PDF is an allergen test (PCR) for surfaces
      const expectedTerms = [
        { term: "tampone", label: "Swab type" },
        { term: "allergene", label: "Allergen test" },
        { term: "pcr", label: "PCR method" },
        { term: "rilevato", label: "Detection result" },
      ];

      let foundCount = 0;
      for (const { term, label } of expectedTerms) {
        const found = textLower.includes(term);
        if (found) {
          foundCount++;
          console.log(`  ✓ Found ${label}: "${term}"`);
        } else {
          console.log(`  ✗ Missing ${label}: "${term}"`);
        }
      }

      console.log(`\n✓ Found ${foundCount}/${expectedTerms.length} expected terms`);

      // We expect at least 3 of the expected terms to be found
      expect(foundCount).toBeGreaterThanOrEqual(3);
    }
  );
});
