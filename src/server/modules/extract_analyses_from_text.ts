import { JsonOutputParser } from "@langchain/core/output_parsers";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

import { extractAnalysesPrompt } from "../prompts/extract_analyses_from_text";
import { LangChainMessageUtils } from "../utils/langchain_message.utils";
import { createLLM } from "../utils/llm-factory";

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

const analysesParser = new JsonOutputParser<RawAnalysisRecord[]>();

const promptContent = `${
  extractAnalysesPrompt.prompt
}${analysesParser.getFormatInstructions()}`;

// Lazy-loaded model instance
let cachedModel: BaseChatModel | null = null;

async function getModel(): Promise<BaseChatModel> {
  // Always get a fresh model to respect current provider settings
  const { model } = await createLLM({ capability: "text", temperature: 0 });
  return model;
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

const generateAnalyses = async (
  markdownContent: string
): Promise<RawAnalysisRecord[]> => {
  const prompt = buildPrompt(markdownContent);
  console.log(`[extractAnalyses] Prompt length: ${prompt.length} chars`);

  try {
    const model = await getModel();
    const response = await model.invoke(prompt);
    const resolvedContent = LangChainMessageUtils.extractTextContent(response);
    console.log(`[extractAnalyses] LLM response: ${resolvedContent.substring(0, 500)}...`);

    const parsed = await analysesParser.parse(resolvedContent);
    console.log(`[extractAnalyses] Parsed records: ${parsed?.length ?? 0}`);
    return parsed;
  } catch (parseError) {
    console.error(`[extractAnalyses] Parse error:`, parseError);
    return [];
  }
};

const buildPrompt = (markdownContent: string): string => {
  if (promptContent.includes("{markdownContent}")) {
    return promptContent.replace("{markdownContent}", markdownContent);
  }

  return `${promptContent}\n${markdownContent}`;
};

export const extractAnalysesFromText = async (
  textObjects: ExtractedTextEntry[]
): Promise<Analyses[]> => {
  if (!Array.isArray(textObjects) || textObjects.length === 0) {
    console.log(`[extractAnalyses] No text objects provided`);
    return [];
  }

  const markdownContent = composeMarkdownPayload(textObjects);

  if (!markdownContent) {
    console.log(`[extractAnalyses] Empty markdown content`);
    return [];
  }

  console.log(
    `[extractAnalyses] Processing ${textObjects.length} text entries, ${markdownContent.length} chars`
  );
  console.log(
    `[extractAnalyses] Content preview: ${markdownContent.substring(0, 1000)}...`
  );

  try {
    const analyses = await generateAnalyses(markdownContent);
    console.log(`[extractAnalyses] Raw analyses count: ${analyses?.length ?? 0}`);
    const normalized = normalizeResponse(analyses);
    console.log(`[extractAnalyses] Normalized analyses count: ${normalized.length}`);
    return normalized;
  } catch (error) {
    console.error(`[extractAnalyses] Error:`, error);
    throw new Error("Failed to extract analyses from text", {
      cause: error instanceof Error ? error : undefined,
    });
  }
};
