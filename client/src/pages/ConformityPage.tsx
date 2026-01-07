import { useState } from "react";
import { Info, X, Database, Upload } from "lucide-react";
import { PdfDropZone } from "../components/PdfDropZone";
import { ResultsDisplay } from "../components/ResultsDisplay";
import { ExtractionsList } from "../components/ExtractionsList";
import {
  conformityApi,
  type ConformityPdfResponse,
} from "../api/conformityPdf";

interface ConformityPageProps {
  onNavigateToCustomChecks: () => void;
}

type ViewMode = "upload" | "extractions";

export function ConformityPage({
  onNavigateToCustomChecks: _onNavigateToCustomChecks,
}: ConformityPageProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ConformityPdfResponse | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("upload");

  const handleFilesSelected = async (files: File[]) => {
    try {
      setIsLoading(true);
      setError(null);

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
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setResults(null);
    setError(null);
  };

  // If we have results, show them
  if (results) {
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
