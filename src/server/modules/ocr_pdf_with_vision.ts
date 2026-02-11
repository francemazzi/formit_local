import * as fs from "node:fs/promises";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";
import {
  getVisionProvider,
  type OpenAIVisionConfig,
  type AnthropicVisionConfig,
  type BedrockVisionConfig,
} from "../utils/llm-factory";

/**
 * OCR fallback using GPT-4 Vision or Claude Vision for PDF files with corrupted text.
 * All providers now support sending PDFs directly:
 * - OpenAI: Reads PDF as base64 and sends to GPT-4o
 * - Anthropic: Sends PDF via document type to Claude
 * - Bedrock: Sends PDF via document type to Claude on AWS
 */

interface OcrResult {
  pageNumber: number;
  text: string;
}

/**
 * Detects if extracted text appears to be corrupted/garbled.
 * Common patterns in corrupted OCR:
 * - Repeated character patterns like "A A A Al l l li i i im m m me e e en n n nt t t to o o o"
 * - Excessive single characters separated by spaces
 */
export const isTextCorrupted = (text: string): boolean => {
  if (!text || text.length < 50) return false;

  // Pattern 1: Repeated single characters with spaces (e.g., "A A A A", "l l l l")
  const repeatedCharPattern = /(\w)\s\1\s\1\s\1/g;
  const matches = text.match(repeatedCharPattern) || [];
  
  // If more than 5 instances of repeated chars, likely corrupted
  if (matches.length > 5) {
    console.log(`[OCR] Detected ${matches.length} corrupted patterns in text`);
    return true;
  }

  // Pattern 2: Very high ratio of single chars to words
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const singleChars = words.filter(w => w.length === 1);
  const ratio = singleChars.length / words.length;
  
  if (ratio > 0.3 && words.length > 20) {
    console.log(`[OCR] High single-char ratio: ${(ratio * 100).toFixed(1)}%`);
    return true;
  }

  return false;
};

/**
 * Cleans corrupted text by removing repeated character patterns.
 * This is a basic heuristic cleanup.
 */
export const cleanCorruptedText = (text: string): string => {
  // Remove patterns like "A A A Al l l li i i im m m me e e en n n nt t t to o o o"
  // by keeping only unique consecutive characters
  let cleaned = text;

  // Pattern: single char repeated with spaces -> keep just one
  cleaned = cleaned.replace(/(\w)(\s\1)+/g, "$1");

  // Multiple spaces to single space
  cleaned = cleaned.replace(/\s{2,}/g, " ");

  return cleaned.trim();
};

const OCR_PROMPT = `Sei un esperto OCR per documenti di laboratorio di analisi microbiologiche, chimiche e allergeni.

COMPITO CRITICO:
Estrai TUTTO il testo da questo documento PDF. È FONDAMENTALE che tu estragga OGNI SINGOLA RIGA della tabella dei risultati senza omettere NULLA.

SEZIONI DA ESTRARRE:
1. Intestazione e dati del campione (matrice, descrizione, lotto, data produzione, scadenza, committente)
2. TABELLA DEI RISULTATI - ESTRAI OGNI RIGA: ogni parametro analizzato con risultato, unità di misura e metodo
3. Note, riferimenti normativi e firme

FORMATO OUTPUT:
Restituisci il testo in formato strutturato:

DATI CAMPIONE:
- Matrice: [valore]
- Descrizione/Prodotto: [valore]
- Lotto: [valore]
- Produzione: [data]
- Scadenza: [data]
- Committente: [nome]

RISULTATI ANALISI:
Per OGNI parametro trovato nella tabella, crea una riga:
| Parametro | Risultato | U.M. | Metodo |
|-----------|-----------|------|--------|
| [nome completo del parametro] | [valore esatto] | [unità] | [metodo/norma] |

NOTE:
[eventuali note, legenda, riferimenti]

REGOLE CRITICHE:
1. NON OMETTERE NESSUN PARAMETRO - estrai TUTTE le righe della tabella, anche se sembrano ripetitive
2. Mantieni i valori ESATTI come scritti (es. "< 10", "Non rilevato", "Rilevato", "Assente in 25g")
3. Includi TUTTI i tipi di parametri: microbiologici (Enterobatteri, E. coli, Stafilococchi, Salmonella, Listeria, Pseudomonas, Coliformi, CBT, ecc.), chimici, allergeni
4. Se un parametro ha più metodi/norme associati, includi tutti
5. Se ci sono più tabelle, estrai tutte
6. Non riassumere, non aggregare - ogni riga della tabella deve essere una riga nel tuo output`;


/**
 * OCR with OpenAI GPT-4o - can read PDFs directly
 */
