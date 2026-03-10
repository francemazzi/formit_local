import { useState, useEffect, useCallback } from "react";
import {
  apiKeysApi,
  userApiKeysApi,
  type AiProvider,
  type ProviderInfo,
} from "../../api/apiKeys";

export interface MergedProvider {
  id: AiProvider;
  displayName: string;
  isActive: boolean;
  userConfigured: boolean;
  globalConfigured: boolean;
  alwaysAvailable: boolean;
}

interface SettingsData {
  providers: MergedProvider[];
  activeProvider: AiProvider;
  isLoading: boolean;
  error: string | null;
  setError: (err: string | null) => void;

  // User credential state per provider
  userFields: Record<string, string>;
  setUserField: (key: string, value: string) => void;

  // Admin credential state
  adminFields: Record<string, string>;
  setAdminField: (key: string, value: string) => void;

  // Actions
  activateProvider: (id: AiProvider) => Promise<void>;
  saveUserCredentials: (providerId: AiProvider) => Promise<void>;
  saveAdminClaudeKey: () => Promise<void>;
  saveAdminAwsCredentials: () => Promise<void>;
  saveAdminOllamaConfig: () => Promise<void>;
  saveAdminGlobalKeys: () => Promise<void>;
  saveUserTavily: () => Promise<void>;

  // Tavily state
  userTavilyConfigured: boolean;
  globalTavilyConfigured: boolean;

  // Saving states
  isSaving: boolean;
  successMessage: string | null;

  // Admin global keys configured state
  globalOpenaiConfigured: boolean;
  globalClaudeConfigured: boolean;
  globalAwsConfigured: boolean;
}

const PROVIDER_NAMES: Record<AiProvider, string> = {
  OPENAI: "OpenAI",
  ANTHROPIC_CLAUDE: "Claude (Anthropic)",
  BEDROCK_CLAUDE: "Claude (AWS Bedrock)",
  OLLAMA: "Ollama (Locale)",
};

