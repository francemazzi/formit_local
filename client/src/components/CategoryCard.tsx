import { useState } from "react";
import { Edit2, Trash2, Plus, ChevronDown, ChevronUp, Download } from "lucide-react";
import type { CustomCheckCategory, CustomCheckParameter } from "../types";
import { ParameterForm } from "./ParameterForm";

interface CategoryCardProps {
  category: CustomCheckCategory;
  onEdit: () => void;
  onDelete: () => void;
  onAddParameter: (data: any) => void;
  onEditParameter: (id: string, data: any) => void;
  onDeleteParameter: (id: string) => void;
  onExport: () => void;
  isLoading?: boolean;
}

const SAMPLE_TYPE_BADGES: Record<string, { label: string; className: string }> = {
  FOOD_PRODUCT: { label: "🍕 Alimento", className: "badge-food" },
  BEVERAGE: { label: "🥤 Bevanda", className: "badge-beverage" },
  ENVIRONMENTAL_SWAB: { label: "🧪 Tampone Amb.", className: "badge-swab" },
  PERSONNEL_SWAB: { label: "👤 Tampone Op.", className: "badge-personnel" },
  OTHER: { label: "📦 Altro", className: "badge-other" },
};

export function CategoryCard({
  category,
  onEdit,
  onDelete,
  onAddParameter,
  onEditParameter,
  onDeleteParameter,
  onExport,
  isLoading,
}: CategoryCardProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [showAddParameter, setShowAddParameter] = useState(false);
  const [editingParameter, setEditingParameter] = useState<CustomCheckParameter | null>(null);

  const badge = SAMPLE_TYPE_BADGES[category.sampleType] || SAMPLE_TYPE_BADGES.OTHER;

  const handleAddParameter = (data: any) => {
    onAddParameter(data);
    setShowAddParameter(false);
  };

  const handleEditParameter = (data: any) => {
    if (editingParameter) {
      onEditParameter(editingParameter.id, data);
      setEditingParameter(null);
    }
  };

  return (
    <div className="category-card">
      <div className="category-header">
        <div className="category-title-row">
          <button
            className="btn-icon expand-btn"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </button>
          <div className="category-info">
            <h3>{category.name}</h3>
            {category.description && (
              <p className="category-description">{category.description}</p>
            )}
          </div>
          <span className={`badge ${badge.className}`}>{badge.label}</span>
        </div>
        <div className="category-actions">
          <button className="btn-icon" onClick={onExport} title="Esporta JSON">
            <Download size={18} />
          </button>
          <button className="btn-icon" onClick={onEdit} title="Modifica">
            <Edit2 size={18} />
          </button>
          <button className="btn-icon btn-danger" onClick={onDelete} title="Elimina">
            <Trash2 size={18} />
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="category-content">
          {category.parameters.length > 0 ? (
            <table className="parameters-table">
              <thead>
                <tr>
                  <th>Parametro</th>
                  <th>Metodo</th>
                  <th className="col-limit col-satisfactory">Soddisfacente</th>
                  <th className="col-limit col-acceptable">Accettabile</th>
                  <th className="col-limit col-unsatisfactory">Insoddisfacente</th>
                  <th className="col-actions">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {category.parameters.map((param) => (
                  <tr key={param.id}>
                    <td>
                      <div className="param-name">
                        <span className={`criterion-badge ${param.criterionType.toLowerCase()}`}>
                          {param.criterionType === "SAFETY" ? "⚠️" : "🧹"}
                        </span>
                        {param.parameter}
                      </div>
                    </td>
                    <td className="col-method">{param.analysisMethod || "—"}</td>
                    <td className="col-limit satisfactory">
                      {param.satisfactoryValue || "—"}
                    </td>
                    <td className="col-limit acceptable">
                      {param.acceptableValue || "—"}
                    </td>
                    <td className="col-limit unsatisfactory">
                      {param.unsatisfactoryValue || "—"}
                    </td>
                    <td className="col-actions">
                      <button
                        className="btn-icon-sm"
                        onClick={() => setEditingParameter(param)}
                        title="Modifica"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        className="btn-icon-sm btn-danger"
                        onClick={() => onDeleteParameter(param.id)}
                        title="Elimina"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty-parameters">
              <p>Nessun parametro definito</p>
            </div>
          )}

          <button
            className="btn-add-parameter"
            onClick={() => setShowAddParameter(true)}
            disabled={isLoading}
          >
            <Plus size={16} />
            Aggiungi Parametro
          </button>
        </div>
      )}

      {showAddParameter && (
        <ParameterForm
          onSubmit={handleAddParameter}
          onCancel={() => setShowAddParameter(false)}
          isLoading={isLoading}
        />
      )}

      {editingParameter && (
        <ParameterForm
          onSubmit={handleEditParameter}
          onCancel={() => setEditingParameter(null)}
          initialData={{
            parameter: editingParameter.parameter,
            analysisMethod: editingParameter.analysisMethod,
            criterionType: editingParameter.criterionType,
            satisfactoryValue: editingParameter.satisfactoryValue,
            acceptableValue: editingParameter.acceptableValue,
            unsatisfactoryValue: editingParameter.unsatisfactoryValue,
            bibliographicReferences: editingParameter.bibliographicReferences,
            notes: editingParameter.notes,
          }}
          isLoading={isLoading}
        />
      )}
    </div>
  );
}

