import { useState } from "react";
import { X, Key, ExternalLink, Loader2 } from "lucide-react";
import { envSetupApi } from "../api/apiKeys";

interface ApiKeySetupModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function ApiKeySetupModal({ onClose, onSuccess }: ApiKeySetupModalProps) {
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [tavilyApiKey, setTavilyApiKey] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);

    try {
      await envSetupApi.setup({
        openaiApiKey: openaiApiKey.trim(),
        tavilyApiKey: tavilyApiKey.trim(),
      });
      onSuccess();
    } catch (err: any) {
      setError(err.response?.data?.error || "Errore durante il salvataggio delle chiavi API");
    } finally {
      setIsSaving(false);
    }
  };

  const isFormValid = openaiApiKey.trim().length > 0 && tavilyApiKey.trim().length > 0;

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: "550px" }}>
        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Key size={20} />
            <h2>Configurazione Iniziale</h2>
          </div>
          <button className="btn-icon" onClick={onClose} disabled={isSaving}>
            <X size={20} />
          </button>
        </div>

        <p style={{
          color: "var(--text-secondary)",
          marginBottom: "1.5rem",
          lineHeight: "1.5"
        }}>
          Per utilizzare l'applicazione è necessario configurare le chiavi API.
          Inserisci le tue chiavi per procedere.
        </p>

        {error && (
          <div className="error-banner" style={{ margin: "0 0 1rem 0" }}>
            <span>{error}</span>
            <button onClick={() => setError(null)}>×</button>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="openaiApiKey">
              Inserisci chiavi API per OpenAI
              <a
                href="https://platform.openai.com/api-keys"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  marginLeft: "0.5rem",
                  color: "var(--accent-primary)",
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.25rem",
                  fontSize: "0.85rem",
                }}
              >
                Ottieni chiave
                <ExternalLink size={14} />
              </a>
            </label>
            <input
              id="openaiApiKey"
              type="password"
              value={openaiApiKey}
              onChange={(e) => setOpenaiApiKey(e.target.value)}
              placeholder="sk-..."
              disabled={isSaving}
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="tavilyApiKey">
              Inserisci le chiavi API per Tavily
              <a
                href="https://tavily.com"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  marginLeft: "0.5rem",
                  color: "var(--accent-primary)",
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.25rem",
                  fontSize: "0.85rem",
                }}
              >
                Ottieni chiave
                <ExternalLink size={14} />
              </a>
            </label>
            <input
              id="tavilyApiKey"
              type="password"
              value={tavilyApiKey}
              onChange={(e) => setTavilyApiKey(e.target.value)}
              placeholder="tvly-..."
              disabled={isSaving}
            />
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={isSaving}>
              Annulla
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={isSaving || !isFormValid}
            >
              {isSaving ? (
                <>
                  <Loader2 size={16} className="spin" />
                  Configurazione...
                </>
              ) : (
                "Configura e Procedi"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
