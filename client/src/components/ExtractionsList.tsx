import { useState, useEffect, useMemo, useRef } from "react";
import {
  FileText,
  Calendar,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  RefreshCw,
  Database,
  Folder,
  FolderOpen,
  Building2,
  RotateCw,
  Upload,
} from "lucide-react";
import { conformityApi, type PdfExtraction } from "../api/conformityPdf";
import { ResultsDisplay } from "./ResultsDisplay";
import type { ConformityPdfResponse } from "../api/conformityPdf";

interface ExtractionsListProps {
  onSelectExtraction?: (extraction: PdfExtraction) => void;
}

interface FolderStructure {
  [date: string]: {
    [company: string]: PdfExtraction[];
  };
}

/**
 * Extracts company name from filename.
 * Filename patterns like: "25LA27785_20250520_Mano op1_Ricetta Italiana srl - My Cooking Box_13052025.pdf"
 * We try to find the company name which is usually before the last date segment.
 */
function extractCompanyName(fileName: string): string {
  // Remove .pdf extension
  const nameWithoutExt = fileName.replace(/\.pdf$/i, "");
  
  // Split by underscore
  const parts = nameWithoutExt.split("_");
  
  if (parts.length >= 4) {
    // Pattern: ID_DATE_Description_Company_Date
    // Try to find company name (usually the second-to-last part or contains common business suffixes)
    for (let i = parts.length - 2; i >= 2; i--) {
      const part = parts[i];
      // Check if this part looks like a company name (contains srl, spa, snc, etc.)
      if (/\b(srl|s\.r\.l|spa|s\.p\.a|snc|sas|di|srls)\b/i.test(part)) {
        return part.trim();
      }
    }
    // If no company suffix found, use the part before the last date-like segment
    for (let i = parts.length - 1; i >= 2; i--) {
      // Check if this looks like a date (only digits)
      if (/^\d{6,8}$/.test(parts[i])) {
        if (i > 0 && parts[i - 1]) {
          return parts[i - 1].trim();
        }
      }
    }
  }
  
  // Fallback: return "Sconosciuta" (Unknown)
  return "Azienda non specificata";
}

/**
 * Formats a date string to Italian date format (DD/MM/YYYY)
 */