export function useSettingsData(isAdmin: boolean): SettingsData {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Raw server data
  const [globalProviders, setGlobalProviders] = useState<ProviderInfo[]>([]);
  const [globalActiveProvider, setGlobalActiveProvider] = useState<AiProvider>("OPENAI");
  const [userActiveProvider, setUserActiveProvider] = useState<AiProvider | null>(null);

  // User configured flags
  const [userOpenaiConfigured, setUserOpenaiConfigured] = useState(false);
  const [userClaudeConfigured, setUserClaudeConfigured] = useState(false);
  const [userAwsConfigured, setUserAwsConfigured] = useState(false);
  const [userTavilyConfigured, setUserTavilyConfigured] = useState(false);

  // Global configured flags
  const [globalTavilyConfigured, setGlobalTavilyConfigured] = useState(false);
  const [globalOpenaiConfigured, setGlobalOpenaiConfigured] = useState(false);
  const [globalClaudeConfigured, setGlobalClaudeConfigured] = useState(false);
  const [globalAwsConfigured, setGlobalAwsConfigured] = useState(false);

  // User field inputs
  const [userFields, setUserFieldsState] = useState<Record<string, string>>({
    openaiApiKey: "",
    claudeApiKey: "",
    awsAccessKeyId: "",
    awsSecretAccessKey: "",
    awsRegion: "us-east-1",
    tavilyApiKey: "",
  });

  // Admin field inputs
  const [adminFields, setAdminFieldsState] = useState<Record<string, string>>({
    openaiApiKey: "",
    tavilyApiKey: "",
    claudeApiKey: "",
    awsAccessKeyId: "",
    awsSecretAccessKey: "",
    awsRegion: "us-east-1",
    ollamaBaseUrl: "http://host.docker.internal:11434",
    ollamaModel: "qwen2.5:3b",
  });

  const setUserField = useCallback((key: string, value: string) => {
    setUserFieldsState((prev) => ({ ...prev, [key]: value }));
  }, []);

  const setAdminField = useCallback((key: string, value: string) => {
    setAdminFieldsState((prev) => ({ ...prev, [key]: value }));
  }, []);

  const showSuccess = useCallback((msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(null), 2000);
  }, []);

  const loadAll = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Always load user keys
      const userConfig = await userApiKeysApi.get();
      setUserOpenaiConfigured(!!userConfig.openaiApiKey);
      setUserClaudeConfigured(!!userConfig.claudeApiKey);
      setUserAwsConfigured(!!userConfig.awsAccessKeyId);
      setUserTavilyConfigured(!!userConfig.tavilyApiKey);
      setUserActiveProvider(userConfig.activeProvider);

      // Load admin data if admin
      if (isAdmin) {
        const [globalConfig, providersRes] = await Promise.all([
          apiKeysApi.get(),
          apiKeysApi.getProviders(),
        ]);

        setGlobalProviders(providersRes.providers);
        setGlobalActiveProvider(providersRes.activeProvider);
        setGlobalTavilyConfigured(!!globalConfig.tavilyApiKey);
        setGlobalOpenaiConfigured(!!globalConfig.openaiApiKey);
        setGlobalClaudeConfigured(!!globalConfig.claudeApiKey);
        setGlobalAwsConfigured(!!globalConfig.awsAccessKeyId);

        if (globalConfig.awsRegion) {
          setAdminFieldsState((prev) => ({ ...prev, awsRegion: globalConfig.awsRegion! }));
        }
        if (globalConfig.ollamaBaseUrl) {
          setAdminFieldsState((prev) => ({ ...prev, ollamaBaseUrl: globalConfig.ollamaBaseUrl! }));
        }
        if (globalConfig.ollamaModel) {
          setAdminFieldsState((prev) => ({ ...prev, ollamaModel: globalConfig.ollamaModel! }));
        }
      } else {
        // Non-admin: try to get providers for display
        try {
          const providersRes = await apiKeysApi.getProviders();
          setGlobalProviders(providersRes.providers);
          setGlobalActiveProvider(providersRes.activeProvider);
        } catch {
          // Non-admin may not have access, that's fine
        }
      }
    } catch (err: any) {
      setError(err.response?.data?.error || "Errore nel caricamento delle impostazioni");
    } finally {
      setIsLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Compute effective active provider
  const activeProvider = userActiveProvider ?? globalActiveProvider;

  // Build merged providers list
  const providers: MergedProvider[] = (["OPENAI", "ANTHROPIC_CLAUDE", "BEDROCK_CLAUDE", "OLLAMA"] as AiProvider[]).map((id) => {
    const globalInfo = globalProviders.find((p) => p.id === id);
    const isOllama = id === "OLLAMA";

    let userConf = false;
    if (id === "OPENAI") userConf = userOpenaiConfigured;
    else if (id === "ANTHROPIC_CLAUDE") userConf = userClaudeConfigured;
    else if (id === "BEDROCK_CLAUDE") userConf = userAwsConfigured;

    return {
      id,
      displayName: PROVIDER_NAMES[id],
      isActive: activeProvider === id,
      userConfigured: userConf,
      globalConfigured: globalInfo?.configured ?? false,
      alwaysAvailable: isOllama,
    };
  });

  // Actions
  const activateProvider = async (id: AiProvider) => {
    setIsSaving(true);
    setError(null);
    try {
      // Use user API to set active provider (works for all users)
      await userApiKeysApi.update({ activeProvider: id });
      setUserActiveProvider(id);
      showSuccess("Provider attivato!");

      // If admin, also update global
      if (isAdmin) {
        await apiKeysApi.setActiveProvider(id);
        setGlobalActiveProvider(id);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || "Errore nel cambio provider");
    } finally {
      setIsSaving(false);
    }
  };

  const saveUserCredentials = async (providerId: AiProvider) => {
    setIsSaving(true);
    setError(null);
    try {
      const data: Record<string, string | null> = {};

      if (providerId === "OPENAI") {
        const key = userFields.openaiApiKey.trim();
        if (!key) return;
        data.openaiApiKey = key;
      } else if (providerId === "ANTHROPIC_CLAUDE") {
        const key = userFields.claudeApiKey.trim();
        if (!key) return;
        data.claudeApiKey = key;
      } else if (providerId === "BEDROCK_CLAUDE") {
        const keyId = userFields.awsAccessKeyId.trim();
        const secret = userFields.awsSecretAccessKey.trim();
        if (!keyId || !secret) return;
        data.awsAccessKeyId = keyId;
        data.awsSecretAccessKey = secret;
        data.awsRegion = userFields.awsRegion.trim() || "us-east-1";
      }

      await userApiKeysApi.update(data);
      showSuccess("Credenziali salvate!");

      // Reset fields
      if (providerId === "OPENAI") {
        setUserField("openaiApiKey", "");
        setUserOpenaiConfigured(true);
      } else if (providerId === "ANTHROPIC_CLAUDE") {
        setUserField("claudeApiKey", "");
        setUserClaudeConfigured(true);
      } else if (providerId === "BEDROCK_CLAUDE") {
        setUserField("awsAccessKeyId", "");
        setUserField("awsSecretAccessKey", "");
        setUserAwsConfigured(true);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || "Errore nel salvataggio delle credenziali");
    } finally {
      setIsSaving(false);
    }
  };

  const saveUserTavily = async () => {
    const key = userFields.tavilyApiKey.trim();
    if (!key) return;
    setIsSaving(true);
    setError(null);
    try {
      await userApiKeysApi.update({ tavilyApiKey: key });
      setUserField("tavilyApiKey", "");
      setUserTavilyConfigured(true);
      showSuccess("Chiave Tavily salvata!");
    } catch (err: any) {
      setError(err.response?.data?.error || "Errore nel salvataggio");
    } finally {
      setIsSaving(false);
    }
  };

  const saveAdminClaudeKey = async () => {
    const key = adminFields.claudeApiKey.trim();
    if (!key) return;
    setIsSaving(true);
    setError(null);
    try {
      await apiKeysApi.updateClaudeApiKey({ claudeApiKey: key });
      setAdminField("claudeApiKey", "");
      setGlobalClaudeConfigured(true);
      showSuccess("Chiave Claude globale salvata!");
      await loadAll();
    } catch (err: any) {
      setError(err.response?.data?.error || "Errore nel salvataggio");
    } finally {
      setIsSaving(false);
    }
  };

  const saveAdminAwsCredentials = async () => {
    const keyId = adminFields.awsAccessKeyId.trim();
    const secret = adminFields.awsSecretAccessKey.trim();
    if (!keyId || !secret) return;
    setIsSaving(true);
    setError(null);
    try {
      await apiKeysApi.updateAwsCredentials({
        awsAccessKeyId: keyId,
        awsSecretAccessKey: secret,
        awsRegion: adminFields.awsRegion.trim() || "us-east-1",
      });
      setAdminField("awsAccessKeyId", "");
      setAdminField("awsSecretAccessKey", "");
      setGlobalAwsConfigured(true);
      showSuccess("Credenziali AWS globali salvate!");
      await loadAll();
    } catch (err: any) {
      setError(err.response?.data?.error || "Errore nel salvataggio");
    } finally {
      setIsSaving(false);
    }
  };

  const saveAdminOllamaConfig = async () => {
    setIsSaving(true);
    setError(null);
    try {
      await apiKeysApi.updateOllamaConfig({
        ollamaBaseUrl: adminFields.ollamaBaseUrl.trim() || null,
        ollamaModel: adminFields.ollamaModel.trim() || null,
      });
      showSuccess("Configurazione Ollama salvata!");
      await loadAll();
    } catch (err: any) {
      setError(err.response?.data?.error || "Errore nel salvataggio");
    } finally {
      setIsSaving(false);
    }
  };

  const saveAdminGlobalKeys = async () => {
    setIsSaving(true);
    setError(null);
    try {
      await apiKeysApi.update({
        tavilyApiKey: adminFields.tavilyApiKey.trim() || null,
        openaiApiKey: adminFields.openaiApiKey.trim() || null,
      });
      setAdminField("tavilyApiKey", "");
      setAdminField("openaiApiKey", "");
      showSuccess("Chiavi globali salvate!");
      await loadAll();
    } catch (err: any) {
      setError(err.response?.data?.error || "Errore nel salvataggio");
    } finally {
      setIsSaving(false);
    }
  };

  return {
    providers,
    activeProvider,
    isLoading,
    error,
    setError,
    userFields,
    setUserField,
    adminFields,
    setAdminField,
    activateProvider,
    saveUserCredentials,
    saveAdminClaudeKey,
    saveAdminAwsCredentials,
    saveAdminOllamaConfig,
    saveAdminGlobalKeys,
    saveUserTavily,
    userTavilyConfigured,
    globalTavilyConfigured,
    isSaving,
    successMessage,
    globalOpenaiConfigured,
    globalClaudeConfigured,
    globalAwsConfigured,
  };
}
