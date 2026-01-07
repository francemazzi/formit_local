import { useState } from "react";
import { X, Save } from "lucide-react";
import type { CreateCategoryInput, CustomSampleType } from "../types";

interface CategoryFormProps {
  onSubmit: (data: CreateCategoryInput) => void;
  onCancel: () => void;
  initialData?: CreateCategoryInput;
  isLoading?: boolean;
}

const SAMPLE_TYPES: { value: CustomSampleType; label: string }[] = [
  { value: "FOOD_PRODUCT", label: "🍕 Alimento (UFC/g)" },
  { value: "BEVERAGE", label: "🥤 Bevanda" },
  { value: "ENVIRONMENTAL_SWAB", label: "🧪 Tampone Ambientale (UFC/cm²)" },
  { value: "PERSONNEL_SWAB", label: "👤 Tampone Operatore" },
  { value: "OTHER", label: "📦 Altro" },
];

export function CategoryForm({ onSubmit, onCancel, initialData, isLoading }: CategoryFormProps) {
  const [name, setName] = useState(initialData?.name || "");
  const [description, setDescription] = useState(initialData?.description || "");
  const [sampleType, setSampleType] = useState<CustomSampleType>(
    initialData?.sampleType || "FOOD_PRODUCT"
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    onSubmit({
      name: name.trim(),
      description: description.trim() || null,
      sampleType,
    });
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <h2>{initialData ? "Modifica Categoria" : "Nuova Categoria"}</h2>
          <button className="btn-icon" onClick={onCancel} disabled={isLoading}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="name">Nome *</label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="es. Gelati Artigianali"
              required
              disabled={isLoading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="description">Descrizione</label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descrizione opzionale della categoria..."
              rows={3}
              disabled={isLoading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="sampleType">Tipo di Campione</label>
            <select
              id="sampleType"
              value={sampleType}
              onChange={(e) => setSampleType(e.target.value as CustomSampleType)}
              disabled={isLoading}
            >
              {SAMPLE_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onCancel} disabled={isLoading}>
              Annulla
            </button>
            <button type="submit" className="btn-primary" disabled={isLoading || !name.trim()}>
              <Save size={16} />
              {isLoading ? "Salvataggio..." : "Salva"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

