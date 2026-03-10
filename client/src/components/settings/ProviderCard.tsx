import { useState } from "react";
import { ChevronDown, ChevronUp, ExternalLink, Save } from "lucide-react";
import type { AiProvider } from "../../api/apiKeys";
import type { MergedProvider } from "./useSettingsData";

interface CredentialField {
  key: string;
  label: string;
  type: "password" | "text";
  placeholder: string;
}

const PROVIDER_FIELDS: Record<AiProvider, CredentialField[]> = {
  OPENAI: [
    { key: "openaiApiKey", label: "API Key", type: "password", placeholder: "sk-..." },
  ],
  ANTHROPIC_CLAUDE: [
    { key: "claudeApiKey", label: "API Key", type: "password", placeholder: "sk-ant-..." },
  ],
  BEDROCK_CLAUDE: [
    { key: "awsAccessKeyId", label: "AWS Access Key ID", type: "password", placeholder: "AKIA..." },
    { key: "awsSecretAccessKey", label: "AWS Secret Access Key", type: "password", placeholder: "Secret key" },
    { key: "awsRegion", label: "Regione AWS", type: "text", placeholder: "us-east-1" },
  ],
  OLLAMA: [],
};

const PROVIDER_LINKS: Record<AiProvider, { url: string; label: string } | null> = {
  OPENAI: { url: "https://platform.openai.com/api-keys", label: "Ottieni chiave" },
  ANTHROPIC_CLAUDE: { url: "https://console.anthropic.com/settings/keys", label: "Ottieni chiave" },
  BEDROCK_CLAUDE: { url: "https://console.aws.amazon.com/bedrock", label: "AWS Console" },
  OLLAMA: null,
};

const PROVIDER_HINTS: Record<AiProvider, string | null> = {
  OPENAI: null,
  ANTHROPIC_CLAUDE: null,
  BEDROCK_CLAUDE: "Richiede accesso a Claude su AWS Bedrock nella regione specificata",
  OLLAMA: "Modello AI locale, non richiede chiavi API. La configurazione URL/modello e' gestita dall'amministratore.",
};

interface ProviderCardProps {
  provider: MergedProvider;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onToggleActive: () => void;
  userFields: Record<string, string>;
  onFieldChange: (key: string, value: string) => void;
  onSave: () => void;
  isSaving: boolean;
  isAdmin: boolean;
  // Admin fields for Ollama
  adminFields?: Record<string, string>;
  onAdminFieldChange?: (key: string, value: string) => void;
  onAdminSaveOllama?: () => void;
}

export function ProviderCard({
  provider,
  isExpanded,
  onToggleExpand,
  onToggleActive,
  userFields,
  onFieldChange,
  onSave,
  isSaving,
  isAdmin,
  adminFields,
  onAdminFieldChange,
  onAdminSaveOllama,
}: ProviderCardProps) {
  const fields = PROVIDER_FIELDS[provider.id];
  const link = PROVIDER_LINKS[provider.id];
  const hint = PROVIDER_HINTS[provider.id];
  const isOllama = provider.id === "OLLAMA";

  const isConfigured = provider.userConfigured || provider.globalConfigured || provider.alwaysAvailable;
  const canActivate = isConfigured && !provider.isActive;

  // Check if user has filled in required fields for save
  const hasUserInput = fields.some((f) => (userFields[f.key] || "").trim() !== "");

  return (
    <div className={`provider-card ${provider.isActive ? "provider-card--active" : ""} ${!isConfigured && !isOllama ? "provider-card--unconfigured" : ""}`}>
      <div className="provider-card-header" onClick={onToggleExpand}>
        <div className="provider-card-info">
          <span className="provider-card-name">{provider.displayName}</span>
          <div className="provider-card-badges">
            {provider.alwaysAvailable ? (
              <span className="provider-card-badge provider-card-badge--available">Sempre disponibile</span>
            ) : provider.userConfigured ? (
              <span className="provider-card-badge provider-card-badge--configured">Chiave personale</span>
            ) : provider.globalConfigured ? (
              <span className="provider-card-badge provider-card-badge--global">Chiave globale</span>
            ) : (
              <span className="provider-card-badge provider-card-badge--none">Non configurato</span>
            )}
          </div>
        </div>
        <div className="provider-card-actions">
          <label
            className="provider-toggle"
            onClick={(e) => e.stopPropagation()}
            title={
              provider.isActive
                ? "Provider attivo"
                : canActivate
                  ? "Attiva questo provider"
                  : "Configura le credenziali per attivare"
            }
          >
            <input
              type="checkbox"
              checked={provider.isActive}
              onChange={() => canActivate && onToggleActive()}
              disabled={provider.isActive || (!isConfigured && !provider.alwaysAvailable) || isSaving}
            />
            <span className="provider-toggle-slider" />
          </label>
          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </div>

      {isExpanded && (
        <div className="provider-card-body">
          {/* User credential fields (not for Ollama) */}
          {fields.length > 0 && (
            <>
              {link && (
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="provider-card-link"
                >
                  {link.label}
                  <ExternalLink size={12} />
                </a>
              )}
              {fields.map((field) => (
                <div key={field.key} className="provider-card-field">
                  <label className="provider-card-field-label">{field.label}</label>
                  <input
                    type={field.type}
                    className="provider-card-field-input"
                    value={userFields[field.key] || ""}
                    onChange={(e) => onFieldChange(field.key, e.target.value)}
                    placeholder={
                      (provider.userConfigured || provider.globalConfigured)
                        ? "Inserisci nuova chiave per sovrascrivere"
                        : field.placeholder
                    }
                    disabled={isSaving}
                  />
                </div>
              ))}
              <button
                type="button"
                className="btn-primary provider-card-save"
                onClick={onSave}
                disabled={isSaving || !hasUserInput}
              >
                <Save size={14} />
                {isSaving ? "Salvataggio..." : "Salva"}
              </button>
            </>
          )}

          {/* Ollama admin config */}
          {isOllama && isAdmin && adminFields && onAdminFieldChange && onAdminSaveOllama && (
            <>
              <div className="provider-card-field">
                <label className="provider-card-field-label">URL Base</label>
                <input
                  type="text"
                  className="provider-card-field-input"
                  value={adminFields.ollamaBaseUrl || ""}
                  onChange={(e) => onAdminFieldChange("ollamaBaseUrl", e.target.value)}
                  placeholder="http://host.docker.internal:11434"
                  disabled={isSaving}
                />
              </div>
              <div className="provider-card-field">
                <label className="provider-card-field-label">Modello</label>
                <input
                  type="text"
                  className="provider-card-field-input"
                  value={adminFields.ollamaModel || ""}
                  onChange={(e) => onAdminFieldChange("ollamaModel", e.target.value)}
                  placeholder="qwen2.5:3b"
                  disabled={isSaving}
                />
              </div>
              <button
                type="button"
                className="btn-primary provider-card-save"
                onClick={onAdminSaveOllama}
                disabled={isSaving}
              >
                <Save size={14} />
                {isSaving ? "Salvataggio..." : "Salva configurazione"}
              </button>
            </>
          )}

          {isOllama && !isAdmin && (
            <p className="provider-card-hint">
              Configurazione gestita dall'amministratore.
            </p>
          )}

          {hint && <p className="provider-card-hint">{hint}</p>}
        </div>
      )}
    </div>
  );
}
