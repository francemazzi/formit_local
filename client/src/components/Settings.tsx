import { X, Settings as SettingsIcon, Check } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useSettingsData } from "./settings/useSettingsData";
import { ProviderCardList } from "./settings/ProviderCardList";
import { TavilySection } from "./settings/TavilySection";
import { UpdateSection } from "./settings/UpdateSection";

interface SettingsProps {
  onClose: () => void;
}

export function Settings({ onClose }: SettingsProps) {
  const { isAdmin } = useAuth();
  const data = useSettingsData(isAdmin);

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: "600px" }}>
        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <SettingsIcon size={20} />
            <h2>Impostazioni</h2>
          </div>
          <button className="btn-icon" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="settings-content">
          {data.error && (
            <div className="error-banner" style={{ marginBottom: "1rem" }}>
              <span>{data.error}</span>
              <button onClick={() => data.setError(null)}>×</button>
            </div>
          )}

          {data.successMessage && (
            <div className="settings-success-msg">
              <Check size={16} />
              {data.successMessage}
            </div>
          )}

          {data.isLoading ? (
            <p style={{ color: "var(--text-secondary)", textAlign: "center", padding: "2rem 0" }}>
              Caricamento...
            </p>
          ) : (
            <>
              <ProviderCardList
                providers={data.providers}
                userFields={data.userFields}
                onUserFieldChange={data.setUserField}
                onActivateProvider={data.activateProvider}
                onSaveUserCredentials={data.saveUserCredentials}
                isSaving={data.isSaving}
                isAdmin={isAdmin}
                adminFields={data.adminFields}
                onAdminFieldChange={data.setAdminField}
                onAdminSaveOllama={data.saveAdminOllamaConfig}
              />

              <TavilySection
                userTavilyConfigured={data.userTavilyConfigured}
                globalTavilyConfigured={data.globalTavilyConfigured}
                userTavilyKey={data.userFields.tavilyApiKey}
                onUserTavilyChange={(v) => data.setUserField("tavilyApiKey", v)}
                onSaveUserTavily={data.saveUserTavily}
                isSaving={data.isSaving}
                isAdmin={isAdmin}
                adminTavilyKey={data.adminFields.tavilyApiKey}
                adminOpenaiKey={data.adminFields.openaiApiKey}
                globalOpenaiConfigured={data.globalOpenaiConfigured}
                onAdminFieldChange={data.setAdminField}
                onSaveAdminGlobalKeys={data.saveAdminGlobalKeys}
              />

              {isAdmin && <UpdateSection />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
