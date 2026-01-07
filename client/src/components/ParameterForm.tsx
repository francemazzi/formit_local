import { useState } from "react";
import { X, Save } from "lucide-react";
import type { CreateParameterInput, CriterionType } from "../types";

interface ParameterFormProps {
  onSubmit: (data: CreateParameterInput) => void;
  onCancel: () => void;
  initialData?: CreateParameterInput;
  isLoading?: boolean;
}

const CRITERION_TYPES: { value: CriterionType; label: string }[] = [
  { value: "HYGIENE", label: "🧹 Criterio di Igiene" },
  { value: "SAFETY", label: "⚠️ Criterio di Sicurezza" },
];

export function ParameterForm({ onSubmit, onCancel, initialData, isLoading }: ParameterFormProps) {
  const [parameter, setParameter] = useState(initialData?.parameter || "");
  const [analysisMethod, setAnalysisMethod] = useState(initialData?.analysisMethod || "");
  const [criterionType, setCriterionType] = useState<CriterionType>(
    initialData?.criterionType || "HYGIENE"
  );
  const [satisfactoryValue, setSatisfactoryValue] = useState(initialData?.satisfactoryValue || "");
  const [acceptableValue, setAcceptableValue] = useState(initialData?.acceptableValue || "");
  const [unsatisfactoryValue, setUnsatisfactoryValue] = useState(
    initialData?.unsatisfactoryValue || ""
  );
  const [bibliographicReferences, setBibliographicReferences] = useState(
    initialData?.bibliographicReferences || ""
  );
  const [notes, setNotes] = useState(initialData?.notes || "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!parameter.trim()) return;

    onSubmit({
      parameter: parameter.trim(),
      analysisMethod: analysisMethod.trim() || null,
      criterionType,
      satisfactoryValue: satisfactoryValue.trim() || null,
      acceptableValue: acceptableValue.trim() || null,
      unsatisfactoryValue: unsatisfactoryValue.trim() || null,
      bibliographicReferences: bibliographicReferences.trim() || null,
      notes: notes.trim() || null,
    });
  };

  return (
    <div className="modal-overlay">
      <div className="modal modal-lg">
        <div className="modal-header">
          <h2>{initialData ? "Modifica Parametro" : "Nuovo Parametro"}</h2>
          <button className="btn-icon" onClick={onCancel} disabled={isLoading}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="parameter">Nome Parametro *</label>
              <input
                id="parameter"
                type="text"
                value={parameter}
                onChange={(e) => setParameter(e.target.value)}
                placeholder="es. Escherichia coli"
                required
                disabled={isLoading}
              />
            </div>

            <div className="form-group">
              <label htmlFor="analysisMethod">Metodo di Analisi</label>
              <input
                id="analysisMethod"
                type="text"
                value={analysisMethod}
                onChange={(e) => setAnalysisMethod(e.target.value)}
                placeholder="es. ISO 16649-2"
                disabled={isLoading}
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="criterionType">Tipo di Criterio</label>
            <select
              id="criterionType"
              value={criterionType}
              onChange={(e) => setCriterionType(e.target.value as CriterionType)}
              disabled={isLoading}
            >
              {CRITERION_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          <div className="limits-section">
            <h3>Limiti di Conformità</h3>
            <div className="form-row limits-row">
              <div className="form-group limit-satisfactory">
                <label htmlFor="satisfactoryValue">✅ Soddisfacente</label>
                <input
                  id="satisfactoryValue"
                  type="text"
                  value={satisfactoryValue}
                  onChange={(e) => setSatisfactoryValue(e.target.value)}
                  placeholder="es. <10 (ufc/g)"
                  disabled={isLoading}
                />
              </div>

              <div className="form-group limit-acceptable">
                <label htmlFor="acceptableValue">⚡ Accettabile</label>
                <input
                  id="acceptableValue"
                  type="text"
                  value={acceptableValue}
                  onChange={(e) => setAcceptableValue(e.target.value)}
                  placeholder="es. 10≤ x <100 (ufc/g)"
                  disabled={isLoading}
                />
              </div>

              <div className="form-group limit-unsatisfactory">
                <label htmlFor="unsatisfactoryValue">❌ Insoddisfacente</label>
                <input
                  id="unsatisfactoryValue"
                  type="text"
                  value={unsatisfactoryValue}
                  onChange={(e) => setUnsatisfactoryValue(e.target.value)}
                  placeholder="es. ≥100 (ufc/g)"
                  disabled={isLoading}
                />
              </div>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="bibliographicReferences">Riferimenti Normativi</label>
            <input
              id="bibliographicReferences"
              type="text"
              value={bibliographicReferences}
              onChange={(e) => setBibliographicReferences(e.target.value)}
              placeholder="es. Reg. CE 2073/05"
              disabled={isLoading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="notes">Note</label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Note aggiuntive..."
              rows={2}
              disabled={isLoading}
            />
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onCancel} disabled={isLoading}>
              Annulla
            </button>
            <button type="submit" className="btn-primary" disabled={isLoading || !parameter.trim()}>
              <Save size={16} />
              {isLoading ? "Salvataggio..." : "Salva"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