function formatDateKey(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/**
 * Groups extractions by date and company
 */
function groupExtractions(extractions: PdfExtraction[]): FolderStructure {
  const structure: FolderStructure = {};
  
  extractions.forEach((extraction) => {
    const dateKey = formatDateKey(extraction.createdAt);
    const companyName = extractCompanyName(extraction.fileName);
    
    if (!structure[dateKey]) {
      structure[dateKey] = {};
    }
    
    if (!structure[dateKey][companyName]) {
      structure[dateKey][companyName] = [];
    }
    
    structure[dateKey][companyName].push(extraction);
  });
  
  return structure;
}

/**
 * Sorts dates in descending order (newest first)
 */
function sortDatesDescending(dates: string[]): string[] {
  return dates.sort((a, b) => {
    const [dayA, monthA, yearA] = a.split("/").map(Number);
    const [dayB, monthB, yearB] = b.split("/").map(Number);
    const dateA = new Date(yearA, monthA - 1, dayA);
    const dateB = new Date(yearB, monthB - 1, dayB);
    return dateB.getTime() - dateA.getTime();
  });
}

export function ExtractionsList({ onSelectExtraction }: ExtractionsListProps) {
  const [extractions, setExtractions] = useState<PdfExtraction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedExtraction, setSelectedExtraction] = useState<PdfExtraction | null>(null);
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const [expandedCompanies, setExpandedCompanies] = useState<Set<string>>(new Set());
  const [expandedExtractions, setExpandedExtractions] = useState<Set<string>>(new Set());
  const [reprocessingId, setReprocessingId] = useState<string | null>(null);
  const [reprocessMessage, setReprocessMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingReprocessId, setPendingReprocessId] = useState<string | null>(null);

  const loadExtractions = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await conformityApi.getExtractions(50, 0);
      setExtractions(response.extractions);
      
      // Auto-expand the most recent date
      if (response.extractions.length > 0) {
        const grouped = groupExtractions(response.extractions);
        const sortedDates = sortDatesDescending(Object.keys(grouped));
        if (sortedDates.length > 0) {
          setExpandedDates(new Set([sortedDates[0]]));
        }
      }
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

  // Memoized folder structure
  const folderStructure = useMemo(() => groupExtractions(extractions), [extractions]);
  const sortedDates = useMemo(() => sortDatesDescending(Object.keys(folderStructure)), [folderStructure]);

  const toggleDate = (date: string) => {
    const newExpanded = new Set(expandedDates);
    if (newExpanded.has(date)) {
      newExpanded.delete(date);
    } else {
      newExpanded.add(date);
    }
    setExpandedDates(newExpanded);
  };

  const toggleCompany = (companyKey: string) => {
    const newExpanded = new Set(expandedCompanies);
    if (newExpanded.has(companyKey)) {
      newExpanded.delete(companyKey);
    } else {
      newExpanded.add(companyKey);
    }
    setExpandedCompanies(newExpanded);
  };

  const toggleExtraction = (id: string) => {
    const newExpanded = new Set(expandedExtractions);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedExtractions(newExpanded);
  };

  const handleSelectExtraction = (extraction: PdfExtraction) => {
    setSelectedExtraction(extraction);
    if (onSelectExtraction) {
      onSelectExtraction(extraction);
    }
  };

  const handleReprocessClick = (extractionId: string) => {
    setPendingReprocessId(extractionId);
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !pendingReprocessId) {
      setPendingReprocessId(null);
      return;
    }

    try {
      setReprocessingId(pendingReprocessId);
      setReprocessMessage(null);
      const result = await conformityApi.reprocessWithOcr(pendingReprocessId, file);
      setReprocessMessage(`Rielaborazione avviata (Job ID: ${result.jobId}). Aggiorna la lista tra qualche secondo.`);

      // Reload extractions after a delay
      setTimeout(() => {
        loadExtractions();
        setReprocessMessage(null);
      }, 5000);
    } catch (err) {
      console.error("Error reprocessing extraction:", err);
      setReprocessMessage("Errore durante la rielaborazione");
    } finally {
      setReprocessingId(null);
      setPendingReprocessId(null);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString("it-IT", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Count totals for a date
  const getDateStats = (date: string) => {
    const companies = folderStructure[date];
    let totalExtractions = 0;
    let totalCompanies = 0;
    
    Object.values(companies).forEach((extractions) => {
      totalCompanies++;
      totalExtractions += extractions.length;
    });
    
    return { totalExtractions, totalCompanies };
  };

  // Count totals for a company
  const getCompanyStats = (extractions: PdfExtraction[]) => {
    const passCount = extractions.reduce((acc, ext) => {
      return acc + (ext.extractedData.results?.filter((r) => r.isCheck).length || 0);
    }, 0);
    const failCount = extractions.reduce((acc, ext) => {
      return acc + (ext.extractedData.results?.filter((r) => !r.isCheck).length || 0);
    }, 0);
    return { passCount, failCount, total: extractions.length };
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
            {formatDateTime(selectedExtraction.createdAt)}
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
                    <span className="value">{formatDateTime(data.metadata.extractedAt)}</span>
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
      {/* Hidden file input for reprocessing */}
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: "none" }}
        accept=".pdf"
        onChange={handleFileSelected}
      />

      {reprocessMessage && (
        <div className="reprocess-message">
          <RefreshCw size={16} className={reprocessingId ? "spinning" : ""} />
          {reprocessMessage}
        </div>
      )}

      <div className="extractions-header">
        <h2>
          <Database size={24} />
          Estrazioni Salvate ({extractions.length})
        </h2>
        <button className="btn-icon" onClick={loadExtractions} title="Aggiorna">
          <RefreshCw size={20} />
        </button>
      </div>

      <div className="folder-tree">
        {sortedDates.map((date) => {
          const isDateExpanded = expandedDates.has(date);
          const dateStats = getDateStats(date);
          const companies = folderStructure[date];
          const sortedCompanies = Object.keys(companies).sort();

          return (
            <div key={date} className="folder-date">
              <div
                className="folder-date-header"
                onClick={() => toggleDate(date)}
              >
                <span className="folder-icon">
                  {isDateExpanded ? <FolderOpen size={20} /> : <Folder size={20} />}
                </span>
                <span className="folder-chevron">
                  {isDateExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </span>
                <Calendar size={16} className="folder-type-icon" />
                <span className="folder-name">{date}</span>
                <span className="folder-stats">
                  <span className="stat-badge companies">
                    <Building2 size={12} />
                    {dateStats.totalCompanies}
                  </span>
                  <span className="stat-badge files">
                    <FileText size={12} />
                    {dateStats.totalExtractions}
                  </span>
                </span>
              </div>

              {isDateExpanded && (
                <div className="folder-date-content">
                  {sortedCompanies.map((company) => {
                    const companyKey = `${date}/${company}`;
                    const isCompanyExpanded = expandedCompanies.has(companyKey);
                    const companyExtractions = companies[company];
                    const companyStats = getCompanyStats(companyExtractions);

                    return (
                      <div key={companyKey} className="folder-company">
                        <div
                          className="folder-company-header"
                          onClick={() => toggleCompany(companyKey)}
                        >
                          <span className="folder-icon">
                            {isCompanyExpanded ? <FolderOpen size={18} /> : <Folder size={18} />}
                          </span>
                          <span className="folder-chevron">
                            {isCompanyExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </span>
                          <Building2 size={14} className="folder-type-icon company" />
                          <span className="folder-name company-name">{company}</span>
                          <span className="folder-stats">
                            <span className="stat-badge files">
                              <FileText size={12} />
                              {companyStats.total}
                            </span>
                            {companyStats.passCount > 0 && (
                              <span className="stat-badge pass">
                                <CheckCircle2 size={12} />
                                {companyStats.passCount}
                              </span>
                            )}
                            {companyStats.failCount > 0 && (
                              <span className="stat-badge fail">
                                <XCircle size={12} />
                                {companyStats.failCount}
                              </span>
                            )}
                          </span>
                        </div>

                        {isCompanyExpanded && (
                          <div className="folder-company-content">
                            {companyExtractions.map((extraction) => {
                              const isExtractionExpanded = expandedExtractions.has(extraction.id);
                              const data = extraction.extractedData;
                              const passCount = data.results?.filter((r) => r.isCheck).length || 0;
                              const failCount = data.results?.filter((r) => !r.isCheck).length || 0;

                              return (
                                <div
                                  key={extraction.id}
                                  className={`extraction-file ${extraction.success ? "success" : "error"}`}
                                >
                                  <div
                                    className="extraction-file-header"
                                    onClick={() => toggleExtraction(extraction.id)}
                                  >
                                    <FileText size={16} className="file-icon" />
                                    <div className="extraction-file-info">
                                      <span className="file-name">{extraction.fileName}</span>
                                      <span className="file-time">{formatTime(extraction.createdAt)}</span>
                                    </div>
                                    <div className="extraction-file-stats">
                                      {extraction.success && (
                                        <>
                                          <span className="stat-badge mini pass">
                                            <CheckCircle2 size={10} />
                                            {passCount}
                                          </span>
                                          <span className="stat-badge mini fail">
                                            <XCircle size={10} />
                                            {failCount}
                                          </span>
                                        </>
                                      )}
                                      {!extraction.success && (
                                        <span className="stat-badge mini error">
                                          <XCircle size={10} />
                                          Errore
                                        </span>
                                      )}
                                    </div>
                                    <span className="folder-chevron">
                                      {isExtractionExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                    </span>
                                  </div>

                                  {isExtractionExpanded && (
                                    <div className="extraction-file-details">
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
                                                {data.analyses.slice(0, 3).map((analysis, idx) => (
                                                  <div key={idx} className="analysis-item">
                                                    <span className="analysis-param">{analysis.parameter}</span>
                                                    <span className="analysis-result">
                                                      {analysis.result} {analysis.um_result}
                                                    </span>
                                                  </div>
                                                ))}
                                                {data.analyses.length > 3 && (
                                                  <div className="analysis-more">
                                                    +{data.analyses.length - 3} altre analisi
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

                                          <div className="extraction-actions">
                                            <button
                                              className="btn-primary"
                                              onClick={() => handleSelectExtraction(extraction)}
                                            >
                                              Visualizza Dettagli Completi
                                            </button>
                                            <button
                                              className="btn-secondary btn-ocr"
                                              onClick={() => handleReprocessClick(extraction.id)}
                                              disabled={reprocessingId === extraction.id}
                                              title="Ricarica il PDF e rielabora con OCR forzato"
                                            >
                                              {reprocessingId === extraction.id ? (
                                                <>
                                                  <RotateCw size={14} className="spinning" />
                                                  Elaborazione...
                                                </>
                                              ) : (
                                                <>
                                                  <Upload size={14} />
                                                  Ripeti con OCR
                                                </>
                                              )}
                                            </button>
                                          </div>
                                        </>
                                      ) : (
                                        <div className="extraction-error-section">
                                          <div className="extraction-error">
                                            <XCircle size={20} />
                                            <p>{extraction.error || "Errore durante l'estrazione"}</p>
                                          </div>
                                          <button
                                            className="btn-secondary btn-ocr"
                                            onClick={() => handleReprocessClick(extraction.id)}
                                            disabled={reprocessingId === extraction.id}
                                            title="Ricarica il PDF e rielabora con OCR forzato"
                                          >
                                            {reprocessingId === extraction.id ? (
                                              <>
                                                <RotateCw size={14} className="spinning" />
                                                Elaborazione...
                                              </>
                                            ) : (
                                              <>
                                                <Upload size={14} />
                                                Ripeti con OCR
                                              </>
                                            )}
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
