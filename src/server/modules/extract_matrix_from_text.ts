import { JsonOutputParser } from "@langchain/core/output_parsers";
import { PromptTemplate } from "@langchain/core/prompts";
import { ChatOpenAI } from "@langchain/openai";
import { LangChainMessageUtils } from "../utils/langchain_message.utils";

import {
  extractMatrixPrompt,
  fallbackMatrixPrompt,
} from "../prompts/extract_matrix_from_text";
import { getCategories } from "./ceirsa_categorizer";
import { ExtractedTextEntry } from "./extract_text_from_pdf";

const matrixPromptTemplate = PromptTemplate.fromTemplate(
  extractMatrixPrompt.prompt
);
const fallbackPromptTemplate = PromptTemplate.fromTemplate(
  fallbackMatrixPrompt.prompt
);

export interface MatrixExtractionResult {
  matrix: string;
  description: string | null;
  product: string | null;
  category: "food" | "beverage" | "other";
  ceirsa_category: string | null;
  specialFeatures: string[];
}

type RawMatrixExtractionResult = Partial<
  Omit<MatrixExtractionResult, "specialFeatures">
> & {
  specialFeatures?: string[] | string | null;
};

interface CategoryRepository {
  getCategories(): Promise<string[]>;
}

interface PromptBuilder {
  build(markdownContent: string, categories: string[]): Promise<string>;
}

interface MatrixExtractionDependencies {
  model: ChatOpenAI;
  categoryRepository: CategoryRepository;
  promptBuilder: PromptBuilder;
  parser: JsonOutputParser<RawMatrixExtractionResult>;
}

const DEFAULT_MATRIX_RESULT: MatrixExtractionResult = {
  matrix: "Tampone ambientale",
  description: null,
  product: null,
  category: "other",
  ceirsa_category: null,
  specialFeatures: [],
};

const buildDefaultMatrixResult = (): MatrixExtractionResult => ({
  matrix: DEFAULT_MATRIX_RESULT.matrix,
  description: DEFAULT_MATRIX_RESULT.description,
  product: DEFAULT_MATRIX_RESULT.product,
  category: DEFAULT_MATRIX_RESULT.category,
  ceirsa_category: DEFAULT_MATRIX_RESULT.ceirsa_category,
  specialFeatures: [],
});

const matrixParser = new JsonOutputParser<RawMatrixExtractionResult>();
const formatInstructions = matrixParser.getFormatInstructions();

const createCeirsaCategoryRepository = (): CategoryRepository => {
  let cachedCategories: string[] | null = null;

  const loadCategoriesFromDisk = async (): Promise<string[]> => {
    try {
      const categories = await getCategories();
      return categories;
    } catch {
      return [];
    }
  };

  const getCategories = async (): Promise<string[]> => {
    if (cachedCategories) {
      return cachedCategories;
    }

    cachedCategories = await loadCategoriesFromDisk();
    return cachedCategories;
  };

  return { getCategories };
};

const createMatrixPromptBuilder = (template: PromptTemplate): PromptBuilder => {
  const build = async (
    markdownContent: string,
    categories: string[]
  ): Promise<string> => {
    const categoriesBlock =
      categories.length > 0
        ? categories
            .map((category, index) => `${index + 1}. ${category}`)
            .join("\n    ")
        : "Nessuna categoria disponibile";

    const basePrompt = await template.format({
      ceirsaCategories: categoriesBlock,
      markdownContent,
    });
    return `${basePrompt}${formatInstructions}`;
  };

  return { build };
};

const composeMarkdownPayload = (textObjects: ExtractedTextEntry[]): string => {
  return textObjects
    .slice()
    .sort((left, right) => left.letter_number - right.letter_number)
    .map((entry) => entry.text_extracted?.trim())
    .filter((value): value is string => Boolean(value))
    .join("\n\n")
    .trim();
};

const normalizeString = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeCategory = (
  value: unknown
): MatrixExtractionResult["category"] => {
  if (value === "food" || value === "beverage" || value === "other") {
    return value;
  }

  return DEFAULT_MATRIX_RESULT.category;
};

const normalizeCeirsaCategory = (
  value: unknown,
  categories: string[]
): string | null => {
  const normalized = normalizeString(value);
  if (!normalized) {
    return null;
  }

  const match = categories.find(
    (category) => category.toLowerCase() === normalized.toLowerCase()
  );

  return match ?? null;
};

