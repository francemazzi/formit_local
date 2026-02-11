import { useState, useEffect } from "react";
import {
  X,
  Save,
  ExternalLink,
  Settings as SettingsIcon,
  RefreshCw,
  AlertTriangle,
  Cpu,
  Check,
} from "lucide-react";
import {
  apiKeysApi,
  updateApi,
  type UpdateCheckResponse,
  type AiProvider,
  type ProviderInfo,
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

  // Provider state
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [activeProvider, setActiveProvider] = useState<AiProvider>("OPENAI");
  const [claudeApiKey, setClaudeApiKey] = useState("");
  const [claudeConfigured, setClaudeConfigured] = useState(false);
  const [awsAccessKeyId, setAwsAccessKeyId] = useState("");
  const [awsSecretAccessKey, setAwsSecretAccessKey] = useState("");
  const [awsRegion, setAwsRegion] = useState("us-east-1");
  const [awsConfigured, setAwsConfigured] = useState(false);
  const [isSavingProvider, setIsSavingProvider] = useState(false);
  const [providerSuccess, setProviderSuccess] = useState(false);

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
    loadProviders();
  }, []);

  const loadApiKeys = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const config = await apiKeysApi.get();
      // Check if keys are configured (even if masked)
      setTavilyConfigured(!!config.tavilyApiKey);
      setOpenaiConfigured(!!config.openaiApiKey);
      setClaudeConfigured(!!config.claudeApiKey);
      setAwsConfigured(!!config.awsAccessKeyId);
      setActiveProvider(config.activeProvider);
      // If keys are masked (contain ****), don't populate the fields
      // Otherwise, populate with the actual keys
      if (config.tavilyApiKey && !config.tavilyApiKey.startsWith("****")) {
        setTavilyApiKey(config.tavilyApiKey);
      }
      if (config.openaiApiKey && !config.openaiApiKey.startsWith("****")) {
        setOpenaiApiKey(config.openaiApiKey);
      }
      if (config.awsRegion) {
        setAwsRegion(config.awsRegion);
      }
    } catch (err: any) {
      setError(
        err.response?.data?.error || "Errore nel caricamento delle chiavi API",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const loadProviders = async () => {
    try {
      const response = await apiKeysApi.getProviders();
      setProviders(response.providers);
      setActiveProvider(response.activeProvider);
    } catch (err: any) {
      console.error("Failed to load providers:", err);
    }
  };

  const handleProviderChange = async (provider: AiProvider) => {
    setIsSavingProvider(true);
    setError(null);
    setProviderSuccess(false);
    try {
      await apiKeysApi.setActiveProvider(provider);
      setActiveProvider(provider);
      setProviderSuccess(true);
      await loadProviders();
      setTimeout(() => setProviderSuccess(false), 2000);
    } catch (err: any) {
      setError(err.response?.data?.error || "Errore nel cambio provider");
    } finally {
      setIsSavingProvider(false);
    }
  };

  const handleSaveClaudeKey = async () => {
    if (!claudeApiKey.trim()) return;
    setIsSavingProvider(true);
    setError(null);
    try {
      await apiKeysApi.updateClaudeApiKey({
        claudeApiKey: claudeApiKey.trim(),
      });
      setClaudeConfigured(true);
      setClaudeApiKey("");
      await loadProviders();
      setProviderSuccess(true);
      setTimeout(() => setProviderSuccess(false), 2000);
    } catch (err: any) {
      setError(
        err.response?.data?.error ||
          "Errore nel salvataggio della chiave Claude",
      );
    } finally {
      setIsSavingProvider(false);
    }
  };

  const handleSaveAwsCredentials = async () => {
    if (!awsAccessKeyId.trim() || !awsSecretAccessKey.trim()) return;
    setIsSavingProvider(true);
    setError(null);
    try {
      await apiKeysApi.updateAwsCredentials({
        awsAccessKeyId: awsAccessKeyId.trim(),
        awsSecretAccessKey: awsSecretAccessKey.trim(),
        awsRegion: awsRegion.trim() || "us-east-1",
      });
      setAwsConfigured(true);
      setAwsAccessKeyId("");
      setAwsSecretAccessKey("");
      await loadProviders();
      setProviderSuccess(true);
      setTimeout(() => setProviderSuccess(false), 2000);
    } catch (err: any) {
      setError(
        err.response?.data?.error ||
          "Errore nel salvataggio delle credenziali AWS",
      );
    } finally {
      setIsSavingProvider(false);
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

        {/* AI Provider Section */}
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
            <Cpu size={18} />
            Provider AI
          </h3>

          {providerSuccess && (
            <div
              style={{
                background: "rgba(34, 197, 94, 0.1)",
                border: "1px solid #22c55e",
                borderRadius: "var(--border-radius-sm)",
                padding: "0.75rem 1rem",
                marginBottom: "1rem",
                color: "#22c55e",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
              }}
            >
              <Check size={16} />
              Provider configurato con successo!
            </div>
          )}

          <div style={{ marginBottom: "1rem" }}>
            <small
              style={{
                color: "var(--text-secondary)",
                display: "block",
                marginBottom: "0.75rem",
              }}
            >
              Seleziona il provider AI da utilizzare per OCR ed elaborazione
              testi
            </small>

            {providers.map((provider) => (
              <label
                key={provider.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.75rem",
                  padding: "0.75rem",
                  marginBottom: "0.5rem",
                  border: `1px solid ${activeProvider === provider.id ? "var(--accent-primary)" : "var(--border-primary)"}`,
                  borderRadius: "var(--border-radius-sm)",
                  cursor: provider.configured ? "pointer" : "not-allowed",
                  opacity: provider.configured ? 1 : 0.6,
                  background:
                    activeProvider === provider.id
                      ? "rgba(59, 130, 246, 0.1)"
                      : "transparent",
                }}
              >
                <input
                  type="radio"
                  name="provider"
                  value={provider.id}
                  checked={activeProvider === provider.id}
                  onChange={() =>
                    provider.configured && handleProviderChange(provider.id)
                  }
                  disabled={!provider.configured || isSavingProvider}
                  style={{ margin: 0 }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500 }}>{provider.name}</div>
                  <small style={{ color: "var(--text-secondary)" }}>
                    {provider.configured ? (
                      <span style={{ color: "var(--color-satisfactory)" }}>
                        ✓ Configurato
                      </span>
                    ) : (
                      <span>
                        Non configurato - aggiungi le credenziali sotto
                      </span>
                    )}
                  </small>
                </div>
              </label>
            ))}
          </div>

          {/* Claude (Anthropic) Configuration */}
          <div className="settings-credentials-section">
            <div className="settings-credentials-header">
              <h4>Claude (Anthropic API)</h4>
              {claudeConfigured && (
                <span className="badge-configured">✓ Configurato</span>
              )}
              <a
                href="https://console.anthropic.com/settings/keys"
                target="_blank"
                rel="noopener noreferrer"
              >
                Ottieni chiave
                <ExternalLink size={12} />
              </a>
            </div>
            <div className="settings-input-row">
              <input
                type="password"
                className="settings-credential-input"
                value={claudeApiKey}
                onChange={(e) => setClaudeApiKey(e.target.value)}
                placeholder={
                  claudeConfigured
                    ? "Inserisci nuova chiave per sovrascrivere"
                    : "sk-ant-..."
                }
                disabled={isSavingProvider}
              />
              <button
                type="button"
                className="btn-secondary btn-save-credential"
                onClick={handleSaveClaudeKey}
                disabled={!claudeApiKey.trim() || isSavingProvider}
                title="Salva chiave"
              >
                <Save size={16} />
              </button>
            </div>
          </div>

          {/* AWS Bedrock Configuration */}
          <div className="settings-credentials-section">
            <div className="settings-credentials-header">
              <h4>Claude (AWS Bedrock)</h4>
              {awsConfigured && (
                <span className="badge-configured">✓ Configurato</span>
              )}
              <a
                href="https://console.aws.amazon.com/bedrock"
                target="_blank"
                rel="noopener noreferrer"
              >
                AWS Console
                <ExternalLink size={12} />
              </a>
            </div>
            <div className="settings-field-group">
              <label
                className="settings-field-label"
                htmlFor="aws-access-key-id"
              >
                AWS Access Key ID
              </label>
              <input
                id="aws-access-key-id"
                type="password"
                className="settings-credential-input"
                value={awsAccessKeyId}
                onChange={(e) => setAwsAccessKeyId(e.target.value)}
                placeholder="Inserisci Access Key ID"
                disabled={isSavingProvider}
              />
            </div>
            <div className="settings-field-group">
              <label className="settings-field-label" htmlFor="aws-secret-key">
                AWS Secret Access Key
              </label>
              <input
                id="aws-secret-key"
                type="password"
                className="settings-credential-input"
                value={awsSecretAccessKey}
                onChange={(e) => setAwsSecretAccessKey(e.target.value)}
                placeholder="Inserisci Secret Access Key"
                disabled={isSavingProvider}
              />
            </div>
            <div className="settings-field-group">
              <label className="settings-field-label" htmlFor="aws-region">
                Regione
              </label>
              <div className="settings-input-row">
                <input
                  id="aws-region"
                  type="text"
                  className="settings-credential-input"
                  value={awsRegion}
                  onChange={(e) => setAwsRegion(e.target.value)}
                  placeholder="us-east-1"
                  disabled={isSavingProvider}
                />
                <button
                  type="button"
                  className="btn-secondary btn-save-credential"
                  onClick={handleSaveAwsCredentials}
                  disabled={
                    !awsAccessKeyId.trim() ||
                    !awsSecretAccessKey.trim() ||
                    isSavingProvider
                  }
                  title="Salva credenziali AWS"
                >
                  <Save size={16} />
                </button>
              </div>
            </div>
            <p className="settings-credentials-hint">
              Richiede accesso a Claude su AWS Bedrock nella regione specificata
            </p>
          </div>
        </div>

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
