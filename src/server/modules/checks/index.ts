import { ChatOpenAI } from "@langchain/openai";
import { ExtractedTextEntry } from "../extract_text_from_pdf";
import { extractAnalysesFromText } from "../extract_analyses_from_text";
import {
  extractMatrixFromText,
  MatrixExtractionResult,
  SampleType,
} from "../extract_matrix_from_text";
import { getCeirsaCategories, CeirsaCategory } from "../ceirsa_categorizer";
import { ceirsaCheck, ceirsaComplianceCheck } from "./ceirsa.check";
import { beverageCheck, BeverageCheckInput } from "./beverage.check";

export interface Source {
  id: string;
  title: string;
  url: string | null;
  excerpt: string;
}

export interface ComplianceResultMatrix {
  matrix: string;
  description: string | null;
  product: string | null;
  category: "food" | "beverage" | "other";
  ceirsaCategory: string | null;
  /**
   * Type of sample: environmental_swab for surfaces (UFC/cm²), food_product for food (UFC/g), etc.
   * CRITICAL: environmental_swab samples cannot use CEIRSA food limits.
   */
  sampleType: SampleType;
}

/**
 * Raw compliance result without matrix information.
 * Used internally by check modules before matrix enrichment.
 */
export interface RawComplianceResult {
  name: string;
  value: string;
  isCheck: boolean;
  description: string;
  sources: Source[];
}

/**
 * Complete compliance result including matrix information.
 */
