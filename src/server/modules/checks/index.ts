import { MatrixExtractionResult } from "../extract_matrix_from_text";
import { ExtractedTextEntry } from "../extract_text_from_pdf";
import {
  Analyses,
  extractAnalysesFromText,
} from "../extract_analyses_from_text";
import { ceirsaCheck, ceirsaComplianceCheck } from "./ceirsa.check";
import { beverageCheck, BeverageCheckInput } from "./beverage.check";

export interface Source {
  id: string;
  title: string;
  url: string | null;
  excerpt: string;
}

export interface ComplianceResult {
  name: string;
  value: string;
  isCheck: boolean;
  description: string;
  sources: Source[];
}

const composeMarkdownPayload = (textObjects: ExtractedTextEntry[]): string => {
  return textObjects
    .slice()
    .sort((left, right) => left.letter_number - right.letter_number)
    .map((entry) => entry.text_extracted?.trim())
    .filter((value): value is string => Boolean(value))
    .join("\n\n")
    .trim();
};

export const checks = async (
  matrix: MatrixExtractionResult,
  textObjects: ExtractedTextEntry[]
): Promise<ComplianceResult[]> => {
  const markdownContent = composeMarkdownPayload(textObjects);

  if (!markdownContent) {
    return [];
  }

  // Prima verifica se rientra in una categoria CEIRSA
  const ceirsaCategory = await ceirsaCheck(matrix);

  if (ceirsaCategory) {
    // Se è categorizzata CEIRSA, usa ceirsaComplianceCheck
    const analyses = await extractAnalysesFromText(textObjects);
    return await ceirsaComplianceCheck(
      ceirsaCategory,
      analyses,
      markdownContent
    );
  }

  // Se non rientra in nessuna categoria CEIRSA e la categoria è "beverage", usa beverageCheck
  if (matrix.category === "beverage") {
    const analyses = await extractAnalysesFromText(textObjects);
    const results: ComplianceResult[] = [];

    for (const analysis of analyses) {
      const beverageInput: BeverageCheckInput = {
        parameter: analysis.parameter,
        value: analysis.result,
        unit: analysis.um_result || null,
        beverageType: matrix.product || matrix.matrix || "bevanda",
        markdownContent,
      };

      const complianceResults = await beverageCheck(beverageInput);
      results.push(...complianceResults);
    }

    return results;
  }

  // Se non è né CEIRSA né beverage, restituisci array vuoto
  return [];
};
