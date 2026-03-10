import { useState, useEffect } from "react";
import { Settings as SettingsIcon, Menu, X, Cpu } from "lucide-react";
import { envSetupApi, type AiProvider } from "./api/apiKeys";
import { CustomChecksPage } from "./pages/CustomChecksPage";
import { ConformityPage } from "./pages/ConformityPage";
import { LoginPage } from "./pages/LoginPage";
import { AdminPage } from "./pages/AdminPage";
import { Settings } from "./components/Settings";
import { UserMenu } from "./components/UserMenu";
import { useAuth } from "./context/AuthContext";
import "./App.css";

type Page = "conformity" | "custom-checks" | "admin";

function App() {
  const { user, isLoading, isAuthenticated, isAdmin, logout } = useAuth();
  const [currentPage, setCurrentPage] = useState<Page>("conformity");
  const [showSettings, setShowSettings] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeProvider, setActiveProvider] = useState<AiProvider | null>(null);
  const [userHasKeys, setUserHasKeys] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      envSetupApi.getStatus().then((status) => {
        setActiveProvider(status.activeProvider);
        setUserHasKeys(status.userHasKeys);
      }).catch(() => {});
    }
  }, [isAuthenticated]);

  if (isLoading) {
    return (
      <div className="app loading-screen">
        <div className="loading-spinner-container">
          <span className="brand-icon" style={{ fontSize: "3rem" }}>
            🔬
          </span>
          <p>Caricamento Formit...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  const providerLabel = (() => {
    if (!activeProvider) return null;
    if (activeProvider === "OLLAMA") return "Modello locale";
    if (activeProvider === "OPENAI") return "OpenAI";
    if (activeProvider === "ANTHROPIC_CLAUDE") return "Claude";
    if (activeProvider === "BEDROCK_CLAUDE") return "AWS Bedrock";
    return activeProvider;
  })();

  const isLocalProvider = activeProvider === "OLLAMA" && !userHasKeys;

  return (
    <div className="app">
      {/* Navigation */}
      <nav className="main-nav">
        <div className="nav-top-row">
          <div className="nav-brand">
            <span className="brand-icon">🔬</span>
            <span className="brand-name">Formit</span>
          </div>

          {/* Desktop nav items */}
          <div className="nav-desktop">
            <div className="nav-links">
              <button
                className={`nav-link ${currentPage === "conformity" ? "active" : ""}`}
                onClick={() => setCurrentPage("conformity")}
              >
                Verifica PDF
              </button>
              <button
                className={`nav-link ${currentPage === "custom-checks" ? "active" : ""}`}
                onClick={() => setCurrentPage("custom-checks")}
              >
                Verifiche Custom
              </button>
              {isAdmin && (
                <button
                  className={`nav-link ${currentPage === "admin" ? "active" : ""}`}
                  onClick={() => setCurrentPage("admin")}
                >
                  Admin
                </button>
              )}
            </div>
            {providerLabel && (
              <span
                className={`provider-badge ${isLocalProvider ? "provider-badge--local" : "provider-badge--cloud"}`}
                onClick={() => setShowSettings(true)}
                title={isLocalProvider ? "Stai usando il modello locale. Clicca per configurare API key." : `Provider attivo: ${providerLabel}`}
              >
                <Cpu size={12} />
                {providerLabel}
              </span>
            )}
            <button
              className="btn-icon"
              onClick={() => setShowSettings(true)}
              title="Impostazioni"
            >
              <SettingsIcon size={20} />
            </button>
            <UserMenu
              user={user!}
              onLogout={logout}
              onNavigateToAdmin={
                isAdmin ? () => setCurrentPage("admin") : undefined
              }
            />
          </div>

          {/* Mobile hamburger button */}
          <button
            className="btn-icon mobile-menu-toggle"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Menu"
          >
            {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        {/* Mobile collapsible menu */}
        {mobileMenuOpen && (
          <div className="nav-mobile-menu">
            <button
              className={`nav-link ${currentPage === "conformity" ? "active" : ""}`}
              onClick={() => { setCurrentPage("conformity"); setMobileMenuOpen(false); }}
            >
              Verifica PDF
            </button>
            <button
              className={`nav-link ${currentPage === "custom-checks" ? "active" : ""}`}
              onClick={() => { setCurrentPage("custom-checks"); setMobileMenuOpen(false); }}
            >
              Verifiche Custom
            </button>
            {isAdmin && (
              <button
                className={`nav-link ${currentPage === "admin" ? "active" : ""}`}
                onClick={() => { setCurrentPage("admin"); setMobileMenuOpen(false); }}
              >
                Admin
              </button>
            )}
            <div className="nav-mobile-actions">
              {providerLabel && (
                <span
                  className={`provider-badge ${isLocalProvider ? "provider-badge--local" : "provider-badge--cloud"}`}
                  onClick={() => { setShowSettings(true); setMobileMenuOpen(false); }}
                >
                  <Cpu size={12} />
                  {providerLabel}
                </span>
              )}
              <button
                className="btn-icon"
                onClick={() => { setShowSettings(true); setMobileMenuOpen(false); }}
                title="Impostazioni"
              >
                <SettingsIcon size={20} />
              </button>
              <UserMenu
                user={user!}
                onLogout={logout}
                onNavigateToAdmin={
                  isAdmin ? () => { setCurrentPage("admin"); setMobileMenuOpen(false); } : undefined
                }
              />
            </div>
          </div>
        )}
      </nav>

      {/* Page Content */}
      <div className="page-container">
        {currentPage === "conformity" && (
          <ConformityPage
            onNavigateToCustomChecks={() => setCurrentPage("custom-checks")}
          />
        )}
        {currentPage === "custom-checks" && <CustomChecksPage />}
        {currentPage === "admin" && isAdmin && <AdminPage />}
      </div>

      {/* Settings Modal */}
      {showSettings && <Settings onClose={() => setShowSettings(false)} />}
    </div>
  );
}

export default App;
