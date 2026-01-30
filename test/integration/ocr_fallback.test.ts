import "dotenv/config";

import * as path from "node:path";
import { describe, expect, it } from "vitest";

import { checksWithOptions } from "../../src/server/modules/checks";
import { extractTextFromPdf } from "../../src/server/modules/extract_text_from_pdf";
import { isTextCorrupted } from "../../src/server/modules/ocr_pdf_with_vision";

const RICOTTA_PDF = path.resolve(
  __dirname,
  "../../data/analisi_microbiologiche/26LA000147_20260119_Ricotta _Caseificio Preziosa srl_07012026.pdf"
);

describe("OCR Fallback Integration", () => {
  it(
    "should detect corrupted text and use OCR fallback to extract all analyses including Pseudomonas",
    { timeout: 180_000 }, // 3 minutes for OCR calls
    async () => {
      if (!process.env.OPENAI_API_KEY) {
        console.log("\n⚠️  OPENAI_API_KEY not set - skipping test.\n");
        return;
      }

      console.log("\n=== OCR FALLBACK TEST ===");
      console.log(`PDF: ${RICOTTA_PDF}\n`);

      // Step 1: Extract text with standard pdfjs
      console.log("1. Standard text extraction (pdfjs)...");
      const textObjects = await extractTextFromPdf(RICOTTA_PDF);
      expect(textObjects).toBeDefined();
      expect(textObjects.length).toBeGreaterThan(0);

      const standardText = textObjects.map((t) => t.text_extracted).join("\n");
      console.log(`   Text entries: ${textObjects.length}`);
      console.log(`   Total chars: ${standardText.length}`);

      // Step 2: Verify text is corrupted
      console.log("\n2. Checking for corruption...");
      const corrupted = isTextCorrupted(standardText);
      console.log(`   Is corrupted: ${corrupted}`);
      expect(corrupted).toBe(true);

      // Step 3: Verify Pseudomonas is NOT in corrupted text
      const hasPseudomonasInCorrupted = standardText
        .toLowerCase()
        .includes("pseudomonas");
      console.log(
        `   Pseudomonas in corrupted text: ${hasPseudomonasInCorrupted}`
      );
      expect(hasPseudomonasInCorrupted).toBe(false);

      // Step 4: Run checksWithOptions with pdfPath (triggers OCR fallback)
      console.log("\n3. Running checksWithOptions with OCR fallback...");
      const checkResult = await checksWithOptions(textObjects, {
        fallbackToCustom: true,
        pdfPath: RICOTTA_PDF,
      });

      // Step 5: Verify OCR fallback was used
      console.log("\n4. Verifying OCR fallback results...");
      console.log(`   Used OCR fallback: ${checkResult.usedOcrFallback}`);
      expect(checkResult.usedOcrFallback).toBe(true);

      // Step 6: Verify effective text objects contain Pseudomonas
      const effectiveText = checkResult.effectiveTextObjects
        .map((t) => t.text_extracted)
        .join("\n");
      const hasPseudomonasInOcr = effectiveText
        .toLowerCase()
        .includes("pseudomonas");
      console.log(`   Pseudomonas in OCR text: ${hasPseudomonasInOcr}`);
      expect(hasPseudomonasInOcr).toBe(true);

      // Step 7: Verify effective analyses contain Pseudomonas
      console.log("\n5. Extracted analyses:");
      console.log(`   Total: ${checkResult.effectiveAnalyses.length}`);
      checkResult.effectiveAnalyses.forEach((a, i) => {
        console.log(`   ${i + 1}. ${a.parameter} = ${a.result} ${a.um_result}`);
      });

      const hasPseudomonasAnalysis = checkResult.effectiveAnalyses.some((a) =>
        a.parameter.toLowerCase().includes("pseudomonas")
      );
      console.log(`\n   Pseudomonas in analyses: ${hasPseudomonasAnalysis}`);
      expect(hasPseudomonasAnalysis).toBe(true);

      // Step 8: Verify we have at least 6 analyses (the expected count for this PDF)
      expect(checkResult.effectiveAnalyses.length).toBeGreaterThanOrEqual(6);

      // Step 9: Verify expected parameters are present
      const expectedParams = [
        "enterobact",
        "escherichia",
        "stafilococc",
        "pseudomonas",
        "salmonella",
        "listeria",
      ];

      expectedParams.forEach((param) => {
        const found = checkResult.effectiveAnalyses.some((a) =>
          a.parameter.toLowerCase().includes(param)
        );
        console.log(`   Contains ${param}: ${found ? "✓" : "✗"}`);
        expect(found).toBe(true);
      });

      // Step 10: Verify matrix extraction
      console.log("\n6. Matrix extraction:");
      const matrix = checkResult.effectiveMatrix;
      console.log(`   Matrix: ${matrix?.matrix}`);
      console.log(`   Product: ${matrix?.product}`);
      console.log(`   Category: ${matrix?.category}`);
      console.log(`   Sample type: ${matrix?.sampleType}`);

      expect(matrix).toBeDefined();
      expect(matrix?.category).toBe("food");
      expect(matrix?.sampleType).toBe("food_product");

      // Step 11: Verify compliance results
      console.log("\n7. Compliance results:");
      console.log(`   Total: ${checkResult.results.length}`);
      checkResult.results.forEach((r, i) => {
        console.log(
          `   ${i + 1}. ${r.name}: ${r.isCheck ? "✓ CONFORME" : "✗ NON CONFORME"}`
        );
      });

      console.log("\n=== TEST PASSED ===\n");
    }
  );

  it(
    "should use forceOcr option to always trigger OCR",
    { timeout: 180_000 },
    async () => {
      if (!process.env.OPENAI_API_KEY) {
        console.log("\n⚠️  OPENAI_API_KEY not set - skipping test.\n");
        return;
      }

      console.log("\n=== FORCE OCR TEST ===");

      const textObjects = await extractTextFromPdf(RICOTTA_PDF);

      // Even without corruption check, forceOcr should trigger OCR
      const checkResult = await checksWithOptions(textObjects, {
        fallbackToCustom: true,
        pdfPath: RICOTTA_PDF,
        forceOcr: true,
      });

      console.log(`   Used OCR fallback: ${checkResult.usedOcrFallback}`);
      expect(checkResult.usedOcrFallback).toBe(true);

      const hasPseudomonas = checkResult.effectiveAnalyses.some((a) =>
        a.parameter.toLowerCase().includes("pseudomonas")
      );
      console.log(`   Pseudomonas extracted: ${hasPseudomonas}`);
      expect(hasPseudomonas).toBe(true);

      console.log("\n=== TEST PASSED ===\n");
    }
  );
});
