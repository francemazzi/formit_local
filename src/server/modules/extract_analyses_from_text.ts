import { JsonOutputParser } from "@langchain/core/output_parsers";
import { ChatOpenAI } from "@langchain/openai";

import { extractAnalysesPrompt } from "../prompts/extract_analyses_from_text";
import { LangChainMessageUtils } from "../utils/langchain_message.utils";

import { ExtractedTextEntry } from "./extract_text_from_pdf";

export interface Analyses {
  parameter: string;
  result: string;
  um_result: string;
  method: string;
}

type RawAnalysisRecord = {
  Parametro?: string;
  Risultato?: string;
  "U.M."?: string;
  Metodo?: string;
  parameter?: string;
  result?: string;
  um_result?: string;
  method?: string;
};

interface AnalysesExtractionDependencies {
  model: ChatOpenAI;
}

const analysesParser = new JsonOutputParser<RawAnalysisRecord[]>();

const promptContent = `${
  extractAnalysesPrompt.prompt
}${analysesParser.getFormatInstructions()}`;

const defaultDependencies: AnalysesExtractionDependencies = {
  model: new ChatOpenAI({
    model: "gpt-4o-mini",
    temperature: 0,
  }),
};

interface AnalysesExtractionService {
  extract(textObjects: ExtractedTextEntry[]): Promise<Analyses[]>;
}

const createAnalysesExtractionService = (
  dependencies: AnalysesExtractionDependencies = defaultDependencies
): AnalysesExtractionService => {
  const composeMarkdownPayload = (
    textObjects: ExtractedTextEntry[]
  ): string => {
    return textObjects
      .slice()
      .sort((left, right) => left.letter_number - right.letter_number)
      .map((entry) => entry.text_extracted?.trim())
      .filter((value): value is string => Boolean(value))
      .join("\n\n")
      .trim();
  };

  const normalizeField = (value: unknown): string | undefined => {
    if (typeof value !== "string") {
      return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  };

  const normalizeRecord = (
    record: RawAnalysisRecord | unknown
  ): Analyses | null => {
    if (!record || typeof record !== "object") {
      return null;
    }

    const typedRecord = record as RawAnalysisRecord;

    const parameter = normalizeField(
      typedRecord.Parametro ?? typedRecord.parameter
    );
    const result = normalizeField(typedRecord.Risultato ?? typedRecord.result);
    const umResult = normalizeField(
      typedRecord["U.M."] ?? typedRecord.um_result
    );
    const method = normalizeField(typedRecord.Metodo ?? typedRecord.method);

    if (!parameter && !result && !umResult && !method) {
      return null;
    }

    return {
      parameter: parameter ?? "",
      result: result ?? "",
      um_result: umResult ?? "",
      method: method ?? "",
    };
  };

  const normalizeResponse = (response: unknown): Analyses[] => {
    if (!Array.isArray(response)) {
      return [];
    }

    return response
      .map((item) => normalizeRecord(item))
      .filter((item): item is Analyses => Boolean(item));
  };

  return {
    async extract(textObjects: ExtractedTextEntry[]): Promise<Analyses[]> {
      if (!Array.isArray(textObjects) || textObjects.length === 0) {
        return [];
      }

      const markdownContent = composeMarkdownPayload(textObjects);

      if (!markdownContent) {
        return [];
      }

      try {
        const analyses = await generateAnalyses(
          markdownContent,
          dependencies.model
        );
        return normalizeResponse(analyses);
      } catch (error) {
        throw new Error("Failed to extract analyses from text", {
          cause: error instanceof Error ? error : undefined,
        });
      }
    },
  };
};

const generateAnalyses = async (
  markdownContent: string,
  model = defaultDependencies.model
): Promise<RawAnalysisRecord[]> => {
  const prompt = buildPrompt(markdownContent);
  const response = await model.invoke(prompt);
  const resolvedContent = LangChainMessageUtils.extractTextContent(response);
  return analysesParser.parse(resolvedContent);
};

const buildPrompt = (markdownContent: string): string => {
  if (promptContent.includes("{markdownContent}")) {
    return promptContent.replace("{markdownContent}", markdownContent);
  }

  return `${promptContent}\n${markdownContent}`;
};

const analysesExtractionService = createAnalysesExtractionService();

export const extractAnalysesFromText = (
  textObjects: ExtractedTextEntry[]
): Promise<Analyses[]> => {
  return analysesExtractionService.extract(textObjects);
};