export interface ComplianceResult extends RawComplianceResult {
  matrix: ComplianceResultMatrix;
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

/**
 * Uses LLM to find the best matching CEIRSA category for a given product/matrix.
 */
const findCeirsaCategoryWithLLM = async (
  matrix: MatrixExtractionResult,
  categories: CeirsaCategory[]
): Promise<CeirsaCategory | null> => {
  const categoryNames = categories.map((cat) => cat.name);

  const prompt = `Sei un esperto di sicurezza alimentare e normative CEIRSA.

PRODOTTO/MATRICE DA ANALIZZARE:
- Prodotto: ${matrix.product || "non specificato"}
- Matrice: ${matrix.matrix || "non specificata"}
- Descrizione: ${matrix.description || "non specificata"}

CATEGORIE CEIRSA DISPONIBILI:
${categoryNames.map((name, i) => `${i + 1}. ${name}`).join("\n")}

COMPITO:
Identifica la categoria CEIRSA più appropriata per questo prodotto/matrice.
Se il prodotto è chiaramente associabile a una categoria (es. "gelato" → "Gelati e dessert a base di latte congelati"), restituisci il nome ESATTO della categoria.
Se non c'è una corrispondenza chiara, restituisci "NESSUNA".

Rispondi SOLO con il nome esatto della categoria o "NESSUNA". Nessuna spiegazione.`;

  try {
    const matcherModel = new ChatOpenAI({
      modelName: "gpt-4o-mini",
      temperature: 0,
    });

    const response = await matcherModel.invoke(prompt);
    const result = response.content?.toString().trim();

    if (!result || result === "NESSUNA") {
      return null;
    }

    // Find the category by exact or partial name match
    const matchedCategory = categories.find(
      (cat) =>
        cat.name.toLowerCase() === result.toLowerCase() ||
        cat.name.toLowerCase().includes(result.toLowerCase()) ||
        result.toLowerCase().includes(cat.name.toLowerCase())
    );

    return matchedCategory ?? null;
  } catch (error) {
    console.warn("[checks] LLM category matching failed:", error);
    return null;
  }
};

/**
 * Attempts to find a matching CEIRSA category based on product name or matrix description.
 * Uses simple string matching first, then falls back to LLM for semantic matching.
 */
const findCeirsaCategoryByProduct = async (
  matrix: MatrixExtractionResult
): Promise<CeirsaCategory | null> => {
  const searchTerms = [
    matrix.product,
    matrix.matrix,
    matrix.description,
  ].filter((term): term is string => Boolean(term?.trim()));

  if (searchTerms.length === 0) {
    return null;
  }

  try {
    const categories = await getCeirsaCategories();

    // Try simple string matching first
    for (const term of searchTerms) {
      const normalizedTerm = term.toLowerCase().trim();

      const exactMatch = categories.find((cat) => {
        const catNameLower = cat.name.toLowerCase();
        return (
          catNameLower.includes(normalizedTerm) ||
          normalizedTerm.includes(catNameLower.split(" ")[0] ?? "")
        );
      });

      if (exactMatch) {
        return exactMatch;
      }
    }

    // Fall back to LLM-based matching
    return await findCeirsaCategoryWithLLM(matrix, categories);
  } catch (error) {
    console.warn("[checks] Error finding CEIRSA category by product:", error);
    return null;
  }
};

/**
 * Builds the matrix object to include in compliance results.
 */
const buildComplianceResultMatrix = (
  matrix: MatrixExtractionResult,
  ceirsaCategoryName: string | null
): ComplianceResultMatrix => ({
  matrix: matrix.matrix,
  description: matrix.description,
  product: matrix.product,
  category: matrix.category,
  ceirsaCategory: ceirsaCategoryName,
  sampleType: matrix.sampleType,
});

/**
 * Adds the matrix information to each compliance result.
 */
const enrichResultsWithMatrix = (
  results: RawComplianceResult[],
  matrixInfo: ComplianceResultMatrix
): ComplianceResult[] => {
  return results.map((result) => ({
    ...result,
    matrix: matrixInfo,
  }));
};

/**
 * Checks if a sample type is an environmental/surface swab.
 * Environmental swabs use UFC/cm² units and CANNOT be compared to CEIRSA food limits (UFC/g).
 */
const isEnvironmentalSample = (sampleType: SampleType): boolean => {
  return sampleType === "environmental_swab" || sampleType === "personnel_swab";
};

/**
 * Creates an informative result explaining why CEIRSA limits cannot be applied.
 */
const createEnvironmentalSampleWarning = (
  matrix: MatrixExtractionResult
): RawComplianceResult => ({
  name: "Avviso: Campione di superficie",
  value: "N/A - Limiti CEIRSA non applicabili",
  isCheck: true, // No non-conformità rilevabile con i dati disponibili
  description:
    `Questo è un tampone ambientale/superficie (${matrix.matrix}${
      matrix.description ? `: ${matrix.description}` : ""
    }). ` +
    `I risultati sono espressi in UFC/cm² e NON possono essere confrontati con i limiti CEIRSA per alimenti (UFC/g). ` +
    `Per valutare la conformità, è necessario consultare i limiti specifici per superfici/attrezzature ` +
    `definiti nel piano HACCP o nelle specifiche interne dell'azienda.`,
  sources: [
    {
      id: "surface-swab-warning",
      title: "Avviso: Unità di misura non comparabili",
      url: null,
      excerpt:
        "UFC/cm² (superfici) ≠ UFC/g (alimenti). Necessari limiti specifici per superfici.",
    },
  ],
});

export const checks = async (
  textObjects: ExtractedTextEntry[]
): Promise<ComplianceResult[]> => {
  const markdownContent = composeMarkdownPayload(textObjects);

  if (!markdownContent) {
    return [];
  }

  const matrix = await extractMatrixFromText(textObjects);

  // CRITICAL CHECK: Environmental/surface swabs cannot use CEIRSA food limits
  if (isEnvironmentalSample(matrix.sampleType)) {
    console.log(
      `[checks] Environmental sample detected (${matrix.sampleType}): ${matrix.matrix}. ` +
        `CEIRSA food limits (UFC/g) NOT applicable to surface swabs (UFC/cm²).`
    );
    const warningResult = createEnvironmentalSampleWarning(matrix);
    const matrixInfo = buildComplianceResultMatrix(matrix, null);
    return enrichResultsWithMatrix([warningResult], matrixInfo);
  }

  // Prima verifica se rientra in una categoria CEIRSA
  const ceirsaCategory = await ceirsaCheck(matrix);

  // Se è categorizzata CEIRSA direttamente, usa ceirsaComplianceCheck
  if (ceirsaCategory) {
    const analyses = await extractAnalysesFromText(textObjects);
    const rawResults = await ceirsaComplianceCheck(
      ceirsaCategory,
      analyses,
      markdownContent
    );
    const matrixInfo = buildComplianceResultMatrix(matrix, ceirsaCategory.name);
    return enrichResultsWithMatrix(rawResults, matrixInfo);
  }

  // Se non rientra in nessuna categoria CEIRSA e la categoria è "beverage", usa beverageCheck
  if (matrix.category === "beverage") {
    const analyses = await extractAnalysesFromText(textObjects);
    const rawResults: RawComplianceResult[] = [];

    for (const analysis of analyses) {
      const beverageInput: BeverageCheckInput = {
        parameter: analysis.parameter,
        value: analysis.result,
        unit: analysis.um_result || null,
        beverageType: matrix.product || matrix.matrix || "bevanda",
        markdownContent,
      };

      const complianceResults = await beverageCheck(beverageInput);
      rawResults.push(...complianceResults);
    }

    const matrixInfo = buildComplianceResultMatrix(matrix, null);
    return enrichResultsWithMatrix(rawResults, matrixInfo);
  }

  // Per categoria "food" (solo campioni alimentari diretti), prova a trovare una categoria CEIRSA
  if (matrix.category === "food" && matrix.sampleType === "food_product") {
    const fallbackCategory = await findCeirsaCategoryByProduct(matrix);

    if (fallbackCategory) {
      const analyses = await extractAnalysesFromText(textObjects);
      const rawResults = await ceirsaComplianceCheck(
        fallbackCategory,
        analyses,
        markdownContent
      );
      const matrixInfo = buildComplianceResultMatrix(
        matrix,
        fallbackCategory.name
      );
      return enrichResultsWithMatrix(rawResults, matrixInfo);
    }
  }

  // Se non è stato possibile trovare una categoria, restituisci array vuoto
  return [];
};
