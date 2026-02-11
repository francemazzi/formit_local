import { useState } from "react";
import { X, Key, ExternalLink, Loader2 } from "lucide-react";
import { envSetupApi, apiKeysApi, type AiProvider } from "../api/apiKeys";

interface ApiKeySetupModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

type ProviderOption = "OPENAI" | "ANTHROPIC_CLAUDE" | "BEDROCK_CLAUDE";

export function ApiKeySetupModal({ onClose, onSuccess }: ApiKeySetupModalProps) {
  const [selectedProvider, setSelectedProvider] = useState<ProviderOption>("OPENAI");
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [claudeApiKey, setClaudeApiKey] = useState("");
  const [awsAccessKeyId, setAwsAccessKeyId] = useState("");
  const [awsSecretAccessKey, setAwsSecretAccessKey] = useState("");
  const [awsRegion, setAwsRegion] = useState("us-east-1");
  const [tavilyApiKey, setTavilyApiKey] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);

    try {
      // First, setup Tavily key using env setup (for backward compatibility)
      if (selectedProvider === "OPENAI") {
        await envSetupApi.setup({
          openaiApiKey: openaiApiKey.trim(),
          tavilyApiKey: tavilyApiKey.trim(),
        });
      } else {
        // For Claude providers, we need to set up Tavily via the API
        await apiKeysApi.update({ tavilyApiKey: tavilyApiKey.trim() });

        if (selectedProvider === "ANTHROPIC_CLAUDE") {
          await apiKeysApi.updateClaudeApiKey({ claudeApiKey: claudeApiKey.trim() });
        } else if (selectedProvider === "BEDROCK_CLAUDE") {
          await apiKeysApi.updateAwsCredentials({
            awsAccessKeyId: awsAccessKeyId.trim(),
            awsSecretAccessKey: awsSecretAccessKey.trim(),
            awsRegion: awsRegion.trim() || "us-east-1",
          });
        }

        // Set active provider
        await apiKeysApi.setActiveProvider(selectedProvider as AiProvider);
      }

      onSuccess();
    } catch (err: any) {
      setError(err.response?.data?.error || "Errore durante il salvataggio delle chiavi API");
    } finally {
      setIsSaving(false);
    }
  };

  const isFormValid = () => {
    // Tavily API key is optional - only validate the AI provider credentials
    if (selectedProvider === "OPENAI") {
      return openaiApiKey.trim().length > 0;
    }
    if (selectedProvider === "ANTHROPIC_CLAUDE") {
      return claudeApiKey.trim().length > 0;
    }
    if (selectedProvider === "BEDROCK_CLAUDE") {
      return awsAccessKeyId.trim().length > 0 && awsSecretAccessKey.trim().length > 0;
    }
    return false;
  };

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
          {/* Provider Selection */}
          <div className="form-group">
            <label>Seleziona Provider AI</label>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "0.5rem" }}>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.75rem",
                  border: `1px solid ${selectedProvider === "OPENAI" ? "var(--accent-primary)" : "var(--border-primary)"}`,
                  borderRadius: "var(--border-radius-sm)",
                  cursor: "pointer",
                  background: selectedProvider === "OPENAI" ? "rgba(59, 130, 246, 0.1)" : "transparent",
                }}
              >
                <input
                  type="radio"
                  name="provider"
                  value="OPENAI"
                  checked={selectedProvider === "OPENAI"}
                  onChange={() => setSelectedProvider("OPENAI")}
                  disabled={isSaving}
                />
                <div>
                  <strong>OpenAI</strong>
                  <small style={{ display: "block", color: "var(--text-secondary)" }}>GPT-4o per OCR e analisi</small>
                </div>
              </label>

              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.75rem",
                  border: `1px solid ${selectedProvider === "ANTHROPIC_CLAUDE" ? "var(--accent-primary)" : "var(--border-primary)"}`,
                  borderRadius: "var(--border-radius-sm)",
                  cursor: "pointer",
                  background: selectedProvider === "ANTHROPIC_CLAUDE" ? "rgba(59, 130, 246, 0.1)" : "transparent",
                }}
              >
                <input
                  type="radio"
                  name="provider"
                  value="ANTHROPIC_CLAUDE"
                  checked={selectedProvider === "ANTHROPIC_CLAUDE"}
                  onChange={() => setSelectedProvider("ANTHROPIC_CLAUDE")}
                  disabled={isSaving}
                />
                <div>
                  <strong>Claude (Anthropic API)</strong>
                  <small style={{ display: "block", color: "var(--text-secondary)" }}>Claude 3.5 Sonnet via API diretta</small>
                </div>
              </label>

              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.75rem",
                  border: `1px solid ${selectedProvider === "BEDROCK_CLAUDE" ? "var(--accent-primary)" : "var(--border-primary)"}`,
                  borderRadius: "var(--border-radius-sm)",
                  cursor: "pointer",
                  background: selectedProvider === "BEDROCK_CLAUDE" ? "rgba(59, 130, 246, 0.1)" : "transparent",
                }}
              >
                <input
                  type="radio"
                  name="provider"
                  value="BEDROCK_CLAUDE"
                  checked={selectedProvider === "BEDROCK_CLAUDE"}
                  onChange={() => setSelectedProvider("BEDROCK_CLAUDE")}
                  disabled={isSaving}
                />
                <div>
                  <strong>Claude (AWS Bedrock)</strong>
                  <small style={{ display: "block", color: "var(--text-secondary)" }}>Claude 3.5 Sonnet via AWS</small>
                </div>
              </label>
            </div>
          </div>

          {/* OpenAI API Key */}
          {selectedProvider === "OPENAI" && (
            <div className="form-group">
              <label htmlFor="openaiApiKey">
                OpenAI API Key
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
          )}

          {/* Claude (Anthropic) API Key */}
          {selectedProvider === "ANTHROPIC_CLAUDE" && (
            <div className="form-group">
              <label htmlFor="claudeApiKey">
                Claude API Key
                <a
                  href="https://console.anthropic.com/settings/keys"
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
                id="claudeApiKey"
                type="password"
                value={claudeApiKey}
                onChange={(e) => setClaudeApiKey(e.target.value)}
                placeholder="sk-ant-..."
                disabled={isSaving}
                autoFocus
              />
            </div>
          )}

          {/* AWS Bedrock Credentials */}
          {selectedProvider === "BEDROCK_CLAUDE" && (
            <>
              <div className="form-group">
                <label htmlFor="awsAccessKeyId">
                  AWS Access Key ID
                  <a
                    href="https://console.aws.amazon.com/iam/home#/security_credentials"
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
                    AWS Console
                    <ExternalLink size={14} />
                  </a>
                </label>
                <input
                  id="awsAccessKeyId"
                  type="password"
                  value={awsAccessKeyId}
                  onChange={(e) => setAwsAccessKeyId(e.target.value)}
                  placeholder="AKIA..."
                  disabled={isSaving}
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label htmlFor="awsSecretAccessKey">AWS Secret Access Key</label>
                <input
                  id="awsSecretAccessKey"
                  type="password"
                  value={awsSecretAccessKey}
                  onChange={(e) => setAwsSecretAccessKey(e.target.value)}
                  placeholder="Secret key..."
                  disabled={isSaving}
                />
              </div>
              <div className="form-group">
                <label htmlFor="awsRegion">AWS Region</label>
                <input
                  id="awsRegion"
                  type="text"
                  value={awsRegion}
                  onChange={(e) => setAwsRegion(e.target.value)}
                  placeholder="us-east-1"
                  disabled={isSaving}
                />
                <small style={{ color: "var(--text-secondary)", fontSize: "0.75rem" }}>
                  Assicurati che Claude sia abilitato su Bedrock nella regione selezionata
                </small>
              </div>
            </>
          )}

          {/* Tavily API Key (optional) */}
          <div className="form-group">
            <label htmlFor="tavilyApiKey">
              Tavily API Key (opzionale - per ricerca normative online)
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
              disabled={isSaving || !isFormValid()}
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