const ocrWithOpenAI = async (
  pdfPath: string,
  config: OpenAIVisionConfig
): Promise<OcrResult[]> => {
  console.log(`[OCR] Using OpenAI GPT-4o for OCR`);

  const pdfBuffer = await fs.readFile(pdfPath);
  const base64Pdf = pdfBuffer.toString("base64");

  console.log(`[OCR] PDF size: ${(pdfBuffer.length / 1024).toFixed(1)} KB`);

  const openai = new OpenAI({ apiKey: config.apiKey });

  try {
    const response = await openai.chat.completions.create({
      model: config.model,
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: OCR_PROMPT },
            {
              type: "file",
              file: {
                filename: "document.pdf",
                file_data: `data:application/pdf;base64,${base64Pdf}`,
              },
            } as unknown as OpenAI.ChatCompletionContentPartText,
          ],
        },
      ],
    });

    const extractedText = response.choices[0]?.message?.content ?? "";
    console.log(`[OCR] GPT-4o extracted ${extractedText.length} chars`);

    return [{ pageNumber: 1, text: extractedText }];
  } catch (error) {
    console.error("[OCR] GPT-4o OCR failed:", error);
    throw error;
  }
};

/**
 * OCR with Anthropic Claude API (direct) - sends PDF directly via document type
 * Anthropic API now supports PDFs natively via the "document" content type.
 */
const ocrWithAnthropic = async (
  pdfPath: string,
  config: AnthropicVisionConfig
): Promise<OcrResult[]> => {
  console.log(`[OCR] Using Claude (Anthropic API) for OCR - sending PDF directly`);

  const pdfBuffer = await fs.readFile(pdfPath);
  const base64Pdf = pdfBuffer.toString("base64");

  console.log(`[OCR] PDF size: ${(pdfBuffer.length / 1024).toFixed(1)} KB`);

  const anthropic = new Anthropic({ apiKey: config.apiKey });

  try {
    const response = await anthropic.messages.create({
      model: config.model,
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: OCR_PROMPT },
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: base64Pdf,
              },
            } as Anthropic.DocumentBlockParam,
          ],
        },
      ],
    });

    const text =
      response.content[0]?.type === "text" ? response.content[0].text : "";

    console.log(`[OCR] Claude extracted ${text.length} chars from PDF`);

    return [{ pageNumber: 1, text }];
  } catch (error) {
    console.error("[OCR] Anthropic OCR failed:", error);
    throw error;
  }
};

/**
 * OCR with AWS Bedrock Claude - sends PDF directly via document type
 * AWS Bedrock Converse API supports PDF documents natively.
 */
const ocrWithBedrock = async (
  pdfPath: string,
  config: BedrockVisionConfig
): Promise<OcrResult[]> => {
  console.log(`[OCR] Using Claude (Bedrock) for OCR - sending PDF directly`);

  const pdfBuffer = await fs.readFile(pdfPath);

  console.log(`[OCR] PDF size: ${(pdfBuffer.length / 1024).toFixed(1)} KB`);

  const client = new BedrockRuntimeClient({
    region: config.region,
    credentials: config.credentials,
  });

  try {
    const command = new ConverseCommand({
      modelId: config.modelId,
      messages: [
        {
          role: "user",
          content: [
            { text: OCR_PROMPT },
            {
              document: {
                format: "pdf",
                name: "document",
                source: { bytes: pdfBuffer },
              },
            },
          ],
        },
      ],
      inferenceConfig: { maxTokens: 4096 },
    });

    const response = await client.send(command);
    const text = response.output?.message?.content?.[0]?.text ?? "";

    console.log(`[OCR] Bedrock Claude extracted ${text.length} chars from PDF`);

    return [{ pageNumber: 1, text }];
  } catch (error) {
    console.error("[OCR] Bedrock OCR failed:", error);
    throw error;
  }
};

/**
 * Uses the configured vision provider (OpenAI, Anthropic, or Bedrock) to OCR a PDF file.
 * All providers now support reading PDFs directly via their respective document APIs.
 */
export const ocrPdfWithVision = async (
  pdfPath: string
): Promise<OcrResult[]> => {
  console.log(`[OCR] Reading PDF file: ${pdfPath}`);

  const { provider, config } = await getVisionProvider();

  if (provider === "openai") {
    return ocrWithOpenAI(pdfPath, config as OpenAIVisionConfig);
  }

  if (provider === "anthropic") {
    return ocrWithAnthropic(pdfPath, config as AnthropicVisionConfig);
  }

  return ocrWithBedrock(pdfPath, config as BedrockVisionConfig);
};

/**
 * Fallback text extraction: tries standard extraction first,
 * falls back to Vision OCR if text appears corrupted.
 */
export const extractTextWithOcrFallback = async (
  standardText: string,
  pdfPath: string
): Promise<string> => {
  // Check if standard extraction produced good results
  if (!isTextCorrupted(standardText)) {
    return standardText;
  }

  console.log(`[OCR] Standard extraction produced corrupted text, trying Vision OCR...`);
  
  try {
    const ocrResults = await ocrPdfWithVision(pdfPath);
    const combinedText = ocrResults.map(r => r.text).join("\n\n");
    
    if (combinedText.length > 100) {
      console.log(`[OCR] Vision OCR successful, extracted ${combinedText.length} chars`);
      return combinedText;
    }
  } catch (error) {
    console.warn(`[OCR] Vision OCR failed, using cleaned standard text:`, error);
  }

  // Final fallback: clean the corrupted text
  return cleanCorruptedText(standardText);
};