const normalizeSpecialFeatures = (
  value: RawMatrixExtractionResult["specialFeatures"]
): string[] => {
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeString(item))
      .filter((item): item is string => Boolean(item));
  }

  const singleValue = normalizeString(value);
  return singleValue ? [singleValue] : [];
};

const cleanJsonResponse = (payload: string): string => {
  let cleaned = payload.trim();

  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.replace(/^```json\s*/i, "").replace(/\s*```$/, "");
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```\s*/i, "").replace(/\s*```$/, "");
  }

  return cleaned;
};

const normalizeResponse = (
  response: RawMatrixExtractionResult | null | undefined,
  categories: string[]
): MatrixExtractionResult => {
  if (!response || typeof response !== "object") {
    return buildDefaultMatrixResult();
  }

  const matrix =
    normalizeString(response.matrix) ?? DEFAULT_MATRIX_RESULT.matrix;
  const description = normalizeString(response.description);
  const product = normalizeString(response.product);
  const category = normalizeCategory(response.category);
  const ceirsaCategory = normalizeCeirsaCategory(
    response.ceirsa_category,
    categories
  );
  const specialFeatures = normalizeSpecialFeatures(response.specialFeatures);

  return {
    matrix,
    description,
    product,
    category,
    ceirsa_category: ceirsaCategory,
    specialFeatures,
  };
};

/**
 * Infers matrix information from document content when extraction fails.
 */
const inferMatrixFromContent = async (
  markdownContent: string,
  categories: string[]
): Promise<MatrixExtractionResult> => {
  try {
    const openAIApiKey = process.env.OPENAI_API_KEY;
    if (!openAIApiKey) {
      throw new Error("OPENAI_API_KEY environment variable is required");
    }

    const categoriesBlock =
      categories.length > 0
        ? categories.map((cat, index) => `${index + 1}. ${cat}`).join("\n    ")
        : "Nessuna categoria disponibile";

    const promptContent = await fallbackPromptTemplate.format({
      ceirsaCategories: categoriesBlock,
      markdownContent,
    });

    const inferenceModel = new ChatOpenAI({
      openAIApiKey,
      modelName: "gpt-4o-mini",
      temperature: 0.1,
    });

    const response = await inferenceModel.invoke(promptContent);
    const resolvedContent = LangChainMessageUtils.extractTextContent(response);
    const cleanedResponse = cleanJsonResponse(resolvedContent);
    const parsedInfo = JSON.parse(cleanedResponse) as RawMatrixExtractionResult;
    return normalizeResponse(parsedInfo, categories);
  } catch (error) {
    console.error("Error in matrix inference:", error);
    return buildDefaultMatrixResult();
  }
};

const createMatrixExtractionService = (
  dependencies: MatrixExtractionDependencies
) => {
  const extract = async (
    textObjects: ExtractedTextEntry[]
  ): Promise<MatrixExtractionResult> => {
    if (!Array.isArray(textObjects) || textObjects.length === 0) {
      return buildDefaultMatrixResult();
    }

    const markdownContent = composeMarkdownPayload(textObjects);

    if (!markdownContent) {
      return buildDefaultMatrixResult();
    }

    const categories = await dependencies.categoryRepository.getCategories();

    try {
      const prompt = await dependencies.promptBuilder.build(
        markdownContent,
        categories
      );
      const response = await dependencies.model.invoke(prompt);
      const resolvedContent =
        LangChainMessageUtils.extractTextContent(response);
      const parsed = await dependencies.parser.parse(resolvedContent);
      return normalizeResponse(parsed, categories);
    } catch (error) {
      const failure = error instanceof Error ? error.message : "Unknown error";
      console.warn(`Matrix extraction failed: ${failure}`);
      return inferMatrixFromContent(markdownContent, categories);
    }
  };

  return { extract };
};

const defaultDependencies: MatrixExtractionDependencies = {
  model: new ChatOpenAI({
    model: "gpt-4o-mini",
    temperature: 0.1,
  }),
  categoryRepository: createCeirsaCategoryRepository(),
  promptBuilder: createMatrixPromptBuilder(matrixPromptTemplate),
  parser: matrixParser,
};

const matrixExtractionService =
  createMatrixExtractionService(defaultDependencies);

export const extractMatrixFromText = (
  textObjects: ExtractedTextEntry[]
): Promise<MatrixExtractionResult> => {
  return matrixExtractionService.extract(textObjects);
};
