import { JsonOutputParser } from "@langchain/core/output_parsers";
import { Analyses } from "../extract_analyses_from_text";
import { MatrixExtractionResult } from "../extract_matrix_from_text";
import { RawComplianceResult, Source, searchRegulatoryContext } from "./index";
import { environmentalSwabCheckPrompt } from "../../prompts/environmental_swab_check.prompt";
import { createLLM } from "../../utils/llm-factory";
import { CeirsaCategory } from "../ceirsa_categorizer";

const defaultParser = new JsonOutputParser<RawComplianceResult[]>();

// Get model lazily to respect current provider settings
const getModel = async () => {
  const { model } = await createLLM({ capability: "text", temperature: 0 });
  return model;
};

export interface EnvironmentalSwabCheckInput {
  matrix: MatrixExtractionResult;
  analyses: Analyses[];
  markdownContent: string;
  /** CeIRSA category if found (may have incompatible units for swabs) */
  ceirsaCategory?: CeirsaCategory | null;
  /** Pre-built CeIRSA status source to include in all results */
  ceirsaStatusSource?: Source;
}

/**
 * Performs compliance check for environmental/surface swabs.
 * 
 * Environmental swabs use UFC/cm² units and CANNOT be compared to CEIRSA food limits (UFC/g).
 * This function evaluates the analyses and returns a compliance result with an appropriate warning.
 * 
 * @param input - Input containing matrix info, analyses, and document content
 * @returns Array of compliance results with warnings about incompatible units
 */
