import { ChatOpenAI } from "@langchain/openai";
import { JsonOutputParser } from "@langchain/core/output_parsers";
import { Analyses } from "../extract_analyses_from_text";
import { MatrixExtractionResult } from "../extract_matrix_from_text";
import { RawComplianceResult, Source, searchRegulatoryContext } from "./index";
import { environmentalSwabCheckPrompt } from "../../prompts/environmental_swab_check.prompt";

const defaultParser = new JsonOutputParser<RawComplianceResult[]>();
const defaultModel = new ChatOpenAI({
  modelName: "gpt-4o-mini",
  temperature: 0,
});

export interface EnvironmentalSwabCheckInput {
  matrix: MatrixExtractionResult;
  analyses: Analyses[];
  markdownContent: string;
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
  const { matrix, analyses, markdownContent } = input;

  if (!analyses || analyses.length === 0) {
    console.log(`[environmental_swab.check] No analyses extracted from PDF`);
    return [];
  }

  console.log(
    `[environmental_swab.check] Checking ${analyses.length} analyses for environmental swab: ${matrix.matrix}`
  );

  // Search for regulatory context with Tavily
  const parameterNames = analyses.map((a) => a.parameter).join(", ");
  const tavilyQuery = `${parameterNames} limiti tamponi ambientali superfici attrezzature HACCP igiene processi alimentari normativa`;
  const tavilyResult = await searchRegulatoryContext(analyses, tavilyQuery);
  
  console.log(
    `[environmental_swab.check] Tavily search found ${tavilyResult.sources.length} regulatory sources`
  );

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

    const response = await defaultModel.invoke(prompt);
    const rawContent = response.content?.toString() ?? "";

    // Parse JSON from response
    const jsonMatch = rawContent.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.log(
        `[environmental_swab.check] No valid JSON in LLM response, creating default warning`
      );
      // Fallback: create default warning for each analysis with Tavily sources
      const baseSources: Source[] = [
        {
          id: "environmental-swab-warning",
          title: "Avviso: Unità di misura non comparabili",
          url: null,
          excerpt:
            "UFC/cm² (superfici) ≠ UFC/g (alimenti). Necessari limiti specifici per superfici.",
        },
        ...tavilyResult.sources,
      ];
      
      return analyses.map((analysis) => {
        const resultValue = analysis.um_result
          ? `${analysis.result} ${analysis.um_result}`
          : analysis.result;
        return {
          name: analysis.parameter,
          value: resultValue,
          isCheck: null, // Da confermare - nessun limite chiaro trovato
          description:
            `Questo è un tampone ambientale/superficie (${matrix.matrix}${descriptionText}). ` +
            `I risultati sono espressi in UFC/cm² e NON possono essere confrontati con i limiti CEIRSA per alimenti (UFC/g). ` +
            `Per valutare la conformità, è necessario consultare i limiti specifici per superfici/attrezzature ` +
            `definiti nel piano HACCP o nelle specifiche interne dell'azienda. ` +
            `Stato: DA CONFERMARE - non è stato possibile determinare limiti normativi chiari per questo parametro.`,
          sources: baseSources,
        };
      });
    }

    const parsed = JSON.parse(jsonMatch[0]) as RawComplianceResult[];

    // Ensure all analyses have a result and merge Tavily sources
    const analysisParamNames = new Set(
      analyses.map((a) => a.parameter.toLowerCase().trim())
    );
    const resultParamNames = new Set(
      parsed.map((r) => r.name.toLowerCase().trim())
    );

    // Base sources: warning + Tavily sources
    const baseSources: Source[] = [
      {
        id: "environmental-swab-warning",
        title: "Avviso: Unità di misura non comparabili",
        url: null,
        excerpt:
          "UFC/cm² (superfici) ≠ UFC/g (alimenti). Necessari limiti specifici per superfici.",
      },
      ...tavilyResult.sources,
    ];

    // Add missing analyses with default warning and ensure value contains actual result
    for (const analysis of analyses) {
      const normalizedName = analysis.parameter.toLowerCase().trim();
      if (!resultParamNames.has(normalizedName)) {
        const resultValue = analysis.um_result
          ? `${analysis.result} ${analysis.um_result}`
          : analysis.result;
        parsed.push({
          name: analysis.parameter,
          value: resultValue,
          isCheck: null, // Da confermare - nessun limite chiaro trovato
          description:
            `Questo è un tampone ambientale/superficie (${matrix.matrix}${descriptionText}). ` +
            `I risultati sono espressi in UFC/cm² e NON possono essere confrontati con i limiti CEIRSA per alimenti (UFC/g). ` +
            `Per valutare la conformità, è necessario consultare i limiti specifici per superfici/attrezzature ` +
            `definiti nel piano HACCP o nelle specifiche interne dell'azienda. ` +
            `Stato: DA CONFERMARE - non è stato possibile determinare limiti normativi chiari per questo parametro.`,
          sources: baseSources,
        });
      } else {
        // Ensure existing results have the actual analysis value if it's still "N/A"
        const existingResult = parsed.find(
          (r) => r.name.toLowerCase().trim() === normalizedName
        );
        if (existingResult) {
          if (existingResult.value.includes("N/A")) {
            const resultValue = analysis.um_result
              ? `${analysis.result} ${analysis.um_result}`
              : analysis.result;
            existingResult.value = resultValue;
          }
          // Merge Tavily sources with existing sources (avoid duplicates)
          const existingSourceIds = new Set(existingResult.sources.map(s => s.id));
          const newTavilySources = tavilyResult.sources.filter(s => !existingSourceIds.has(s.id));
          existingResult.sources = [...existingResult.sources, ...newTavilySources];
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
    // Fallback: create default warning for each analysis with Tavily sources
    const baseSources: Source[] = [
      {
        id: "environmental-swab-warning",
        title: "Avviso: Unità di misura non comparabili",
        url: null,
        excerpt:
          "UFC/cm² (superfici) ≠ UFC/g (alimenti). Necessari limiti specifici per superfici.",
      },
      ...tavilyResult.sources,
    ];
    
    return analyses.map((analysis) => {
      const resultValue = analysis.um_result
        ? `${analysis.result} ${analysis.um_result}`
        : analysis.result;
      return {
        name: analysis.parameter,
        value: resultValue,
        isCheck: true,
        description:
          `Questo è un tampone ambientale/superficie (${matrix.matrix}${descriptionText}). ` +
          `I risultati sono espressi in UFC/cm² e NON possono essere confrontati con i limiti CEIRSA per alimenti (UFC/g). ` +
          `Per valutare la conformità, è necessario consultare i limiti specifici per superfici/attrezzature ` +
          `definiti nel piano HACCP o nelle specifiche interne dell'azienda.`,
        sources: baseSources,
      };
    });
  }
};

