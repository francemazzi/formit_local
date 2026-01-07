import { useState, useEffect, useRef } from "react";
import { Info, X, Database, Upload, Loader2 } from "lucide-react";
import { PdfDropZone } from "../components/PdfDropZone";
import { ResultsDisplay } from "../components/ResultsDisplay";
import { ExtractionsList } from "../components/ExtractionsList";
import {
  conformityApi,
  type ConformityPdfResponse,
  type JobStatusResponse,
  type PdfCheckResult,
} from "../api/conformityPdf";

interface ConformityPageProps {
  onNavigateToCustomChecks: () => void;
}

type ViewMode = "upload" | "extractions";

export function ConformityPage({
  onNavigateToCustomChecks: _onNavigateToCustomChecks,
}: ConformityPageProps) {
  // Suppress unused parameter warning
  void _onNavigateToCustomChecks;
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ConformityPdfResponse | null>(null);
  const [jobStatuses, setJobStatuses] = useState<
    Map<string, JobStatusResponse>
  >(new Map());
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("upload");
  const pollingIntervalRef = useRef<number | null>(null);

  const pollJobStatus = async (jobId: string) => {
    try {
      const status = await conformityApi.getJobStatus(jobId);
      setJobStatuses((prev) => {
        const next = new Map(prev);
        next.set(jobId, status);
        return next;
      });

      // If job is completed or failed, check if all jobs are done
      if (status.state === "completed" || status.state === "failed") {
        return status;
      }
      return null;
    } catch (err) {
      console.error(`Error polling job ${jobId}:`, err);
      return null;
    }
  };

  const stopPolling = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  };

  useEffect(() => {
    if (results?.jobIds && results.jobIds.length > 0) {
      // Start polling for all jobs
      const pollAllJobs = async () => {
        const jobIds = results.jobIds!; // Safe because we checked above
        const jobPromises = jobIds.map((jobId) => pollJobStatus(jobId));
        await Promise.all(jobPromises);
      };

      // Poll immediately
      pollAllJobs();

      // Then poll every 2 seconds
      pollingIntervalRef.current = window.setInterval(pollAllJobs, 2000);

      return () => {
        stopPolling();
      };
    }
  }, [results?.jobIds]);

  // Check if all jobs are completed and convert to results format
  useEffect(() => {
    if (results?.jobIds && jobStatuses.size > 0) {
      const allCompleted = results.jobIds.every((jobId) => {
        const status = jobStatuses.get(jobId);
        return (
          status && (status.state === "completed" || status.state === "failed")
        );
      });

      if (allCompleted) {
        stopPolling();

        // Convert job results to ConformityPdfResponse format
        const pdfResults: PdfCheckResult[] = results.jobIds.map((jobId) => {
          const status = jobStatuses.get(jobId);
          if (status?.result) {
            return {
              fileName: status.result.fileName,
              success: status.result.success,
              results: status.result.results || [],
              error: status.result.error,
            };
          }
          return {
            fileName: `Job ${jobId}`,
            success: false,
            results: [],
            error: status?.error || "Unknown error",
          };
        });

        const processedCount = pdfResults.filter((r) => r.success).length;

        // Use setTimeout to avoid calling setState synchronously in effect
        setTimeout(() => {
          setIsLoading(false);
          setResults({
            totalFiles: results.totalFiles,
            processedFiles: processedCount,
            results: pdfResults,
          } as ConformityPdfResponse);
        }, 0);
      }
    }
  }, [jobStatuses, results]);

  const handleFilesSelected = async (files: File[]) => {
    try {
      setIsLoading(true);
      setError(null);
      setJobStatuses(new Map());

      const response = await conformityApi.checkPdfs(files);
      setResults(response);
    } catch (err: unknown) {
      console.error("Error checking PDFs:", err);
      const errorMessage =
        (err as { response?: { data?: { error?: string } }; message?: string })
          .response?.data?.error ||
        (err as { message?: string }).message ||
        "Errore durante l'analisi dei documenti";
      setError(errorMessage);
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    stopPolling();
    setResults(null);
    setError(null);
    setJobStatuses(new Map());
  };

  // Show processing status if jobs are in progress
  const hasActiveJobs =
    results?.jobIds &&
    results.jobIds.length > 0 &&
    results.jobIds.some((jobId) => {
      const status = jobStatuses.get(jobId);
      return (
        !status || (status.state !== "completed" && status.state !== "failed")
      );
    });

  // If we have results with processedFiles (old format or converted), show them
  if (
    results &&
    "processedFiles" in results &&
    results.processedFiles !== undefined
  ) {
    return (
      <div className="conformity-page">
        {error && (
          <div className="error-banner">
            <span>{error}</span>
            <button onClick={() => setError(null)}>×</button>
          </div>
        )}

        <main className="page-content">
          <ResultsDisplay response={results} onReset={handleReset} />
        </main>
      </div>
    );
  }

  return (
    <div className="conformity-page">
      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      <main className="page-content">
        {/* Tab Navigation */}
        <div className="view-tabs">
          <button
            className={`view-tab ${viewMode === "upload" ? "active" : ""}`}
            onClick={() => setViewMode("upload")}
          >
            <Upload size={18} />
            Carica PDF
          </button>
          <button
            className={`view-tab ${viewMode === "extractions" ? "active" : ""}`}
            onClick={() => setViewMode("extractions")}
          >
            <Database size={18} />
            Estrazioni Salvate
          </button>
        </div>

        {viewMode === "upload" ? (
          <>
            {!results && (
              <button
                className="info-button"
                onClick={() => setIsDrawerOpen(true)}
                aria-label="Informazioni"
              >
                <Info size={20} />
              </button>
            )}

            <div className="upload-section">
              {hasActiveJobs && results.jobIds && (
                <div className="processing-status">
                  <Loader2 size={20} className="spinning" />
                  <div>
                    <h3>Elaborazione in corso...</h3>
                    <div className="job-status-list">
                      {results.jobIds.map((jobId) => {
                        const status = jobStatuses.get(jobId);
                        const progress = status?.progress || 0;
                        return (
                          <div key={jobId} className="job-status-item">
                            <div className="job-progress-bar">
                              <div
                                className="job-progress-fill"
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                            <span className="job-status-text">
                              {status?.state === "waiting" && "In attesa..."}
                              {status?.state === "active" &&
                                `Elaborazione... ${progress}%`}
                              {status?.state === "completed" && "✓ Completato"}
                              {status?.state === "failed" && "✗ Errore"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
              <PdfDropZone
                onFilesSelected={handleFilesSelected}
                isLoading={isLoading}
                maxFiles={10}
              />

              <div className="supported-categories">
                <h3>Categorie Supportate</h3>
                <div className="categories-list">
                  <span className="category-tag">🍕 Alimenti CEIRSA</span>
                  <span className="category-tag">🥤 Bevande</span>
                  <span className="category-tag">🧪 Tamponi Ambientali</span>
                  <span className="category-tag">🍦 Gelati</span>
                  <span className="category-tag">
                    🥛 Prodotti Lattiero-caseari
                  </span>
                  <span className="category-tag">🍖 Carni</span>
                  <span className="category-tag">🐟 Prodotti Ittici</span>
                </div>
              </div>
            </div>
          </>
        ) : (
          <ExtractionsList
            onSelectExtraction={(extraction) => {
              // Convert extraction to ConformityPdfResponse format
              const response: ConformityPdfResponse = {
                totalFiles: 1,
                processedFiles: extraction.success ? 1 : 0,
                results: [
                  {
                    fileName: extraction.fileName,
                    success: extraction.success,
                    results: extraction.extractedData.results || [],
                    error: extraction.error || undefined,
                  },
                ],
              };
              setResults(response);
              setViewMode("upload");
            }}
          />
        )}
      </main>

      {/* Drawer */}
      {isDrawerOpen && (
        <>
          <div
            className="drawer-overlay"
            onClick={() => setIsDrawerOpen(false)}
          />
          <div className="drawer">
            <div className="drawer-header">
              <h2>Come funziona</h2>
              <button
                className="btn-icon"
                onClick={() => setIsDrawerOpen(false)}
                aria-label="Chiudi"
              >
                <X size={20} />
              </button>
            </div>
            <div className="drawer-content">
              <div className="info-steps">
                <div className="info-step">
                  <span className="step-number">1</span>
                  <div>
                    <h4>Carica i PDF</h4>
                    <p>
                      Trascina o seleziona i documenti di analisi
                      microbiologiche
                    </p>
                  </div>
                </div>
                <div className="info-step">
                  <span className="step-number">2</span>
                  <div>
                    <h4>Analisi AI</h4>
                    <p>
                      L'intelligenza artificiale estrae e categorizza i dati
                    </p>
                  </div>
                </div>
                <div className="info-step">
                  <span className="step-number">3</span>
                  <div>
                    <h4>Verifica Conformità</h4>
                    <p>
                      Confronto automatico con limiti CEIRSA e normative bevande
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
