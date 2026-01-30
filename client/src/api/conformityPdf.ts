import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_URL || "";

// ========================================
// Types
// ========================================

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
  sampleType: string;
}

export interface ComplianceResult {
  name: string;
  value: string;
  isCheck: boolean | null; // true = conforme, false = non conforme, null = da confermare
  description: string;
  sources: Source[];
  matrix: ComplianceResultMatrix;
}

export interface PdfCheckResult {
  fileName: string;
  success: boolean;
  results: ComplianceResult[];
  error?: string;
}

export interface ConformityPdfResponse {
  totalFiles: number;
  jobIds?: string[];
  message?: string;
  processedFiles?: number;
  results?: PdfCheckResult[];
}

export interface JobStatusResponse {
  jobId: string;
  state: string;
  progress?: number;
  result?: PdfCheckResult;
  error?: string;
}

// ========================================
// API
// ========================================

// ========================================
// PDF Extraction Types
// ========================================

export interface ExtractedTextEntry {
  resource: string;
  word_number: number;
  letter_number: number;
  text_extracted: string;
}

export interface MatrixExtractionResult {
  matrix: string;
  description: string | null;
  product: string | null;
  category: "food" | "beverage" | "other";
  ceirsa_category: string | null;
  specialFeatures: string[];
  sampleType: string;
}

export interface Analyses {
  parameter: string;
  result: string;
  um_result: string;
  method: string;
}

export interface ExtractedData {
  textObjects: ExtractedTextEntry[];
  matrix: MatrixExtractionResult | null;
  analyses: Analyses[];
  results: ComplianceResult[];
  metadata: {
    extractedAt: string;
    totalTextEntries: number;
    totalAnalyses: number;
    totalResults: number;
  };
}

export interface PdfExtraction {
  id: string;
  fileName: string;
  createdAt: string;
  updatedAt: string;
  success: boolean;
  error: string | null;
  extractedData: ExtractedData;
}

export interface PdfExtractionsResponse {
  total: number;
  limit: number;
  offset: number;
  extractions: PdfExtraction[];
}

// ========================================
// API
// ========================================

export const conformityApi = {
  /**
   * Upload PDF files for compliance checking.
   * Returns job IDs that can be used to track processing status.
   * The AI will automatically categorize and check each document.
   */
  checkPdfs: async (
    files: File[],
    onProgress?: (progress: number) => void
  ): Promise<ConformityPdfResponse> => {
    const formData = new FormData();
    
    files.forEach((file) => {
      formData.append("files", file);
    });

    const response = await axios.post<ConformityPdfResponse>(
      `${API_BASE_URL}/conformity-pdf`,
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data",
        },
        onUploadProgress: (progressEvent) => {
          if (onProgress && progressEvent.total) {
            const progress = Math.round(
              (progressEvent.loaded * 100) / progressEvent.total
            );
            onProgress(progress);
          }
        },
      }
    );

    return response.data;
  },

  /**
   * Get the status of a PDF processing job.
   */
  getJobStatus: async (jobId: string): Promise<JobStatusResponse> => {
    const response = await axios.get<JobStatusResponse>(
      `${API_BASE_URL}/conformity-pdf/jobs/${jobId}`
    );

    return response.data;
  },

  /**
   * Get all PDF extractions from database.
   */
  getExtractions: async (
    limit: number = 50,
    offset: number = 0
  ): Promise<PdfExtractionsResponse> => {
    const response = await axios.get<PdfExtractionsResponse>(
      `${API_BASE_URL}/conformity-pdf/extractions`,
      {
        params: { limit, offset },
      }
    );

    return response.data;
  },

  /**
   * Get a specific PDF extraction by ID.
   */
  getExtractionById: async (id: string): Promise<PdfExtraction> => {
    const response = await axios.get<PdfExtraction>(
      `${API_BASE_URL}/conformity-pdf/extractions/${id}`
    );

    return response.data;
  },

  /**
   * Reprocess an existing extraction using forced OCR.
   * Requires re-uploading the PDF file.
   * Returns a job ID that can be used to track processing status.
   */
  reprocessWithOcr: async (
    extractionId: string,
    file: File
  ): Promise<{ jobId: string; message: string }> => {
    const formData = new FormData();
    formData.append("files", file);

    const response = await axios.post<{ jobId: string; message: string }>(
      `${API_BASE_URL}/conformity-pdf/extractions/${extractionId}/reprocess`,
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      }
    );

    return response.data;
  },
};

