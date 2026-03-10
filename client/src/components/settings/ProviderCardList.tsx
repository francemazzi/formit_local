import { useState } from "react";
import { Cpu } from "lucide-react";
import { ProviderCard } from "./ProviderCard";
import type { MergedProvider } from "./useSettingsData";
import type { AiProvider } from "../../api/apiKeys";

interface ProviderCardListProps {
  providers: MergedProvider[];
  userFields: Record<string, string>;
  onUserFieldChange: (key: string, value: string) => void;
  onActivateProvider: (id: AiProvider) => Promise<void>;
  onSaveUserCredentials: (id: AiProvider) => Promise<void>;
  isSaving: boolean;
  isAdmin: boolean;
  adminFields?: Record<string, string>;
  onAdminFieldChange?: (key: string, value: string) => void;
  onAdminSaveOllama?: () => void;
}

export function ProviderCardList({
  providers,
  userFields,
  onUserFieldChange,
  onActivateProvider,
  onSaveUserCredentials,
  isSaving,
  isAdmin,
  adminFields,
  onAdminFieldChange,
  onAdminSaveOllama,
}: ProviderCardListProps) {
  const [expandedId, setExpandedId] = useState<AiProvider | null>(null);

  return (
    <div className="provider-card-list">
      <h3 className="settings-section-title">
        <Cpu size={18} />
        Provider AI
      </h3>
      <p className="settings-section-subtitle">
        Seleziona il provider AI attivo e configura le credenziali
      </p>

      {providers.map((provider) => (
        <ProviderCard
          key={provider.id}
          provider={provider}
          isExpanded={expandedId === provider.id}
          onToggleExpand={() =>
            setExpandedId(expandedId === provider.id ? null : provider.id)
          }
          onToggleActive={() => onActivateProvider(provider.id)}
          userFields={userFields}
          onFieldChange={onUserFieldChange}
          onSave={() => onSaveUserCredentials(provider.id)}
          isSaving={isSaving}
          isAdmin={isAdmin}
          adminFields={adminFields}
          onAdminFieldChange={onAdminFieldChange}
          onAdminSaveOllama={onAdminSaveOllama}
        />
      ))}
    </div>
  );
}