export const environmentalSwabComplianceCheck = async (
  input: EnvironmentalSwabCheckInput
): Promise<RawComplianceResult[]> => {
  const { matrix, analyses, markdownContent, ceirsaCategory, ceirsaStatusSource } = input;

  if (!analyses || analyses.length === 0) {
    console.log(`[environmental_swab.check] No analyses extracted from PDF`);
    return [];
  }

  console.log(
    `[environmental_swab.check] Checking ${analyses.length} analyses for environmental swab: ${matrix.matrix}`
  );
  console.log(
    `[environmental_swab.check] CeIRSA category: ${ceirsaCategory?.name ?? "nessuna corrispondenza"}`
  );

  // Search for regulatory context with Tavily
  const parameterNames = analyses.map((a) => a.parameter).join(", ");
  const tavilyQuery = `${parameterNames} limiti tamponi ambientali superfici attrezzature HACCP igiene processi alimentari normativa`;
  const tavilyResult = await searchRegulatoryContext(analyses, tavilyQuery);

  console.log(
    `[environmental_swab.check] Tavily search found ${tavilyResult.sources.length} regulatory sources`
  );

  // Build base sources: CeIRSA status FIRST, then other sources
  const buildBaseSources = (): Source[] => {
    const sources: Source[] = [];

    // CeIRSA always first
    if (ceirsaStatusSource) {
      sources.push(ceirsaStatusSource);
    }

    // Unit warning
    sources.push({
      id: "environmental-swab-warning",
      title: "Avviso: Unità di misura non comparabili",
      url: null,
      excerpt:
        "UFC/cm² (superfici) ≠ UFC/g (alimenti). I limiti CeIRSA per alimenti non sono direttamente applicabili ai tamponi ambientali.",
    });

    // Tavily sources
    sources.push(...tavilyResult.sources);

    return sources;
  };

  const analysesJson = JSON.stringify(analyses, null, 2);
  const formatInstructions = defaultParser.getFormatInstructions();
  const descriptionText = matrix.description
    ? `: ${matrix.description}`
    : "";
  const defaultDescription =
    `Questo è un tampone ambientale/superficie (${matrix.matrix}${descriptionText}). ` +
    `I risultati sono espressi in UFC/cm² e NON possono essere confrontati con i limiti CEIRSA per alimenti (UFC/g). ` +
    `Per valutare la conformità, è necessario consultare i limiti specifici per superfici/attrezzature ` +
    `definiti nel piano HACCP o nelle specifiche interne dell'azienda.`;

  try {
    const prompt = await environmentalSwabCheckPrompt.format({
      analysesJson,
      matrix: matrix.matrix,
      description: matrix.description || "non specificata",
      sampleType: matrix.sampleType,
      markdownContent: markdownContent.substring(0, 3000), // Limit content length
      defaultDescription,
      tavilyContext: tavilyResult.contextText || "Nessun contesto normativo trovato tramite ricerca web.",
      formatInstructions,
    });

    const model = await getModel();
    const response = await model.invoke(prompt);
    const rawContent = response.content?.toString() ?? "";

    // Parse JSON from response
    const jsonMatch = rawContent.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.log(
        `[environmental_swab.check] No valid JSON in LLM response, creating default warning`
      );
      const baseSources = buildBaseSources();

      return analyses.map((analysis) => {
        const resultValue = analysis.um_result
          ? `${analysis.result} ${analysis.um_result}`
          : analysis.result;
        return {
          name: analysis.parameter,
          value: "Limite non specificato per superfici",
          isCheck: null,
          description:
            `Risultato: ${resultValue}. ` +
            `I limiti CEIRSA per alimenti (UFC/g) NON sono applicabili ai tamponi ambientali (UFC/cm²). ` +
            `Non è stato possibile determinare limiti normativi specifici per superfici. ` +
            `Consultare i limiti definiti nel piano HACCP o nelle specifiche interne dell'azienda.`,
          sources: baseSources,
        };
      });
    }

    const parsed = JSON.parse(jsonMatch[0]) as RawComplianceResult[];

    const resultParamNames = new Set(
      parsed.map((r) => r.name.toLowerCase().trim())
    );

    const baseSources = buildBaseSources();

    // Add missing analyses with default warning
    for (const analysis of analyses) {
      const normalizedName = analysis.parameter.toLowerCase().trim();
      if (!resultParamNames.has(normalizedName)) {
        const resultValue = analysis.um_result
          ? `${analysis.result} ${analysis.um_result}`
          : analysis.result;
        parsed.push({
          name: analysis.parameter,
          value: "Limite non specificato per superfici",
          isCheck: null,
          description:
            `Risultato: ${resultValue}. ` +
            `I limiti CEIRSA per alimenti (UFC/g) NON sono applicabili ai tamponi ambientali (UFC/cm²). ` +
            `Non è stato possibile determinare limiti normativi specifici per questo parametro. ` +
            `Consultare i limiti definiti nel piano HACCP o nelle specifiche interne dell'azienda.`,
          sources: baseSources,
        });
      } else {
        // Prepend CeIRSA + base sources to existing result sources
        const existingResult = parsed.find(
          (r) => r.name.toLowerCase().trim() === normalizedName
        );
        if (existingResult) {
          const existingSourceIds = new Set(existingResult.sources.map(s => s.id));
          const newSources = baseSources.filter(s => !existingSourceIds.has(s.id));
          existingResult.sources = [...newSources, ...existingResult.sources];
        }
      }
    }

    console.log(
      `[environmental_swab.check] Generated ${parsed.length} compliance results`
    );
    return parsed;
  } catch (error) {
    console.error(
      `[environmental_swab.check] LLM evaluation failed:`,
      error
    );
    const baseSources = buildBaseSources();

    return analyses.map((analysis) => {
      const resultValue = analysis.um_result
        ? `${analysis.result} ${analysis.um_result}`
        : analysis.result;
      return {
        name: analysis.parameter,
        value: "Limite non specificato per superfici",
        isCheck: null,
        description:
          `Risultato: ${resultValue}. ` +
          `I limiti CEIRSA per alimenti (UFC/g) NON sono applicabili ai tamponi ambientali (UFC/cm²). ` +
          `Errore durante la valutazione automatica. Consultare i limiti definiti nel piano HACCP.`,
        sources: baseSources,
      };
    });
  }
};

