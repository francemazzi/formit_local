import { useState } from "react";
import { X, Save, Loader2 } from "lucide-react";
import {
  conformityApi,
  type PdfExtraction,
  type PatchExtractionBody,
} from "../api/conformityPdf";

interface ExtractionEditDrawerProps {
  extraction: PdfExtraction;
  onClose: () => void;
  onSaved: (updated: PdfExtraction) => void;
}

/**
 * Extracts company name from filename (same logic as ExtractionsList).
 */
function extractCompanyNameFromFile(fileName: string): string {
  const nameWithoutExt = fileName.replace(/\.pdf$/i, "");
  const parts = nameWithoutExt.split("_");

  if (parts.length >= 4) {
    for (let i = parts.length - 2; i >= 2; i--) {
      const part = parts[i];
      if (/\b(srl|s\.r\.l|spa|s\.p\.a|snc|sas|di|srls)\b/i.test(part)) {
        return part.trim();
      }
    }
    for (let i = parts.length - 1; i >= 2; i--) {
      if (/^\d{6,8}$/.test(parts[i])) {
        if (i > 0 && parts[i - 1]) {
          return parts[i - 1].trim();
        }
      }
    }
  }

  return "Azienda non specificata";
}

export function ExtractionEditDrawer({
  extraction,
  onClose,
  onSaved,
}: ExtractionEditDrawerProps) {
  const [companyName, setCompanyName] = useState(
    extraction.companyName || extractCompanyNameFromFile(extraction.fileName)
  );
  const [fileName, setFileName] = useState(extraction.fileName);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const data: PatchExtractionBody = {};

      if (companyName !== (extraction.companyName || extractCompanyNameFromFile(extraction.fileName))) {
        data.companyName = companyName;
      }
      if (fileName !== extraction.fileName) {
        data.fileName = fileName;
      }

      if (Object.keys(data).length === 0) {
        setSuccess(true);
        setTimeout(() => onClose(), 500);
        return;
      }

      const updated = await conformityApi.updateExtraction(extraction.id, data);
      setSuccess(true);
      onSaved(updated);
      setTimeout(() => onClose(), 500);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } }).response?.data
          ?.error || "Errore durante il salvataggio";
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const matrix = extraction.extractedData?.matrix;

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <div className="drawer">
        <div className="drawer-header">
          <h2>Modifica Estrazione</h2>
          <button className="btn-icon" onClick={onClose} aria-label="Chiudi">
            <X size={20} />
          </button>
        </div>
        <div className="drawer-content">
          <div className="drawer-form">
            <div className="drawer-form-group">
              <label htmlFor="edit-company-name">Nome Azienda</label>
              <input
                id="edit-company-name"
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Nome azienda..."
              />
            </div>

            <div className="drawer-form-group">
              <label htmlFor="edit-file-name">Nome File</label>
              <input
                id="edit-file-name"
                type="text"
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                placeholder="Nome file..."
              />
            </div>

            <div className="drawer-form-group">
              <label>Data Estrazione</label>
              <div className="drawer-form-readonly">
                {formatDate(extraction.createdAt)}
              </div>
            </div>

            {matrix && (
              <>
                <div className="drawer-form-group">
                  <label>Matrice</label>
                  <div className="drawer-form-readonly">
                    {matrix.matrix}
                    {matrix.product && ` - ${matrix.product}`}
                  </div>
                </div>

                <div className="drawer-form-group">
                  <label>Categoria</label>
                  <div className="drawer-form-readonly">
                    {matrix.category === "food"
                      ? "Alimento"
                      : matrix.category === "beverage"
                      ? "Bevanda"
                      : "Altro"}
                    {matrix.ceirsa_category &&
                      ` (CEIRSA: ${matrix.ceirsa_category})`}
                  </div>
                </div>

                <div className="drawer-form-group">
                  <label>Tipo Campione</label>
                  <div className="drawer-form-readonly">
                    {matrix.sampleType}
                  </div>
                </div>
              </>
            )}

            {error && <div className="drawer-form-error">{error}</div>}
            {success && (
              <div className="drawer-form-success">Salvato con successo!</div>
            )}

            <div className="drawer-form-actions">
              <button
                className="btn btn-secondary"
                onClick={onClose}
                disabled={isSaving}
              >
                Annulla
              </button>
              <button
                className="btn btn-primary"
                onClick={handleSave}
                disabled={isSaving}
              >
                {isSaving ? (
                  <>
                    <Loader2 size={16} className="spinning" />
                    Salvataggio...
                  </>
                ) : (
                  <>
                    <Save size={16} />
                    Salva
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
