/**
 * MCP Types for PDF Bulk Analysis
 */

export interface PdfCheckRequest {
  /** List of PDF file paths to analyze */
  pdfPaths: string[];
}

export interface AnalysisSource {
  id: string;
  title: string;
  url: string | null;
  excerpt: string;
}

export interface SinglePdfResult {
  pdfPath: string;
  fileName: string;
  status: "success" | "error";
  error?: string;
  complianceResults: ComplianceCheckResult[];
}

export interface ComplianceCheckResult {
  name: string;
  value: string;
  isCompliant: boolean | null; // true = conforme, false = non conforme, null = da confermare
  description: string;
  sources: AnalysisSource[];
}

export interface BulkPdfCheckResponse {
  totalProcessed: number;
  successCount: number;
  errorCount: number;
  results: SinglePdfResult[];
}
