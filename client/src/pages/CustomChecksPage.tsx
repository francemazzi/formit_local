import { useState, useEffect, useCallback } from "react";
import { Plus, Upload, RefreshCw, FlaskConical } from "lucide-react";
import { categoriesApi, parametersApi } from "../api/customChecks";
import { CategoryCard, CategoryForm } from "../components";
import type {
  CustomCheckCategory,
  CreateCategoryInput,
  CreateParameterInput,
  UpdateParameterInput,
} from "../types";

export function CustomChecksPage() {
  const [categories, setCategories] = useState<CustomCheckCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingCategory, setEditingCategory] =
    useState<CustomCheckCategory | null>(null);

  const fetchCategories = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await categoriesApi.getAll();
      setCategories(data);
    } catch (err) {
      setError("Errore nel caricamento delle categorie");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const handleCreateCategory = async (data: CreateCategoryInput) => {
    try {
      setIsLoading(true);
      await categoriesApi.create(data);
      await fetchCategories();
      setShowCreateForm(false);
    } catch (err: any) {
      setError(
        err.response?.data?.error || "Errore nella creazione della categoria"
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateCategory = async (data: CreateCategoryInput) => {
    if (!editingCategory) return;
    try {
      setIsLoading(true);
      await categoriesApi.update(editingCategory.id, data);
      await fetchCategories();
      setEditingCategory(null);
    } catch (err: any) {
      setError(
        err.response?.data?.error || "Errore nella modifica della categoria"
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteCategory = async (id: string) => {
    if (
      !confirm(
        "Sei sicuro di voler eliminare questa categoria e tutti i suoi parametri?"
      )
    ) {
      return;
    }
    try {
      setIsLoading(true);
      await categoriesApi.delete(id);
      await fetchCategories();
    } catch (err: any) {
      setError(
        err.response?.data?.error || "Errore nell'eliminazione della categoria"
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddParameter = async (
    categoryId: string,
    data: CreateParameterInput
  ) => {
    try {
      setIsLoading(true);
      await parametersApi.create(categoryId, data);
      await fetchCategories();
    } catch (err: any) {
      setError(
        err.response?.data?.error || "Errore nell'aggiunta del parametro"
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateParameter = async (
    id: string,
    data: UpdateParameterInput
  ) => {
    try {
      setIsLoading(true);
      await parametersApi.update(id, data);
      await fetchCategories();
    } catch (err: any) {
      setError(
        err.response?.data?.error || "Errore nella modifica del parametro"
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteParameter = async (id: string) => {
    if (!confirm("Sei sicuro di voler eliminare questo parametro?")) {
      return;
    }
    try {
      setIsLoading(true);
      await parametersApi.delete(id);
      await fetchCategories();
    } catch (err: any) {
      setError(
        err.response?.data?.error || "Errore nell'eliminazione del parametro"
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportCategory = async (id: string) => {
    try {
      const data = await categoriesApi.export(id);
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${data.name.toLowerCase().replace(/\s+/g, "_")}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError("Errore nell'esportazione della categoria");
    }
  };

  const handleImportCategory = async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const data = JSON.parse(text);
        setIsLoading(true);
        await categoriesApi.import(data);
        await fetchCategories();
      } catch (err: any) {
        setError(
          err.response?.data?.error ||
            "Errore nell'importazione della categoria"
        );
      } finally {
        setIsLoading(false);
      }
    };
    input.click();
  };

  return (
    <div className="custom-checks-page">
      <header className="page-header">
        <div className="header-content">
          <div className="header-title">
            <FlaskConical size={32} />
            <div>
              <h1>Formit</h1>
              <p>
                Definisci categorie e parametri di conformità personalizzati
              </p>
            </div>
          </div>
          <div className="header-actions">
            <button
              className="btn-secondary"
              onClick={handleImportCategory}
              disabled={isLoading}
            >
              <Upload size={18} />
              Importa
            </button>
            <button
              className="btn-secondary"
              onClick={fetchCategories}
              disabled={isLoading}
            >
              <RefreshCw size={18} className={isLoading ? "spin" : ""} />
              Aggiorna
            </button>
            <button
              className="btn-primary"
              onClick={() => setShowCreateForm(true)}
              disabled={isLoading}
            >
              <Plus size={18} />
              Nuova Categoria
            </button>
          </div>
        </div>
      </header>

      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      <main className="page-content">
        {isLoading && categories.length === 0 ? (
          <div className="loading-state">
            <RefreshCw size={48} className="spin" />
            <p>Caricamento categorie...</p>
          </div>
        ) : categories.length === 0 ? (
          <div className="empty-state">
            <FlaskConical size={64} />
            <h2>Nessuna categoria definita</h2>
            <p>Crea la tua prima categoria di verifiche personalizzate</p>
            <button
              className="btn-primary"
              onClick={() => setShowCreateForm(true)}
            >
              <Plus size={18} />
              Crea Categoria
            </button>
          </div>
        ) : (
          <div className="categories-grid">
            {categories.map((category) => (
              <CategoryCard
                key={category.id}
                category={category}
                onEdit={() => setEditingCategory(category)}
                onDelete={() => handleDeleteCategory(category.id)}
                onAddParameter={(data) => handleAddParameter(category.id, data)}
                onEditParameter={handleUpdateParameter}
                onDeleteParameter={handleDeleteParameter}
                onExport={() => handleExportCategory(category.id)}
                isLoading={isLoading}
              />
            ))}
          </div>
        )}
      </main>

      {showCreateForm && (
        <CategoryForm
          onSubmit={handleCreateCategory}
          onCancel={() => setShowCreateForm(false)}
          isLoading={isLoading}
        />
      )}

      {editingCategory && (
        <CategoryForm
          onSubmit={handleUpdateCategory}
          onCancel={() => setEditingCategory(null)}
          initialData={{
            name: editingCategory.name,
            description: editingCategory.description,
            sampleType: editingCategory.sampleType,
          }}
          isLoading={isLoading}
        />
      )}
    </div>
  );
}
