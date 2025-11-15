import "dotenv/config";

import { describe, expect, it } from "vitest";

import { extractAnalysesFromText } from "../../src/server/modules/extract_analyses_from_text";
import type { ExtractedTextEntry } from "../../src/server/modules/extract_text_from_pdf";

class ExtractedTextFixture {
  createSampleEntries(): ExtractedTextEntry[] {
    return [
      {
        resource: "sample-report.pdf",
        word_number: 120,
        letter_number: 1,
        text_extracted: [
          "# Rapporto microbiologico",
          "",
          "| Parametro | Risultato | U.M. | Metodo |",
          "| --- | --- | --- | --- |",
          "| Conta Escherichia coli | 12 | UFC/g | UNI EN ISO 16649-2 |",
          "| Listeria monocytogenes | Assente in 25 g | Presenza/25 g | UNI EN ISO 11290-1 |",
          "| Conta batterica totale | 4.5 x 10^2 | UFC/cm2 | UNI EN ISO 4833-2 |",
          "",
          "Metodo supplementare:",
          "- Staphylococcus aureus: < 5 UFC/g (UNI EN ISO 6888-1)",
        ].join("\n"),
      },
    ];
  }
}

class AnalysesResultAsserter {
  assertValidResponse(
    entries: Awaited<ReturnType<typeof extractAnalysesFromText>>
  ): void {
    expect(Array.isArray(entries)).toBe(true);
    expect(entries.length).toBeGreaterThan(1);
    entries.forEach((entry) => {
      expect(entry.parameter.length).toBeGreaterThan(0);
      expect(entry.result.length).toBeGreaterThan(0);
      expect(entry.um_result.length).toBeGreaterThan(0);
    });
  }
}

describe("Analyses extraction", () => {
  const fixture = new ExtractedTextFixture();
  const asserter = new AnalysesResultAsserter();

  it("should extract multiple analyses records from markdown content", async () => {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error(
        "OPENAI_API_KEY must be defined to run this integration test"
      );
    }

    const entries = fixture.createSampleEntries();
    const analyses = await extractAnalysesFromText(entries);
    asserter.assertValidResponse(analyses);
  }, 20000);
});
