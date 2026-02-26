import { useState } from "react";
import { X, RefreshCw, Loader2, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import {
  conformityApi,
  type PdfExtraction,
  type Analyses,
  type ComplianceResult,
} from "../api/conformityPdf";
import { PdfViewer } from "./PdfViewer";

interface AnalysisViewProps {
  extraction: PdfExtraction;
  onClose: () => void;
  onExtractionUpdated: (updated: PdfExtraction) => void;
}

export function AnalysisView({
  extraction,
  onClose,
  onExtractionUpdated,
}: AnalysisViewProps) {
  const data = extraction.extractedData;
  const [analyses, setAnalyses] = useState<Analyses[]>(data.analyses || []);
  const [results, setResults] = useState<ComplianceResult[]>(data.results || []);
  const [isRechecking, setIsRechecking] = useState(false);
  const [recheckError, setRecheckError] = useState<string | null>(null);
  const [recheckSuccess, setRecheckSuccess] = useState(false);
  const [isSavingAnalyses, setIsSavingAnalyses] = useState(false);

  const matrix = data.matrix;

  const handleAnalysisChange = (
    index: number,
    field: keyof Analyses,
    value: string
  ) => {
    setAnalyses((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
    setRecheckSuccess(false);
  };

  const handleSaveAnalyses = async () => {
    setIsSavingAnalyses(true);
    try {
      const updated = await conformityApi.updateExtraction(extraction.id, {
        extractedData: { analyses },
      });
      onExtractionUpdated(updated);
    } catch {
      // Silent - save is best-effort before recheck
    } finally {
      setIsSavingAnalyses(false);
    }
  };

  const handleRecheck = async () => {
    setIsRechecking(true);
    setRecheckError(null);
    setRecheckSuccess(false);

    try {
      // Save edited analyses first
      await handleSaveAnalyses();

      const response = await conformityApi.recheckExtraction(extraction.id, {
        analyses,
        matrix: matrix || undefined,
      });

      setResults(response.results);
      setRecheckSuccess(true);

      // Update parent with new results
      const refreshed = await conformityApi.getExtractionById(extraction.id);
      onExtractionUpdated(refreshed);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } }).response?.data
          ?.error || "Errore durante il controllo";
      setRecheckError(message);
    } finally {
      setIsRechecking(false);
    }
  };

  const getComplianceIcon = (isCheck: boolean | null) => {
    if (isCheck === true) return <CheckCircle2 size={16} className="compliance-icon conforme" />;
    if (isCheck === false) return <XCircle size={16} className="compliance-icon non-conforme" />;
    return <AlertCircle size={16} className="compliance-icon sospeso" />;
  };

  const getComplianceLabel = (isCheck: boolean | null) => {
    if (isCheck === true) return "Conforme";
    if (isCheck === false) return "Non Conforme";
    return "Da Verificare";
  };

  return (
    <div className="analysis-view">
      <div className="analysis-view-header">
        <div className="analysis-view-title">
          <h2>{extraction.fileName}</h2>
          {matrix && (
            <span className="analysis-view-subtitle">
              {matrix.matrix}
              {matrix.product && ` — ${matrix.product}`}
            </span>
          )}
        </div>
        <button className="btn-icon" onClick={onClose} aria-label="Chiudi">
          <X size={22} />
        </button>
      </div>

      <div className="analysis-view-content">
        {/* Left panel: PDF */}
        <div className="analysis-panel-left">
          <PdfViewer
            extractionId={extraction.id}
            hasPdf={extraction.hasPdf}
            fileName={extraction.fileName}
          />
        </div>

        {/* Right panel: Data + Compliance */}
        <div className="analysis-panel-right">
          {/* Matrix section */}
          {matrix && (
            <div className="analysis-section">
              <h3 className="analysis-section-title">Matrice</h3>
              <div className="analysis-matrix-grid">
                <div className="analysis-field">
                  <span className="analysis-field-label">Matrice</span>
                  <span className="analysis-field-value">{matrix.matrix}</span>
                </div>
                {matrix.product && (
                  <div className="analysis-field">
                    <span className="analysis-field-label">Prodotto</span>
                    <span className="analysis-field-value">{matrix.product}</span>
                  </div>
                )}
                <div className="analysis-field">
                  <span className="analysis-field-label">Categoria</span>
                  <span className="analysis-field-value">
                    {matrix.category === "food"
                      ? "Alimento"
                      : matrix.category === "beverage"
                        ? "Bevanda"
                        : "Altro"}
                  </span>
                </div>
                <div className="analysis-field">
                  <span className="analysis-field-label">Tipo Campione</span>
                  <span className="analysis-field-value">{matrix.sampleType}</span>
                </div>
                {matrix.ceirsa_category && (
                  <div className="analysis-field">
                    <span className="analysis-field-label">CEIRSA</span>
                    <span className="analysis-field-value">{matrix.ceirsa_category}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Analyses section - editable */}
          <div className="analysis-section">
            <div className="analysis-section-header">
              <h3 className="analysis-section-title">Analisi Estratte</h3>
              <span className="analysis-count">{analyses.length} parametri</span>
            </div>

            {analyses.length === 0 ? (
              <p className="analysis-empty">Nessuna analisi estratta</p>
            ) : (
              <div className="editable-analyses-table-wrapper">
                <table className="editable-analyses-table">
                  <thead>
                    <tr>
                      <th>Parametro</th>
                      <th>Risultato</th>
                      <th>U.M.</th>
                      <th>Metodo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analyses.map((analysis, index) => (
                      <tr key={index}>
                        <td>
                          <input
                            type="text"
                            value={analysis.parameter}
                            onChange={(e) =>
                              handleAnalysisChange(index, "parameter", e.target.value)
                            }
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            value={analysis.result}
                            onChange={(e) =>
                              handleAnalysisChange(index, "result", e.target.value)
                            }
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            value={analysis.um_result}
                            onChange={(e) =>
                              handleAnalysisChange(index, "um_result", e.target.value)
                            }
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            value={analysis.method}
                            onChange={(e) =>
                              handleAnalysisChange(index, "method", e.target.value)
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Recheck button */}
            <div className="recheck-actions">
              <button
                className="btn btn-primary recheck-button"
                onClick={handleRecheck}
                disabled={isRechecking || isSavingAnalyses}
              >
                {isRechecking ? (
                  <>
                    <Loader2 size={16} className="spinning" />
                    Controllo in corso...
                  </>
                ) : (
                  <>
                    <RefreshCw size={16} />
                    Effettua Controllo
                  </>
                )}
              </button>
              {recheckError && (
                <div className="recheck-error">{recheckError}</div>
              )}
              {recheckSuccess && (
                <div className="recheck-success">Controllo completato!</div>
              )}
            </div>
          </div>

          {/* Compliance results section */}
          <div className="analysis-section">
            <div className="analysis-section-header">
              <h3 className="analysis-section-title">Risultati Conformit&agrave;</h3>
              <span className="analysis-count">{results.length} verifiche</span>
            </div>

            {results.length === 0 ? (
              <p className="analysis-empty">
                Nessun risultato di conformit&agrave;. Clicca &quot;Effettua Controllo&quot; per verificare.
              </p>
            ) : (
              <div className="compliance-results-list">
                {results.map((result, index) => (
                  <div
                    key={index}
                    className={`compliance-result-card ${
                      result.isCheck === true
                        ? "conforme"
                        : result.isCheck === false
                          ? "non-conforme"
                          : "sospeso"
                    }`}
                  >
                    <div className="compliance-result-header">
                      {getComplianceIcon(result.isCheck)}
                      <span className="compliance-result-name">{result.name}</span>
                      <span className={`compliance-badge ${
                        result.isCheck === true
                          ? "conforme"
                          : result.isCheck === false
                            ? "non-conforme"
                            : "sospeso"
                      }`}>
                        {getComplianceLabel(result.isCheck)}
                      </span>
                    </div>
                    <div className="compliance-result-value">
                      {result.value}
                    </div>
                    {result.description && (
                      <div className="compliance-result-description">
                        {result.description}
                      </div>
                    )}
                    {result.sources && result.sources.length > 0 && (
                      <div className="compliance-result-sources">
                        {result.sources.map((source, sIdx) => (
                          <span key={sIdx} className="compliance-source-tag">
                            {source.title}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
