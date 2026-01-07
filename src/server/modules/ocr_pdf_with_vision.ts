import * as fs from "node:fs/promises";
import OpenAI from "openai";

/**
 * OCR fallback using GPT-4 Vision for PDF files with corrupted text.
 * Reads PDF as base64 and sends directly to GPT-4o for OCR.
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

/**
 * Uses GPT-4o to OCR a PDF file directly.
 * GPT-4o can read PDFs natively when passed as base64.
 */
export const ocrPdfWithVision = async (
  pdfPath: string
): Promise<OcrResult[]> => {
  console.log(`[OCR] Reading PDF file: ${pdfPath}`);
  
  const pdfBuffer = await fs.readFile(pdfPath);
  const base64Pdf = pdfBuffer.toString("base64");
  
  console.log(`[OCR] PDF size: ${(pdfBuffer.length / 1024).toFixed(1)} KB`);
  
  const openai = new OpenAI();
  
  const prompt = `Sei un esperto OCR per documenti di laboratorio di analisi microbiologiche e allergeni.

COMPITO:
Estrai TUTTO il testo da questo documento PDF, in particolare:
1. Intestazione e dati del campione (matrice, descrizione, riferimenti)
2. TABELLA DEI RISULTATI con: Parametro, Risultato, Metodo, Unità di misura
3. Note e riferimenti bibliografici

FORMATO OUTPUT:
Restituisci il testo in formato strutturato:

DATI CAMPIONE:
- Matrice: [valore]
- Descrizione: [valore]
- Riferimenti: [valore]

RISULTATI ANALISI:
| Parametro | Risultato | U.M. | Metodo |
|-----------|-----------|------|--------|
| [nome] | [valore] | [unità] | [metodo] |

NOTE:
[eventuali note]

REGOLE:
- Mantieni i valori ESATTI (es. "< 10", "non rilevato", "rilevato")
- Includi TUTTI i parametri trovati (microbiologici E allergeni)
- Se un campo non è presente, scrivi "-"`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
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

