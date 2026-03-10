import { useState } from "react";
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  FileText,
  ExternalLink,
  Info,
  Cpu,
} from "lucide-react";
import type {
  ConformityPdfResponse,
  PdfCheckResult,
  ComplianceResult,
} from "../api/conformityPdf";

interface ResultsDisplayProps {
  response: ConformityPdfResponse;
  onReset: () => void;
  /** When viewing a saved extraction, use e.g. "Torna alla lista" instead of "Nuova Analisi" */
  resetButtonLabel?: string;
  /** Label of the AI provider used for this analysis */
  providerLabel?: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  food: "🍕 Alimento",
  beverage: "🥤 Bevanda",
  other: "📦 Altro",
};

function ComplianceResultCard({ result }: { result: ComplianceResult }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const getStatusClass = () => {
    if (result.isCheck === true) return "pass";
    if (result.isCheck === false) return "fail";
    return "pending"; // null = da confermare
  };

  const getStatusIcon = () => {
    if (result.isCheck === true)
      return <CheckCircle2 size={24} className="icon-pass" />;
    if (result.isCheck === false)
      return <XCircle size={24} className="icon-fail" />;
    return <AlertCircle size={24} className="icon-pending" />; // null = da confermare
  };

  return (
    <div className={`compliance-result ${getStatusClass()}`}>
      <div className="result-header" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="result-status">{getStatusIcon()}</div>
        <div className="result-main">
          <h4>{result.name}</h4>
          <div className="result-meta">
            <span className="result-value">{result.value}</span>
            {result.matrix.ceirsaCategory && (
              <span className="result-category">
                {result.matrix.ceirsaCategory}
              </span>
            )}
          </div>
        </div>
        <button className="btn-icon">
          {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </button>
      </div>

      {isExpanded && (
        <div className="result-details">
          <div className="result-description">
            <Info size={16} />
            <p>{result.description}</p>
          </div>

          <div className="result-matrix-info">
            <h5>Informazioni Matrice</h5>
            <div className="matrix-grid">
              <div className="matrix-item">
                <span className="label">Matrice:</span>
                <span className="value">{result.matrix.matrix}</span>
              </div>
              {result.matrix.product && (
                <div className="matrix-item">
                  <span className="label">Prodotto:</span>
                  <span className="value">{result.matrix.product}</span>
                </div>
              )}
              <div className="matrix-item">
                <span className="label">Categoria:</span>
                <span className="value">
                  {CATEGORY_LABELS[result.matrix.category] ||
                    result.matrix.category}
                </span>
              </div>
              <div className="matrix-item">
                <span className="label">Tipo Campione:</span>
                <span className="value">{result.matrix.sampleType}</span>
              </div>
            </div>
          </div>

          {result.sources.length > 0 && (
            <div className="result-sources">
              <h5>Fonti Normative</h5>
              {result.sources.map((source, idx) => (
                <div key={idx} className="source-item">
                  <div className="source-header">
                    <span className="source-title">{source.title}</span>
                    {source.url && (
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="source-link"
                      >
                        <ExternalLink size={14} />
                      </a>
                    )}
                  </div>
                  <p className="source-excerpt">{source.excerpt}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FileResultCard({ fileResult }: { fileResult: PdfCheckResult }) {
  const [isExpanded, setIsExpanded] = useState(true);

  const passCount = fileResult.results.filter((r) => r.isCheck === true).length;
  const failCount = fileResult.results.filter(
    (r) => r.isCheck === false,
  ).length;
  const pendingCount = fileResult.results.filter(
    (r) => r.isCheck === null,
  ).length;
  const totalChecks = fileResult.results.length;

  return (
    <div className={`file-result-card ${!fileResult.success ? "error" : ""}`}>
      <div
        className="file-result-header"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="file-info">
          <FileText size={24} />
          <div>
            <h3>{fileResult.fileName}</h3>
            {fileResult.success ? (
              <div className="file-stats">
                <span className="stat pass">
                  <CheckCircle2 size={14} />
                  {passCount} conforme
                </span>
                <span className="stat fail">
                  <XCircle size={14} />
                  {failCount} non conforme
                </span>
                {pendingCount > 0 && (
                  <span className="stat pending">
                    <AlertCircle size={14} />
                    {pendingCount} da confermare
                  </span>
                )}
                <span className="stat total">{totalChecks} verifiche</span>
              </div>
            ) : (
              <span className="file-error">Errore: {fileResult.error}</span>
            )}
          </div>
        </div>
        <button className="btn-icon">
          {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </button>
      </div>

      {isExpanded && fileResult.success && (
        <div className="file-results-list">
          {fileResult.results.length === 0 ? (
            <div className="no-results">
              <AlertCircle size={24} />
              <p>
                Nessuna verifica applicabile. Il documento potrebbe non
                rientrare nelle categorie CEIRSA o bevande supportate.
              </p>
              {fileResult.diagnostics && (
                <div className="diagnostics-info" style={{ marginTop: '12px', padding: '12px', background: 'var(--bg-secondary, #1a1a2e)', borderRadius: '8px', fontSize: '0.85em', textAlign: 'left' }}>
                  <p style={{ fontWeight: 600, marginBottom: '8px' }}>Diagnostica:</p>
                  {fileResult.diagnostics.summary && (
                    <p style={{ marginBottom: '6px' }}>{fileResult.diagnostics.summary}</p>
                  )}
                  {fileResult.diagnostics.matrixDetected && (
                    <p style={{ marginBottom: '4px' }}>
                      Matrice: <strong>{fileResult.diagnostics.matrixDetected.matrix}</strong> |
                      Categoria: <strong>{fileResult.diagnostics.matrixDetected.category}</strong> |
                      Tipo: <strong>{fileResult.diagnostics.matrixDetected.sampleType}</strong>
                      {fileResult.diagnostics.matrixDetected.product && (
                        <> | Prodotto: <strong>{fileResult.diagnostics.matrixDetected.product}</strong></>
                      )}
                    </p>
                  )}
                  {fileResult.diagnostics.analysesCount !== undefined && (
                    <p style={{ marginBottom: '4px' }}>
                      Analisi estratte: <strong>{fileResult.diagnostics.analysesCount}</strong>
                      {fileResult.diagnostics.analysesParameters && fileResult.diagnostics.analysesParameters.length > 0 && (
                        <> ({fileResult.diagnostics.analysesParameters.join(', ')})</>
                      )}
                    </p>
                  )}
                  {fileResult.diagnostics.checkPathsAttempted && fileResult.diagnostics.checkPathsAttempted.length > 0 && (
                    <p style={{ marginBottom: '4px' }}>
                      Controlli tentati: {fileResult.diagnostics.checkPathsAttempted.join(' → ')}
                    </p>
                  )}
                  {fileResult.diagnostics.usedOcrFallback && (
                    <p>OCR Vision utilizzato come fallback</p>
                  )}
                </div>
              )}
            </div>
          ) : (
            fileResult.results.map((result, idx) => (
              <ComplianceResultCard key={idx} result={result} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function ResultsDisplay({
  response,
  onReset,
  resetButtonLabel = "Nuova Analisi",
  providerLabel,
}: ResultsDisplayProps) {
  const results = response.results || [];

  const totalPass = results.reduce(
    (sum, file) => sum + file.results.filter((r) => r.isCheck === true).length,
    0,
  );
  const totalFail = results.reduce(
    (sum, file) => sum + file.results.filter((r) => r.isCheck === false).length,
    0,
  );
  const totalPending = results.reduce(
    (sum, file) => sum + file.results.filter((r) => r.isCheck === null).length,
    0,
  );
  const totalChecks = totalPass + totalFail + totalPending;

  return (
    <div className="results-display">
      {/* Summary Header */}
      <div className="results-summary">
        <div className="summary-stats">
          <div className="summary-stat">
            <span className="stat-value">{response.totalFiles}</span>
            <span className="stat-label">File Analizzati</span>
          </div>
          <div className="summary-stat">
            <span className="stat-value">{totalChecks}</span>
            <span className="stat-label">Verifiche Totali</span>
          </div>
          <div className="summary-stat pass">
            <span className="stat-value">{totalPass}</span>
            <span className="stat-label">Conformi</span>
          </div>
          <div className="summary-stat fail">
            <span className="stat-value">{totalFail}</span>
            <span className="stat-label">Non Conformi</span>
          </div>
          {totalPending > 0 && (
            <div className="summary-stat pending">
              <span className="stat-value">{totalPending}</span>
              <span className="stat-label">Da Confermare</span>
            </div>
          )}
        </div>

        <button
          className={
            resetButtonLabel === "Nuova Analisi"
              ? "btn-secondary"
              : "btn-primary results-back-btn"
          }
          onClick={onReset}
        >
          {resetButtonLabel !== "Nuova Analisi" && <ChevronLeft size={18} />}
          {resetButtonLabel}
        </button>
      </div>

      {/* Provider info */}
      {providerLabel && (
        <div className="results-provider-info">
          <Cpu size={14} />
          <span>Analizzato con: <strong>{providerLabel}</strong></span>
        </div>
      )}

      {/* Results List */}
      <div className="results-list">
        {results.map((fileResult, idx) => (
          <FileResultCard key={idx} fileResult={fileResult} />
        ))}
      </div>
    </div>
  );
}
