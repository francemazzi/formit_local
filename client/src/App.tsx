import { useState } from "react";
import { Settings as SettingsIcon } from "lucide-react";
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

  return (
    <div className="app">
      {/* Navigation */}
      <nav className="main-nav">
        <div className="nav-brand">
          <span className="brand-icon">🔬</span>
          <span className="brand-name">Formit</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
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
