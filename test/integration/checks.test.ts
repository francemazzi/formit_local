import "dotenv/config";

import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

import { checks } from "../../src/server/modules/checks";
import { extractTextFromPdf } from "../../src/server/modules/extract_text_from_pdf";

const ANALISI_DIR = path.resolve(
  __dirname,
  "../../data/analisi_microbiologiche"
);

const getPdfFiles = (): string[] => {
  if (!fs.existsSync(ANALISI_DIR)) {
    return [];
  }

  return fs
    .readdirSync(ANALISI_DIR)
    .filter((file) => file.toLowerCase().endsWith(".pdf"))
    .sort();
};

describe("Checks integration", () => {
  const filesToCheck = getPdfFiles();

  if (filesToCheck.length === 0) {
    it.skip("no PDF files found in data directory", () => {});
    return;
  }

  filesToCheck.forEach((fileName) => {
    it(
      `should process ${fileName} and return compliance results`,
      { timeout: 360_000 }, // 6 minuti per chiamate LLM
      async () => {
        if (!process.env.OPENAI_API_KEY) {
          console.log(
            "\n⚠️  OPENAI_API_KEY non impostata - il test verrà saltato."
          );
          console.log(
            "   Imposta OPENAI_API_KEY per eseguire il test completo.\n"
          );
          return;
        }

        const pdfPath = path.join(ANALISI_DIR, fileName);

        console.log(`\n=== Processing: ${fileName} ===`);
        console.log(`Path: ${pdfPath}\n`);

        // Estrai testo dal PDF
        console.log("1. Extracting text from PDF...");
        const textObjects = await extractTextFromPdf(pdfPath);

        expect(textObjects).toBeDefined();
        expect(Array.isArray(textObjects)).toBe(true);
        expect(textObjects.length).toBeGreaterThan(0);

        console.log(`   ✓ Extracted ${textObjects.length} text entries`);

        // Verifica che ci sia contenuto testuale
        const totalTextLength = textObjects.reduce(
          (sum, entry) => sum + (entry.text_extracted?.length ?? 0),
          0
        );
        expect(totalTextLength).toBeGreaterThan(0);
        console.log(`   ✓ Total text length: ${totalTextLength} characters`);

        // Esegui i checks
        console.log("\n2. Running compliance checks...");
        const results = await checks(textObjects);

        console.log(`   ✓ Checks completed`);
        console.log(`   ✓ Results count: ${results.length}\n`);

        // Verifica struttura dei risultati
        expect(results).toBeDefined();
        expect(Array.isArray(results)).toBe(true);

        // Verifica struttura di ogni risultato (se presenti)
        results.forEach((result) => {
          // Verifica struttura base del risultato
          expect(result).toHaveProperty("name");
          expect(result).toHaveProperty("value");
          expect(result).toHaveProperty("isCheck");
          expect(result).toHaveProperty("description");
          expect(result).toHaveProperty("sources");

          // Verifica tipi
          expect(typeof result.name).toBe("string");
          expect(typeof result.value).toBe("string");
          expect(typeof result.isCheck).toBe("boolean");
          expect(typeof result.description).toBe("string");
          expect(Array.isArray(result.sources)).toBe(true);

          // Verifica struttura delle sources
          result.sources.forEach((source) => {
            expect(source).toHaveProperty("id");
            expect(source).toHaveProperty("title");
            expect(source).toHaveProperty("url");
            expect(source).toHaveProperty("excerpt");

            expect(typeof source.id).toBe("string");
            expect(source.id.length).toBeGreaterThan(0);
            expect(typeof source.title).toBe("string");
            expect(source.title.length).toBeGreaterThan(0);
            expect(source.url === null || typeof source.url === "string").toBe(
              true
            );
            expect(typeof source.excerpt).toBe("string");
          });
        });

        // Log risultati se presenti
        if (results.length > 0) {
          console.log("=== COMPLIANCE RESULTS ===");
          results.forEach((result, index) => {
            console.log(`\n--- Result ${index + 1} ---`);
            console.log(`Name: ${result.name}`);
            console.log(`Value: ${result.value}`);
            console.log(
              `Is Check: ${result.isCheck ? "✓ CONFORME" : "✗ NON CONFORME"}`
            );
            console.log(
              `Description: ${result.description.substring(0, 200)}${
                result.description.length > 200 ? "..." : ""
              }`
            );
            console.log(`Sources: ${result.sources.length}`);

            result.sources.forEach((source, sourceIndex) => {
              console.log(`  Source ${sourceIndex + 1}:`);
              console.log(`    ID: ${source.id}`);
              console.log(`    Title: ${source.title}`);
              console.log(`    URL: ${source.url || "N/A"}`);
              console.log(
                `    Excerpt: ${source.excerpt.substring(0, 100)}${
                  source.excerpt.length > 100 ? "..." : ""
                }`
              );
            });
          });
        } else {
          console.log("⚠️  No compliance results found");
          console.log(
            "   This might be expected if the document doesn't match CEIRSA or beverage categories"
          );
        }

        console.log("\n=== Test completed successfully ===\n");
      }
    );
  });
});
