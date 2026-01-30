import { useState, useEffect } from "react";
import {
  X,
  Save,
  ExternalLink,
  Settings as SettingsIcon,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import {
  apiKeysApi,
  updateApi,
  type UpdateCheckResponse,
} from "../api/apiKeys";

interface SettingsProps {
  onClose: () => void;
}

export function Settings({ onClose }: SettingsProps) {
  const [tavilyApiKey, setTavilyApiKey] = useState("");
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [tavilyConfigured, setTavilyConfigured] = useState(false);
  const [openaiConfigured, setOpenaiConfigured] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Update state
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResponse | null>(
    null,
  );
  const [showUpdateConfirm, setShowUpdateConfirm] = useState(false);
  const [updateSuccess, setUpdateSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadApiKeys();
  }, []);

  const loadApiKeys = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const config = await apiKeysApi.get();
      // Check if keys are configured (even if masked)
      setTavilyConfigured(!!config.tavilyApiKey);
      setOpenaiConfigured(!!config.openaiApiKey);
      // If keys are masked (contain ****), don't populate the fields
      // Otherwise, populate with the actual keys
      if (config.tavilyApiKey && !config.tavilyApiKey.startsWith("****")) {
        setTavilyApiKey(config.tavilyApiKey);
      }
      if (config.openaiApiKey && !config.openaiApiKey.startsWith("****")) {
        setOpenaiApiKey(config.openaiApiKey);
      }
    } catch (err: any) {
      setError(
        err.response?.data?.error || "Errore nel caricamento delle chiavi API",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const checkForUpdates = async () => {
    setIsCheckingUpdates(true);
    setError(null);
    try {
      const info = await updateApi.check();
      setUpdateInfo(info);
      if (info.hasUpdates) {
        setShowUpdateConfirm(true);
      }
    } catch (err: any) {
      setError(
        err.response?.data?.message || "Errore nel controllo aggiornamenti",
      );
    } finally {
      setIsCheckingUpdates(false);
    }
  };

  const performUpdate = async () => {
    setIsUpdating(true);
    setShowUpdateConfirm(false);
    setError(null);
    try {
      const result = await updateApi.update();
      if (result.success) {
        setUpdateSuccess(result.message);
        if (result.details?.restartScheduled) {
          // Auto reload after delay
          setTimeout(() => {
            window.location.reload();
          }, 5000);
        }
      }
    } catch (err: any) {
      setError(err.response?.data?.message || "Errore durante l'aggiornamento");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    setSuccess(false);

    try {
      await apiKeysApi.update({
        tavilyApiKey: tavilyApiKey.trim() || null,
        openaiApiKey: openaiApiKey.trim() || null,
      });
      setSuccess(true);
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      setError(
        err.response?.data?.error || "Errore nel salvataggio delle chiavi API",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: "600px" }}>
        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <SettingsIcon size={20} />
            <h2>Impostazioni API</h2>
          </div>
          <button className="btn-icon" onClick={onClose} disabled={isSaving}>
            <X size={20} />
          </button>
        </div>

        {error && (
          <div className="error-banner" style={{ margin: "1rem 0" }}>
            <span>{error}</span>
            <button onClick={() => setError(null)}>×</button>
          </div>
        )}

        {success && (
          <div
            style={{
              background: "rgba(34, 197, 94, 0.1)",
              border: "1px solid #22c55e",
              borderRadius: "var(--border-radius-sm)",
              padding: "0.75rem 1rem",
              margin: "1rem 0",
              color: "#22c55e",
            }}
          >
            Chiavi API salvate con successo!
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="tavilyApiKey">
              Tavily API Key
              {tavilyConfigured && (
                <span
                  style={{
                    marginLeft: "0.5rem",
                    color: "var(--color-satisfactory)",
                    fontSize: "0.75rem",
                  }}
                >
                  ✓ Configurata
                </span>
              )}
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
                }}
              >
                Ottieni credenziali
                <ExternalLink size={14} />
              </a>
            </label>
            <input
              id="tavilyApiKey"
              type="password"
              value={tavilyApiKey}
              onChange={(e) => setTavilyApiKey(e.target.value)}
              placeholder={
                tavilyConfigured
                  ? "Inserisci una nuova chiave per sovrascrivere"
                  : "Inserisci la tua Tavily API Key"
              }
              disabled={isLoading || isSaving}
            />
            <small
              style={{
                color: "var(--text-secondary)",
                fontSize: "0.75rem",
                marginTop: "0.25rem",
              }}
            >
              Chiave API per l'integrazione con Tavily (ricerca web)
            </small>
          </div>

          <div className="form-group">
            <label htmlFor="openaiApiKey">
              OpenAI API Key
              {openaiConfigured && (
                <span
                  style={{
                    marginLeft: "0.5rem",
                    color: "var(--color-satisfactory)",
                    fontSize: "0.75rem",
                  }}
                >
                  ✓ Configurata
                </span>
              )}
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
                }}
              >
                Ottieni credenziali
                <ExternalLink size={14} />
              </a>
            </label>
            <input
              id="openaiApiKey"
              type="password"
              value={openaiApiKey}
              onChange={(e) => setOpenaiApiKey(e.target.value)}
              placeholder={
                openaiConfigured
                  ? "Inserisci una nuova chiave per sovrascrivere"
                  : "Inserisci la tua OpenAI API Key"
              }
              disabled={isLoading || isSaving}
            />
            <small
              style={{
                color: "var(--text-secondary)",
                fontSize: "0.75rem",
                marginTop: "0.25rem",
              }}
            >
              Chiave API per l'integrazione con OpenAI (elaborazione linguaggio
              naturale)
            </small>
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              disabled={isSaving}
            >
              Annulla
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={isLoading || isSaving}
            >
              <Save size={16} />
              {isSaving ? "Salvataggio..." : "Salva"}
            </button>
          </div>
        </form>

        {/* Update Section */}
        <div
          style={{
            marginTop: "1.5rem",
            paddingTop: "1.5rem",
            borderTop: "1px solid var(--border-primary)",
          }}
        >
          <h3
            style={{
              marginBottom: "1rem",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <RefreshCw size={18} />
            Aggiornamento Applicazione
          </h3>

          {updateSuccess && (
            <div
              style={{
                background: "rgba(34, 197, 94, 0.1)",
                border: "1px solid #22c55e",
                borderRadius: "var(--border-radius-sm)",
                padding: "0.75rem 1rem",
                marginBottom: "1rem",
                color: "#22c55e",
              }}
            >
              {updateSuccess}
              <br />
              <small>La pagina si ricaricherà automaticamente...</small>
            </div>
          )}

          {updateInfo && !updateInfo.hasUpdates && !updateSuccess && (
            <div
              style={{
                background: "rgba(59, 130, 246, 0.1)",
                border: "1px solid #3b82f6",
                borderRadius: "var(--border-radius-sm)",
                padding: "0.75rem 1rem",
                marginBottom: "1rem",
                color: "#3b82f6",
              }}
            >
              L'applicazione è aggiornata (commit: {updateInfo.currentCommit})
            </div>
          )}

          {showUpdateConfirm && updateInfo && (
            <div
              style={{
                background: "rgba(251, 191, 36, 0.1)",
                border: "1px solid #fbbf24",
                borderRadius: "var(--border-radius-sm)",
                padding: "1rem",
                marginBottom: "1rem",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "0.75rem",
                }}
              >
                <AlertTriangle
                  size={20}
                  style={{ color: "#fbbf24", flexShrink: 0, marginTop: "2px" }}
                />
                <div>
                  <strong style={{ color: "#fbbf24" }}>
                    Aggiornamento disponibile
                  </strong>
                  <p
                    style={{
                      margin: "0.5rem 0",
                      color: "var(--text-secondary)",
                      fontSize: "0.875rem",
                    }}
                  >
                    Sono disponibili {updateInfo.behindBy} nuovi commit.
                    <br />
                    Versione attuale: <code>{updateInfo.currentCommit}</code> →
                    Nuova versione: <code>{updateInfo.remoteCommit}</code>
                  </p>
                  <p
                    style={{
                      margin: "0.5rem 0",
                      color: "var(--text-secondary)",
                      fontSize: "0.875rem",
                    }}
                  >
                    L'applicazione verrà riavviata automaticamente. Confermi
                    l'aggiornamento?
                  </p>
                  <div
                    style={{
                      display: "flex",
                      gap: "0.5rem",
                      marginTop: "0.75rem",
                    }}
                  >
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={performUpdate}
                      disabled={isUpdating}
                      style={{ fontSize: "0.875rem" }}
                    >
                      {isUpdating
                        ? "Aggiornamento..."
                        : "Conferma Aggiornamento"}
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setShowUpdateConfirm(false)}
                      disabled={isUpdating}
                      style={{ fontSize: "0.875rem" }}
                    >
                      Annulla
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {!showUpdateConfirm && !updateSuccess && (
            <button
              type="button"
              className="btn-secondary"
              onClick={checkForUpdates}
              disabled={isCheckingUpdates || isUpdating}
              style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
            >
              <RefreshCw
                size={16}
                className={isCheckingUpdates ? "spinning" : ""}
              />
              {isCheckingUpdates
                ? "Controllo in corso..."
                : "Controlla Aggiornamenti"}
            </button>
          )}

          <small
            style={{
              display: "block",
              marginTop: "0.5rem",
              color: "var(--text-secondary)",
              fontSize: "0.75rem",
            }}
          >
            Scarica gli aggiornamenti da GitHub (origin/main) e riavvia
            l'applicazione.
          </small>
        </div>
      </div>
    </div>
  );
}
