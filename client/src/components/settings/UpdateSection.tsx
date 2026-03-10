import { useState } from "react";
import { RefreshCw, AlertTriangle } from "lucide-react";
import { updateApi, type UpdateCheckResponse } from "../../api/apiKeys";

export function UpdateSection() {
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResponse | null>(null);
  const [showUpdateConfirm, setShowUpdateConfirm] = useState(false);
  const [updateSuccess, setUpdateSuccess] = useState<string | null>(null);
  const [isCleaning, setIsCleaning] = useState(false);
  const [cleanupSuccess, setCleanupSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      setError(err.response?.data?.message || "Errore nel controllo aggiornamenti");
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
          setTimeout(() => window.location.reload(), 5000);
        }
      }
    } catch (err: any) {
      setError(err.response?.data?.message || "Errore durante l'aggiornamento");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCleanup = async () => {
    setIsCleaning(true);
    setError(null);
    setCleanupSuccess(null);
    try {
      const result = await updateApi.cleanup();
      setCleanupSuccess(
        `${result.message} Job falliti rimossi: ${result.details.failedJobsRemoved}. Cache svuotate: ${result.details.cacheEntriesCleared}.`
      );
    } catch (err: unknown) {
      const maybeError = err as { response?: { data?: { message?: string } } };
      setError(maybeError.response?.data?.message || "Errore durante la pulizia");
    } finally {
      setIsCleaning(false);
    }
  };

  return (
    <div className="settings-section">
      <h3 className="settings-section-title">
        <RefreshCw size={18} />
        Aggiornamento Applicazione
      </h3>

      {error && (
        <div className="error-banner" style={{ marginBottom: "1rem" }}>
          <span>{error}</span>
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      {updateSuccess && (
        <div className="settings-success-msg">
          {updateSuccess}
          <br />
          <small>La pagina si ricaricherà automaticamente...</small>
        </div>
      )}

      {cleanupSuccess && (
        <div className="settings-success-msg">{cleanupSuccess}</div>
      )}

      {updateInfo && !updateInfo.hasUpdates && !updateSuccess && (
        <div className="settings-info-msg">
          L'applicazione è aggiornata (commit: {updateInfo.currentCommit})
        </div>
      )}

      {showUpdateConfirm && updateInfo && (
        <div className="settings-warning-msg">
          <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem" }}>
            <AlertTriangle size={20} style={{ color: "#fbbf24", flexShrink: 0, marginTop: "2px" }} />
            <div>
              <strong style={{ color: "#fbbf24" }}>Aggiornamento disponibile</strong>
              <p style={{ margin: "0.5rem 0", color: "var(--text-secondary)", fontSize: "0.875rem" }}>
                Sono disponibili {updateInfo.behindBy} nuovi commit.
                <br />
                Versione attuale: <code>{updateInfo.currentCommit}</code> → Nuova versione: <code>{updateInfo.remoteCommit}</code>
              </p>
              <p style={{ margin: "0.5rem 0", color: "var(--text-secondary)", fontSize: "0.875rem" }}>
                L'applicazione verrà riavviata automaticamente. Confermi l'aggiornamento?
              </p>
              <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
                <button type="button" className="btn-primary" onClick={performUpdate} disabled={isUpdating} style={{ fontSize: "0.875rem" }}>
                  {isUpdating ? "Aggiornamento..." : "Conferma Aggiornamento"}
                </button>
                <button type="button" className="btn-secondary" onClick={() => setShowUpdateConfirm(false)} disabled={isUpdating} style={{ fontSize: "0.875rem" }}>
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
          <RefreshCw size={16} className={isCheckingUpdates ? "spinning" : ""} />
          {isCheckingUpdates ? "Controllo in corso..." : "Controlla Aggiornamenti"}
        </button>
      )}

      <button
        type="button"
        className="btn-secondary"
        onClick={handleCleanup}
        disabled={isCleaning || isCheckingUpdates || isUpdating}
        style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.75rem" }}
      >
        <RefreshCw size={16} className={isCleaning ? "spinning" : ""} />
        {isCleaning ? "Pulizia in corso..." : "Pulisci cache e job falliti"}
      </button>

      <small style={{ display: "block", marginTop: "0.5rem", color: "var(--text-secondary)", fontSize: "0.75rem" }}>
        Scarica gli aggiornamenti da GitHub (origin/main) e riavvia l'applicazione.
      </small>
      <small style={{ display: "block", marginTop: "0.5rem", color: "var(--text-secondary)", fontSize: "0.75rem" }}>
        Il comando di pulizia rimuove i job falliti dalla coda e azzera la cache in-memory dei controlli.
      </small>
    </div>
  );
}
