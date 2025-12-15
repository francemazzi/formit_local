import "dotenv/config";
import { describe, expect, it, vi } from "vitest";

import {
  ceirsaCheck,
  ceirsaComplianceCheck,
} from "../../src/server/modules/checks/ceirsa.check";
import { MatrixExtractionResult } from "../../src/server/modules/extract_matrix_from_text";
import { Analyses } from "../../src/server/modules/extract_analyses_from_text";

const buildMatrixResult = (
  overrides: Partial<MatrixExtractionResult> = {}
): MatrixExtractionResult => ({
  matrix: "Sample matrix",
  description: null,
  product: null,
  category: "food",
  ceirsa_category: null,
  specialFeatures: [],
  ...overrides,
});

describe("CEIRSA check", () => {
  it("returns the CEIRSA category data when the matrix provides one", async () => {
    const result = await ceirsaCheck(
      buildMatrixResult({ ceirsa_category: "Pane grattugiato" })
    );

    expect(result).not.toBeNull();
    expect(result?.name).toBe("Pane grattugiato");
    expect(Array.isArray(result?.data)).toBe(true);
    expect(result?.data.length).toBeGreaterThan(0);
  });

  it("returns null when the matrix does not include a CEIRSA category", async () => {
    const result = await ceirsaCheck(
      buildMatrixResult({ ceirsa_category: null })
    );
    expect(result).toBeNull();
  });

  it("returns null when the CEIRSA category cannot be found", async () => {
    const result = await ceirsaCheck(
      buildMatrixResult({ ceirsa_category: "non-existing-category" })
    );
    expect(result).toBeNull();
  });

  it("verifies parameter matching between analyses and CEIRSA data", async () => {
    const category = await ceirsaCheck(
      buildMatrixResult({ ceirsa_category: "Pane grattugiato" })
    );

    if (!category) {
      throw new Error("Category not found for testing");
    }

    const analyses: Analyses[] = [
      {
        parameter: "Bacillus cereus presunto",
        result: "50",
        um_result: "UFC/g",
        method: "ISO 7932",
      },
      {
        parameter: "Lieviti",
        result: "< 100",
        um_result: "UFC/g",
        method: "NFV08-059",
      },
      {
        parameter: "Muffe",
        result: "25",
        um_result: "UFC/g",
        method: "NFV08-059",
      },
    ];

    console.log("\n=== VERIFICA MATCHING PARAMETRI ===");
    console.log(`Categoria: ${category.name} (ID: ${category.id})`);
    console.log(`Parametri CEIRSA disponibili: ${category.data.length}`);
    console.log(`Analisi da verificare: ${analyses.length}\n`);

    analyses.forEach((analysis) => {
      const matching = category.data.find(
        (param: any) => param.parameter === analysis.parameter
      );
      if (matching) {
        console.log(`✓ ${analysis.parameter} - TROVATO`);
        console.log(
          `  Limite soddisfacente: ${matching.satisfactoryValue || "N/A"}`
        );
        console.log(
          `  Limite accettabile: ${matching.acceptableValue || "N/A"}`
        );
        console.log(
          `  Limite insoddisfacente: ${matching.unsatisfactoryValue || "N/A"}`
        );
      } else {
        console.log(`✗ ${analysis.parameter} - NON TROVATO`);
      }
    });

    // Verifica che almeno un parametro corrisponda
    const matchedCount = analyses.filter((analysis) =>
      category.data.some((param: any) => param.parameter === analysis.parameter)
    ).length;

    expect(matchedCount).toBeGreaterThan(0);
  });

  it(
    "performs compliance check with CEIRSA data and analyses",
    { timeout: 180_000 }, // fino a 3 minuti per chiamate LLM reali
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

      // Prima ottieni una categoria CEIRSA reale
      const category = await ceirsaCheck(
        buildMatrixResult({ ceirsa_category: "Pane grattugiato" })
      );

      if (!category) {
        throw new Error("Category not found for testing");
      }

      console.log(`\nCategoria trovata: ${category.name} (ID: ${category.id})`);
      console.log(
        `Parametri disponibili nella categoria: ${category.data.length}`
      );
      category.data.forEach((param: any, idx: number) => {
        console.log(`  ${idx + 1}. ${param.parameter}`);
      });

      // Crea analisi di test che corrispondono ai parametri CEIRSA per "Pane grattugiato"
      // I parametri disponibili sono: "Bacillus cereus presunto", "Lieviti", "Muffe"
      const analyses: Analyses[] = [
        {
          parameter: "Bacillus cereus presunto",
          result: "50",
          um_result: "UFC/g",
          method: "ISO 7932",
        },
        {
          parameter: "Lieviti",
          result: "< 100",
          um_result: "UFC/g",
          method: "NFV08-059",
        },
        {
          parameter: "Muffe",
          result: "25",
          um_result: "UFC/g",
          method: "NFV08-059",
        },
      ];

      const markdownContent = `
# Rapporto di Analisi Microbiologica

## Campione: Pane grattugiato
## Data: 2025-01-15

### Risultati Analisi:
- Bacillus cereus presunto: 50 UFC/g (Metodo: ISO 7932)
- Lieviti: < 100 UFC/g (Metodo: NFV08-059)
- Muffe: 25 UFC/g (Metodo: NFV08-059)
`;

      console.log("\nAnalisi da verificare:");
      analyses.forEach((analysis, idx) => {
        console.log(
          `  ${idx + 1}. ${analysis.parameter} = ${analysis.result} ${
            analysis.um_result
          }`
        );
      });

      const results = await ceirsaComplianceCheck(
        category,
        analyses,
        markdownContent
      );

      console.log("\n=== RISULTATI CEIRSA COMPLIANCE CHECK ===");
      console.log(`Numero di risultati: ${results.length}`);
      console.log("\n");

      results.forEach((result, index) => {
        console.log(`--- Risultato ${index + 1} ---`);
        console.log(`Nome: ${result.name}`);
        console.log(`Valore limite: ${result.value}`);
        console.log(`Conforme: ${result.isCheck ? "SÌ" : "NO"}`);
        console.log(`Descrizione: ${result.description}`);
        console.log(`Fonti: ${result.sources.length}`);
        result.sources.forEach((source, sourceIndex) => {
          console.log(`  Fonte ${sourceIndex + 1}:`);
          console.log(`    ID: ${source.id}`);
          console.log(`    Titolo: ${source.title}`);
          console.log(`    URL: ${source.url || "N/A"}`);
          console.log(`    Estratto: ${source.excerpt.substring(0, 100)}...`);
        });
        console.log("\n");
      });

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);

      // Verifica che ci siano risultati se ci sono parametri corrispondenti
      if (results.length > 0) {
        results.forEach((result) => {
          expect(result).toHaveProperty("name");
          expect(result).toHaveProperty("value");
          expect(result).toHaveProperty("isCheck");
          expect(typeof result.isCheck).toBe("boolean");
          expect(result).toHaveProperty("description");
          expect(result).toHaveProperty("sources");
          expect(Array.isArray(result.sources)).toBe(true);
        });
      }
    }
  );
});
