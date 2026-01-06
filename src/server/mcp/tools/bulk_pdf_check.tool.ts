import * as path from "node:path";

import {
  PdfTextExtractor,
  ExtractedTextEntry,
} from "../../modules/extract_text_from_pdf";
import { checks, ComplianceResult } from "../../modules/checks";
import type {
  PdfCheckRequest,
  BulkPdfCheckResponse,
  SinglePdfResult,
  ComplianceCheckResult,
} from "../types";

/**
 * Service class for bulk PDF compliance checking.
 * Orchestrates PDF text extraction and compliance verification.
 */
export class BulkPdfCheckService {
  private readonly pdfExtractor: PdfTextExtractor;

  constructor(pdfExtractor?: PdfTextExtractor) {
    this.pdfExtractor = pdfExtractor ?? new PdfTextExtractor();
  }

  /**
   * Process multiple PDFs and run compliance checks on each.
   */
  async execute(request: PdfCheckRequest): Promise<BulkPdfCheckResponse> {
    const results: SinglePdfResult[] = [];
    let successCount = 0;
    let errorCount = 0;

    for (const pdfPath of request.pdfPaths) {
      const result = await this.processSinglePdf(pdfPath);
      results.push(result);

      if (result.status === "success") {
        successCount += 1;
      } else {
        errorCount += 1;
      }
    }

    return {
      totalProcessed: request.pdfPaths.length,
      successCount,
      errorCount,
      results,
    };
  }

  /**
   * Process a single PDF: extract text and run compliance checks.
   */
  private async processSinglePdf(pdfPath: string): Promise<SinglePdfResult> {
    const fileName = path.basename(pdfPath);

    try {
      const textEntries = await this.extractTextFromPdf(pdfPath);
      const complianceResults = await this.runComplianceChecks(textEntries);

      return {
        pdfPath,
        fileName,
        status: "success",
        complianceResults: this.mapComplianceResults(complianceResults),
      };
    } catch (error) {
      return {
        pdfPath,
        fileName,
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error occurred",
        complianceResults: [],
      };
    }
  }

  /**
   * Extract text content from a PDF file.
   */
  private async extractTextFromPdf(
    pdfPath: string
  ): Promise<ExtractedTextEntry[]> {
    return this.pdfExtractor.extract(pdfPath);
  }

  /**
   * Run compliance checks on extracted text entries.
   */
  private async runComplianceChecks(
    textEntries: ExtractedTextEntry[]
  ): Promise<ComplianceResult[]> {
    return checks(textEntries);
  }

  /**
   * Map internal ComplianceResult to MCP response format.
   */
  private mapComplianceResults(
    results: ComplianceResult[]
  ): ComplianceCheckResult[] {
    return results.map((result) => ({
      name: result.name,
      value: result.value,
      isCompliant: result.isCheck,
      description: result.description,
      sources: result.sources.map((source) => ({
        id: source.id,
        title: source.title,
        url: source.url,
        excerpt: source.excerpt,
      })),
    }));
  }
}

export const bulkPdfCheckService = new BulkPdfCheckService();

