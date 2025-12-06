import { describe, expect, it } from "vitest";

import { ceirsaCheck } from "../../src/server/modules/checks/ceirsa.check";
import { MatrixExtractionResult } from "../../src/server/modules/extract_matrix_from_text";

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
    const result = await ceirsaCheck(buildMatrixResult({ ceirsa_category: null }));
    expect(result).toBeNull();
  });

  it("returns null when the CEIRSA category cannot be found", async () => {
    const result = await ceirsaCheck(
      buildMatrixResult({ ceirsa_category: "non-existing-category" })
    );
    expect(result).toBeNull();
  });
});

