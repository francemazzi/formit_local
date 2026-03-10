import { ExternalLink, Save } from "lucide-react";

interface TavilySectionProps {
  userTavilyConfigured: boolean;
  globalTavilyConfigured: boolean;
  userTavilyKey: string;
  onUserTavilyChange: (value: string) => void;
  onSaveUserTavily: () => void;
  isSaving: boolean;
  isAdmin: boolean;
  // Admin global tavily
  adminTavilyKey?: string;
  adminOpenaiKey?: string;
  globalOpenaiConfigured?: boolean;
  onAdminFieldChange?: (key: string, value: string) => void;
  onSaveAdminGlobalKeys?: () => void;
}

export function TavilySection({
  userTavilyConfigured,
  globalTavilyConfigured,
  userTavilyKey,
  onUserTavilyChange,
  onSaveUserTavily,
  isSaving,
  isAdmin,
  adminTavilyKey,
  adminOpenaiKey,
  globalOpenaiConfigured,
  onAdminFieldChange,
  onSaveAdminGlobalKeys,
}: TavilySectionProps) {
  return (
    <div className="settings-section">
      <h3 className="settings-section-title">Tavily (Ricerca Web)</h3>
      <p className="settings-section-subtitle">
        Chiave opzionale per la ricerca normative online
      </p>

      <div className="provider-card">
        <div className="provider-card-body" style={{ paddingTop: "1rem" }}>
          <div className="provider-card-field">
            <label className="provider-card-field-label">
              La mia chiave Tavily
              {userTavilyConfigured && (
                <span className="provider-card-badge provider-card-badge--configured" style={{ marginLeft: "0.5rem" }}>
                  Configurata
                </span>
              )}
            </label>
            <input
              type="password"
              className="provider-card-field-input"
              value={userTavilyKey}
              onChange={(e) => onUserTavilyChange(e.target.value)}
              placeholder={userTavilyConfigured ? "Inserisci nuova chiave per sovrascrivere" : "tvly-..."}
              disabled={isSaving}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <button
              type="button"
              className="btn-primary provider-card-save"
              onClick={onSaveUserTavily}
              disabled={isSaving || !userTavilyKey.trim()}
            >
              <Save size={14} />
              Salva
            </button>
            <a
              href="https://tavily.com"
              target="_blank"
              rel="noopener noreferrer"
              className="provider-card-link"
            >
              Ottieni chiave
              <ExternalLink size={12} />
            </a>
          </div>
        </div>
      </div>

      {/* Admin global keys section */}
      {isAdmin && onAdminFieldChange && onSaveAdminGlobalKeys && (
        <div className="settings-admin-subsection">
          <h4 className="settings-subsection-title">Chiavi Globali (Admin)</h4>
          <p className="settings-section-subtitle">
            Chiavi condivise per utenti senza chiavi personali
          </p>

          <div className="provider-card">
            <div className="provider-card-body" style={{ paddingTop: "1rem" }}>
              <div className="provider-card-field">
                <label className="provider-card-field-label">
                  Tavily API Key (globale)
                  {globalTavilyConfigured && (
                    <span className="provider-card-badge provider-card-badge--configured" style={{ marginLeft: "0.5rem" }}>
                      Configurata
                    </span>
                  )}
                </label>
                <input
                  type="password"
                  className="provider-card-field-input"
                  value={adminTavilyKey || ""}
                  onChange={(e) => onAdminFieldChange("tavilyApiKey", e.target.value)}
                  placeholder={globalTavilyConfigured ? "Inserisci nuova chiave per sovrascrivere" : "tvly-..."}
                  disabled={isSaving}
                />
              </div>
              <div className="provider-card-field">
                <label className="provider-card-field-label">
                  OpenAI API Key (globale)
                  {globalOpenaiConfigured && (
                    <span className="provider-card-badge provider-card-badge--configured" style={{ marginLeft: "0.5rem" }}>
                      Configurata
                    </span>
                  )}
                </label>
                <input
                  type="password"
                  className="provider-card-field-input"
                  value={adminOpenaiKey || ""}
                  onChange={(e) => onAdminFieldChange("openaiApiKey", e.target.value)}
                  placeholder={globalOpenaiConfigured ? "Inserisci nuova chiave per sovrascrivere" : "sk-..."}
                  disabled={isSaving}
                />
              </div>
              <button
                type="button"
                className="btn-primary provider-card-save"
                onClick={onSaveAdminGlobalKeys}
                disabled={isSaving || (!(adminTavilyKey || "").trim() && !(adminOpenaiKey || "").trim())}
              >
                <Save size={14} />
                Salva chiavi globali
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
