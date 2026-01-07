import { useState, useEffect } from "react";
import {
  FileText,
  Calendar,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Database,
} from "lucide-react";
import { conformityApi, type PdfExtraction } from "../api/conformityPdf";
import { ResultsDisplay } from "./ResultsDisplay";
import type { ConformityPdfResponse } from "../api/conformityPdf";

interface ExtractionsListProps {
  onSelectExtraction?: (extraction: PdfExtraction) => void;
}

export function ExtractionsList({ onSelectExtraction }: ExtractionsListProps) {
  const [extractions, setExtractions] = useState<PdfExtraction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedExtraction, setSelectedExtraction] = useState<PdfExtraction | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const loadExtractions = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await conformityApi.getExtractions(50, 0);
      setExtractions(response.extractions);
    } catch (err) {
      console.error("Error loading extractions:", err);
      setError("Errore nel caricamento delle estrazioni salvate");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadExtractions();
  }, []);

  const toggleExpand = (id: string) => {
    const newExpanded = new Set(expandedIds);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedIds(newExpanded);
  };

  const handleSelectExtraction = (extraction: PdfExtraction) => {
    setSelectedExtraction(extraction);
    if (onSelectExtraction) {
      onSelectExtraction(extraction);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (selectedExtraction) {
    // Convert extraction to ConformityPdfResponse format for ResultsDisplay
    const response: ConformityPdfResponse = {
      totalFiles: 1,
      processedFiles: selectedExtraction.success ? 1 : 0,
      results: [
        {
          fileName: selectedExtraction.fileName,
          success: selectedExtraction.success,
          results: selectedExtraction.extractedData.results || [],
          error: selectedExtraction.error || undefined,
        },
      ],
    };

    const data = selectedExtraction.extractedData;

    return (
      <div className="extractions-list">
        <div className="extraction-header">
          <button
            className="btn-secondary"
            onClick={() => setSelectedExtraction(null)}
          >
            ← Torna alla lista
          </button>
          <h2>{selectedExtraction.fileName}</h2>
          <span className="extraction-date">
            <Calendar size={16} />
            {formatDate(selectedExtraction.createdAt)}
          </span>
        </div>

        {/* Dati di Estrazione */}
        {selectedExtraction.success && (
          <div className="extraction-details-section">
            <h3>📊 Dati di Estrazione</h3>
            
            {data.matrix && (
              <div className="extraction-info-card">
                <h4>Informazioni Matrice</h4>
                <div className="info-grid">
                  <div className="info-item">
                    <span className="label">Matrice:</span>
                    <span className="value">{data.matrix.matrix}</span>
                  </div>
                  {data.matrix.description && (
                    <div className="info-item">
                      <span className="label">Descrizione:</span>
                      <span className="value">{data.matrix.description}</span>
                    </div>
                  )}
                  {data.matrix.product && (
                    <div className="info-item">
                      <span className="label">Prodotto:</span>
                      <span className="value">{data.matrix.product}</span>
                    </div>
                  )}
                  <div className="info-item">
                    <span className="label">Categoria:</span>
                    <span className="value">{data.matrix.category}</span>
                  </div>
                  <div className="info-item">
                    <span className="label">Tipo Campione:</span>
                    <span className="value">{data.matrix.sampleType}</span>
                  </div>
                  {data.matrix.ceirsa_category && (
                    <div className="info-item">
                      <span className="label">Categoria CEIRSA:</span>
                      <span className="value">{data.matrix.ceirsa_category}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {data.analyses && data.analyses.length > 0 && (
              <div className="extraction-info-card">
                <h4>Analisi Estratte ({data.analyses.length})</h4>
                <div className="analyses-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Parametro</th>
                        <th>Risultato</th>
                        <th>U.M.</th>
                        <th>Metodo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.analyses.map((analysis, idx) => (
                        <tr key={idx}>
                          <td>{analysis.parameter}</td>
                          <td><strong>{analysis.result}</strong></td>
                          <td>{analysis.um_result}</td>
                          <td>{analysis.method}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {data.metadata && (
              <div className="extraction-info-card metadata">
                <h4>Metadata Estrazione</h4>
                <div className="info-grid">
                  <div className="info-item">
                    <span className="label">Data Estrazione:</span>
                    <span className="value">{formatDate(data.metadata.extractedAt)}</span>
                  </div>
                  <div className="info-item">
                    <span className="label">Totale Analisi:</span>
                    <span className="value">{data.metadata.totalAnalyses}</span>
                  </div>
                  <div className="info-item">
                    <span className="label">Totale Risultati:</span>
                    <span className="value">{data.metadata.totalResults}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <ResultsDisplay
          response={response}
          onReset={() => setSelectedExtraction(null)}
        />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="extractions-list loading">
        <RefreshCw size={24} className="spinning" />
        <p>Caricamento estrazioni...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="extractions-list error">
        <XCircle size={24} />
        <p>{error}</p>
        <button className="btn-secondary" onClick={loadExtractions}>
          Riprova
        </button>
      </div>
    );
  }

  if (extractions.length === 0) {
    return (
      <div className="extractions-list empty">
        <Database size={48} />
        <h3>Nessuna estrazione salvata</h3>
        <p>Le estrazioni dei PDF verranno salvate automaticamente qui.</p>
      </div>
    );
  }

  return (
    <div className="extractions-list">
      <div className="extractions-header">
        <h2>
          <Database size={24} />
          Estrazioni Salvate ({extractions.length})
        </h2>
        <button className="btn-icon" onClick={loadExtractions} title="Aggiorna">
          <RefreshCw size={20} />
        </button>
      </div>

      <div className="extractions-grid">
        {extractions.map((extraction) => {
          const isExpanded = expandedIds.has(extraction.id);
          const data = extraction.extractedData;
          const passCount = data.results?.filter((r) => r.isCheck).length || 0;
          const failCount = data.results?.filter((r) => !r.isCheck).length || 0;

          return (
            <div
              key={extraction.id}
              className={`extraction-card ${extraction.success ? "success" : "error"}`}
            >
              <div
                className="extraction-card-header"
                onClick={() => toggleExpand(extraction.id)}
              >
                <div className="extraction-card-info">
                  <FileText size={20} />
                  <div>
                    <h3>{extraction.fileName}</h3>
                    <div className="extraction-meta">
                      <span className="extraction-date">
                        <Calendar size={14} />
                        {formatDate(extraction.createdAt)}
                      </span>
                      {extraction.success && (
                        <>
                          <span className="extraction-stat pass">
                            <CheckCircle2 size={12} />
                            {passCount}
                          </span>
                          <span className="extraction-stat fail">
                            <XCircle size={12} />
                            {failCount}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <button className="btn-icon">
                  {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </button>
              </div>

              {isExpanded && (
                <div className="extraction-card-details">
                  {extraction.success ? (
                    <>
                      {data.matrix && (
                        <div className="extraction-section">
                          <h4>Matrice</h4>
                          <div className="extraction-matrix">
                            <div className="matrix-item">
                              <span className="label">Matrice:</span>
                              <span className="value">{data.matrix.matrix}</span>
                            </div>
                            {data.matrix.product && (
                              <div className="matrix-item">
                                <span className="label">Prodotto:</span>
                                <span className="value">{data.matrix.product}</span>
                              </div>
                            )}
                            {data.matrix.ceirsa_category && (
                              <div className="matrix-item">
                                <span className="label">Categoria CEIRSA:</span>
                                <span className="value">{data.matrix.ceirsa_category}</span>
                              </div>
                            )}
                            <div className="matrix-item">
                              <span className="label">Tipo:</span>
                              <span className="value">{data.matrix.sampleType}</span>
                            </div>
                          </div>
                        </div>
                      )}

                      {data.analyses && data.analyses.length > 0 && (
                        <div className="extraction-section">
                          <h4>Analisi Estratte ({data.analyses.length})</h4>
                          <div className="extraction-analyses">
                            {data.analyses.slice(0, 5).map((analysis, idx) => (
                              <div key={idx} className="analysis-item">
                                <span className="analysis-param">{analysis.parameter}</span>
                                <span className="analysis-result">
                                  {analysis.result} {analysis.um_result}
                                </span>
                              </div>
                            ))}
                            {data.analyses.length > 5 && (
                              <div className="analysis-more">
                                +{data.analyses.length - 5} altre analisi
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {data.results && data.results.length > 0 && (
                        <div className="extraction-section">
                          <h4>Risultati Conformità ({data.results.length})</h4>
                          <div className="extraction-results-summary">
                            <span className="summary-stat pass">
                              <CheckCircle2 size={14} />
                              {passCount} conformi
                            </span>
                            <span className="summary-stat fail">
                              <XCircle size={14} />
                              {failCount} non conformi
                            </span>
                          </div>
                        </div>
                      )}

                      <button
                        className="btn-primary"
                        onClick={() => handleSelectExtraction(extraction)}
                      >
                        Visualizza Dettagli Completi
                      </button>
                    </>
                  ) : (
                    <div className="extraction-error">
                      <XCircle size={20} />
                      <p>{extraction.error || "Errore durante l'estrazione"}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

