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
  Key,
} from "lucide-react";
import {
  apiKeysApi,
  userApiKeysApi,
  updateApi,
  type UpdateCheckResponse,
  type AiProvider,
  type ProviderInfo,
} from "../api/apiKeys";
import { useAuth } from "../context/AuthContext";

interface SettingsProps {
  onClose: () => void;
}

export function Settings({ onClose }: SettingsProps) {
  const { isAdmin } = useAuth();

  // User API keys state
  const [userOpenaiApiKey, setUserOpenaiApiKey] = useState("");
  const [userClaudeApiKey, setUserClaudeApiKey] = useState("");
  const [userTavilyApiKey, setUserTavilyApiKey] = useState("");
  const [userOpenaiConfigured, setUserOpenaiConfigured] = useState(false);
  const [userClaudeConfigured, setUserClaudeConfigured] = useState(false);
  const [userTavilyConfigured, setUserTavilyConfigured] = useState(false);
  const [, setUserActiveProvider] = useState<AiProvider | null>(null);
  const [isSavingUserKeys, setIsSavingUserKeys] = useState(false);
  const [userKeysSuccess, setUserKeysSuccess] = useState(false);
  const [userKeysError, setUserKeysError] = useState<string | null>(null);

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
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState("http://host.docker.internal:11434");
  const [ollamaModel, setOllamaModel] = useState("qwen2.5:3b");
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
  const [isCleaning, setIsCleaning] = useState(false);
  const [cleanupSuccess, setCleanupSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadApiKeys();
    loadProviders();
    loadUserApiKeys();
  }, []);

  const loadUserApiKeys = async () => {
    try {
      const config = await userApiKeysApi.get();
      setUserOpenaiConfigured(!!config.openaiApiKey);
      setUserClaudeConfigured(!!config.claudeApiKey);
      setUserTavilyConfigured(!!config.tavilyApiKey);
      setUserActiveProvider(config.activeProvider);
    } catch (err: any) {
      console.error("Failed to load user API keys:", err);
    }
  };

  const handleSaveUserKeys = async () => {
    setIsSavingUserKeys(true);
    setUserKeysError(null);
    setUserKeysSuccess(false);

    try {
      const data: Record<string, string | null> = {};
      if (userOpenaiApiKey.trim()) data.openaiApiKey = userOpenaiApiKey.trim();
      if (userClaudeApiKey.trim()) data.claudeApiKey = userClaudeApiKey.trim();
      if (userTavilyApiKey.trim()) data.tavilyApiKey = userTavilyApiKey.trim();

      // Set active provider based on which key is provided
      if (userOpenaiApiKey.trim()) {
        data.activeProvider = "OPENAI";
      } else if (userClaudeApiKey.trim()) {
        data.activeProvider = "ANTHROPIC_CLAUDE";
      }

      await userApiKeysApi.update(data);
      setUserKeysSuccess(true);
      setUserOpenaiApiKey("");
      setUserClaudeApiKey("");
      setUserTavilyApiKey("");
      await loadUserApiKeys();
      setTimeout(() => setUserKeysSuccess(false), 2000);
    } catch (err: any) {
      setUserKeysError(
        err.response?.data?.error || "Errore nel salvataggio delle chiavi API"
      );
    } finally {
      setIsSavingUserKeys(false);
    }
  };

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
      if (config.ollamaBaseUrl) {
        setOllamaBaseUrl(config.ollamaBaseUrl);
      }
      if (config.ollamaModel) {
        setOllamaModel(config.ollamaModel);
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

  const handleSaveOllamaConfig = async () => {
    setIsSavingProvider(true);
    setError(null);
    try {
      await apiKeysApi.updateOllamaConfig({
        ollamaBaseUrl: ollamaBaseUrl.trim() || null,
        ollamaModel: ollamaModel.trim() || null,
      });
      await loadProviders();
      setProviderSuccess(true);
      setTimeout(() => setProviderSuccess(false), 2000);
    } catch (err: any) {
      setError(
        err.response?.data?.error ||
          "Errore nel salvataggio della configurazione Ollama",
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
      setError(
        maybeError.response?.data?.message || "Errore durante la pulizia"
      );
    } finally {
      setIsCleaning(false);
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

        {/* ========================================
            User API Keys Section (available to all users)
            ======================================== */}
        <div style={{ marginBottom: "1.5rem" }}>
          <h3 style={{ marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Key size={18} />
            Le Mie Chiavi API
          </h3>
          <small style={{ color: "var(--text-secondary)", display: "block", marginBottom: "1rem" }}>
            Configura le tue chiavi API personali. Hanno priorità sulle chiavi globali.
          </small>

          {userKeysError && (
            <div className="error-banner" style={{ margin: "0 0 1rem 0" }}>
              <span>{userKeysError}</span>
              <button onClick={() => setUserKeysError(null)}>×</button>
            </div>
          )}

          {userKeysSuccess && (
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
              Chiavi API personali salvate con successo!
            </div>
          )}

          {/* OpenAI */}
          <div className="settings-credentials-section">
            <div className="settings-credentials-header">
              <h4>OpenAI</h4>
              {userOpenaiConfigured && (
                <span className="badge-configured">✓ Configurata</span>
              )}
              <a
                href="https://platform.openai.com/api-keys"
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
                value={userOpenaiApiKey}
                onChange={(e) => setUserOpenaiApiKey(e.target.value)}
                placeholder={
                  userOpenaiConfigured
                    ? "Inserisci nuova chiave per sovrascrivere"
                    : "sk-..."
                }
                disabled={isSavingUserKeys}
              />
            </div>
          </div>

          {/* Claude (Anthropic) */}
          <div className="settings-credentials-section">
            <div className="settings-credentials-header">
              <h4>Claude (Anthropic API)</h4>
              {userClaudeConfigured && (
                <span className="badge-configured">✓ Configurata</span>
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
                value={userClaudeApiKey}
                onChange={(e) => setUserClaudeApiKey(e.target.value)}
                placeholder={
                  userClaudeConfigured
                    ? "Inserisci nuova chiave per sovrascrivere"
                    : "sk-ant-..."
                }
                disabled={isSavingUserKeys}
              />
            </div>
          </div>

          {/* Tavily (optional) */}
          <div className="settings-credentials-section">
            <div className="settings-credentials-header">
              <h4>Tavily (opzionale)</h4>
              {userTavilyConfigured && (
                <span className="badge-configured">✓ Configurata</span>
              )}
              <a
                href="https://tavily.com"
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
                value={userTavilyApiKey}
                onChange={(e) => setUserTavilyApiKey(e.target.value)}
                placeholder={
                  userTavilyConfigured
                    ? "Inserisci nuova chiave per sovrascrivere"
                    : "tvly-..."
                }
                disabled={isSavingUserKeys}
              />
            </div>
            <p className="settings-credentials-hint">
              Per ricerca normative online (opzionale)
            </p>
          </div>

          <button
            type="button"
            className="btn-primary"
            onClick={handleSaveUserKeys}
            disabled={isSavingUserKeys || (!userOpenaiApiKey.trim() && !userClaudeApiKey.trim() && !userTavilyApiKey.trim())}
            style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
          >
            <Save size={16} />
            {isSavingUserKeys ? "Salvataggio..." : "Salva Le Mie Chiavi"}
          </button>
        </div>

        {/* ========================================
            Admin-only Global API Keys Section
            ======================================== */}
        {isAdmin && (<>
        <form onSubmit={handleSubmit}>
          <div style={{ paddingTop: "1.5rem", borderTop: "1px solid var(--border-primary)", marginBottom: "1rem" }}>
            <h3 style={{ marginBottom: "0.5rem" }}>Chiavi API Globali (Admin)</h3>
            <small style={{ color: "var(--text-secondary)", display: "block", marginBottom: "1rem" }}>
              Chiavi condivise tra tutti gli utenti che non hanno configurato le proprie.
            </small>
          </div>

          {success && (
            <div
              style={{
                background: "rgba(34, 197, 94, 0.1)",
                border: "1px solid #22c55e",
                borderRadius: "var(--border-radius-sm)",
                padding: "0.75rem 1rem",
                margin: "0 0 1rem 0",
                color: "#22c55e",
              }}
            >
              Chiavi API globali salvate con successo!
            </div>
          )}

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

          {/* Ollama (Local) Configuration */}
          <div className="settings-credentials-section">
            <div className="settings-credentials-header">
              <h4>Ollama (Locale)</h4>
              <span className="badge-configured" style={{ color: "var(--color-satisfactory)" }}>
                Sempre disponibile
              </span>
            </div>
            <div className="settings-field-group">
              <label className="settings-field-label" htmlFor="ollama-base-url">
                URL Base
              </label>
              <input
                id="ollama-base-url"
                type="text"
                className="settings-credential-input"
                value={ollamaBaseUrl}
                onChange={(e) => setOllamaBaseUrl(e.target.value)}
                placeholder="http://host.docker.internal:11434"
                disabled={isSavingProvider}
              />
            </div>
            <div className="settings-field-group">
              <label className="settings-field-label" htmlFor="ollama-model">
                Modello
              </label>
              <div className="settings-input-row">
                <input
                  id="ollama-model"
                  type="text"
                  className="settings-credential-input"
                  value={ollamaModel}
                  onChange={(e) => setOllamaModel(e.target.value)}
                  placeholder="qwen2.5:3b"
                  disabled={isSavingProvider}
                />
                <button
                  type="button"
                  className="btn-secondary btn-save-credential"
                  onClick={handleSaveOllamaConfig}
                  disabled={isSavingProvider}
                  title="Salva configurazione Ollama"
                >
                  <Save size={16} />
                </button>
              </div>
            </div>
            <p className="settings-credentials-hint">
              Modello AI locale, non richiede chiavi API. Consigliati per RPi
              8GB: qwen2.5:3b, phi3:mini, gemma2:2b. OCR/visione non
              disponibile.
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

          {cleanupSuccess && (
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
              {cleanupSuccess}
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

          <button
            type="button"
            className="btn-secondary"
            onClick={handleCleanup}
            disabled={isCleaning || isCheckingUpdates || isUpdating}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              marginTop: "0.75rem",
            }}
          >
            <RefreshCw size={16} className={isCleaning ? "spinning" : ""} />
            {isCleaning
              ? "Pulizia in corso..."
              : "Pulisci cache e job falliti"}
          </button>

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
          <small
            style={{
              display: "block",
              marginTop: "0.5rem",
              color: "var(--text-secondary)",
              fontSize: "0.75rem",
            }}
          >
            Il comando di pulizia rimuove i job falliti dalla coda e azzera la
            cache in-memory dei controlli.
          </small>
        </div>
        </>)}
      </div>
    </div>
  );
}
