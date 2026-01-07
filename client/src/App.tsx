import { useState } from "react";
import { Settings as SettingsIcon } from "lucide-react";
import { CustomChecksPage } from "./pages/CustomChecksPage";
import { ConformityPage } from "./pages/ConformityPage";
import { Settings } from "./components/Settings";
import "./App.css";

type Page = "conformity" | "custom-checks";

function App() {
  const [currentPage, setCurrentPage] = useState<Page>("conformity");
  const [showSettings, setShowSettings] = useState(false);

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
              📄 Verifica PDF
            </button>
            <button
              className={`nav-link ${currentPage === "custom-checks" ? "active" : ""}`}
              onClick={() => setCurrentPage("custom-checks")}
            >
              ⚗️ Verifiche Custom
            </button>
          </div>
          <button
            className="btn-icon"
            onClick={() => setShowSettings(true)}
            title="Impostazioni"
          >
            <SettingsIcon size={20} />
          </button>
        </div>
      </nav>

      {/* Page Content */}
      <div className="page-container">
        {currentPage === "conformity" && (
          <ConformityPage onNavigateToCustomChecks={() => setCurrentPage("custom-checks")} />
        )}
        {currentPage === "custom-checks" && <CustomChecksPage />}
      </div>

      {/* Settings Modal */}
      {showSettings && <Settings onClose={() => setShowSettings(false)} />}
    </div>
  );
}

export default App;
