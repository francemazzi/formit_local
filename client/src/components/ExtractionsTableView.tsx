import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  Filter,
  ArrowUp,
  ArrowDown,
  Eye,
  EyeOff,
  X,
  CheckCircle2,
  XCircle,
  Search,
  Pencil,
} from "lucide-react";
import type { PdfExtraction } from "../api/conformityPdf";

interface ExtractionsTableViewProps {
  extractions: PdfExtraction[];
  onSelectExtraction: (extraction: PdfExtraction) => void;
  onEditExtraction?: (extraction: PdfExtraction) => void;
  onAnalyzeExtraction?: (extraction: PdfExtraction) => void;
}

interface ColumnDefinition {
  key: string;
  label: string;
  group: "base" | "matrix" | "analysis" | "compliance";
  sticky?: boolean;
  width?: number;
}

interface ColumnFilter {
  textSearch: string;
  selectedValues: Set<string>;
}

interface FlattenedRow {
  id: string;
  _original: PdfExtraction;
  companyName: string;
  fileName: string;
  createdAt: string;
  updatedAt: string;
  success: boolean;
  error: string | null;
  matrix_matrix: string | null;
  matrix_product: string | null;
  matrix_category: string | null;
  matrix_ceirsa_category: string | null;
  matrix_sampleType: string | null;
  matrix_description: string | null;
  // Analysis fields (one row per analysis)
  analysis_parameter: string | null;
  analysis_result: string | null;
  analysis_um_result: string | null;
  analysis_method: string | null;
  // Compliance fields for this analysis
  compliance_value: string | null;
  compliance_isCheck: string | null;
  compliance_description: string | null;
  [key: string]: string | number | boolean | null | PdfExtraction | undefined;
}

const GROUP_LABELS: Record<string, string> = {
  base: "Informazioni Base",
  matrix: "Matrice",
  analysis: "Analisi",
  compliance: "Conformit",
};

const BASE_COLUMNS: ColumnDefinition[] = [
  {
    key: "companyName",
    label: "Azienda",
    group: "base",
    sticky: true,
    width: 180,
  },
  {
    key: "fileName",
    label: "Nome File",
    group: "base",
    width: 250,
  },
  { key: "createdAt", label: "Data Estrazione", group: "base", width: 150 },
  { key: "updatedAt", label: "Data Aggiornamento", group: "base", width: 150 },
  { key: "success", label: "Stato", group: "base", width: 100 },
];

const MATRIX_COLUMNS: ColumnDefinition[] = [
  { key: "matrix_matrix", label: "Matrice", group: "matrix", width: 120 },
  { key: "matrix_product", label: "Prodotto", group: "matrix", width: 150 },
  { key: "matrix_category", label: "Categoria", group: "matrix", width: 100 },
  {
    key: "matrix_ceirsa_category",
    label: "Categoria CEIRSA",
    group: "matrix",
    width: 150,
  },
  {
    key: "matrix_sampleType",
    label: "Tipo Campione",
    group: "matrix",
    width: 120,
  },
  {
    key: "matrix_description",
    label: "Descrizione",
    group: "matrix",
    width: 200,
  },
];

const ANALYSIS_COLUMNS: ColumnDefinition[] = [
  {
    key: "analysis_parameter",
    label: "Parametro",
    group: "analysis",
    width: 180,
  },
  {
    key: "analysis_result",
    label: "Risultato",
    group: "analysis",
    width: 120,
  },
  {
    key: "analysis_um_result",
    label: "U.M.",
    group: "analysis",
    width: 80,
  },
  {
    key: "analysis_method",
    label: "Metodo",
    group: "analysis",
    width: 150,
  },
];

const COMPLIANCE_COLUMNS: ColumnDefinition[] = [
  {
    key: "compliance_value",
    label: "Esito",
    group: "compliance",
    width: 120,
  },
  {
    key: "compliance_isCheck",
    label: "Conformità",
    group: "compliance",
    width: 120,
  },
  {
    key: "compliance_description",
    label: "Dettaglio Conformità",
    group: "compliance",
    width: 250,
  },
];

function formatDateTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Shortens filename for table: max 5 initial + 5 final chars (excluding .pdf). */
function shortenFileName(fileName: string): string {
  const base = fileName.replace(/\.pdf$/i, "");
  const ext = fileName.match(/\.pdf$/i) ? ".pdf" : "";
  if (base.length <= 10) return fileName;
  return base.slice(0, 5) + "..." + base.slice(-5) + ext;
}

function extractCompanyName(fileName: string): string {
  const nameWithoutExt = fileName.replace(/\.pdf$/i, "");
  const parts = nameWithoutExt.split("_");
  if (parts.length >= 4) {
    for (let i = parts.length - 2; i >= 2; i--) {
      if (/\b(srl|s\.r\.l|spa|s\.p\.a|snc|sas|di|srls)\b/i.test(parts[i])) {
        return parts[i].trim();
      }
    }
    for (let i = parts.length - 1; i >= 2; i--) {
      if (/^\d{6,8}$/.test(parts[i])) {
        if (i > 0 && parts[i - 1]) return parts[i - 1].trim();
      }
    }
  }
  return "Azienda non specificata";
}

function flattenExtractions(extractions: PdfExtraction[]): FlattenedRow[] {
  const rows: FlattenedRow[] = [];

  for (const extraction of extractions) {
    const data = extraction.extractedData;
    const analyses = data.analyses || [];
    const results = data.results || [];

    // If no analyses, still create one row for the extraction
    if (analyses.length === 0) {
      rows.push({
        id: extraction.id,
        _original: extraction,
        companyName: extraction.companyName || extractCompanyName(extraction.fileName),
        fileName: shortenFileName(extraction.fileName),
        createdAt: formatDateTime(extraction.createdAt),
        updatedAt: formatDateTime(extraction.updatedAt),
        success: extraction.success,
        error: extraction.error,
        matrix_matrix: data.matrix?.matrix || null,
        matrix_product: data.matrix?.product || null,
        matrix_category: data.matrix?.category || null,
        matrix_ceirsa_category: data.matrix?.ceirsa_category || null,
        matrix_sampleType: data.matrix?.sampleType || null,
        matrix_description: data.matrix?.description || null,
        analysis_parameter: null,
        analysis_result: null,
        analysis_um_result: null,
        analysis_method: null,
        compliance_value: null,
        compliance_isCheck: null,
        compliance_description: null,
      });
      continue;
    }

    // One row per analysis
    for (let i = 0; i < analyses.length; i++) {
      const analysis = analyses[i];
      // Match compliance result by parameter name
      const complianceResult = results.find(
        (r) => r.name === analysis.parameter,
      );

      rows.push({
        id: `${extraction.id}_${i}`,
        _original: extraction,
        companyName: extraction.companyName || extractCompanyName(extraction.fileName),
        fileName: shortenFileName(extraction.fileName),
        createdAt: formatDateTime(extraction.createdAt),
        updatedAt: formatDateTime(extraction.updatedAt),
        success: extraction.success,
        error: extraction.error,
        matrix_matrix: data.matrix?.matrix || null,
        matrix_product: data.matrix?.product || null,
        matrix_category: data.matrix?.category || null,
        matrix_ceirsa_category: data.matrix?.ceirsa_category || null,
        matrix_sampleType: data.matrix?.sampleType || null,
        matrix_description: data.matrix?.description || null,
        analysis_parameter: analysis.parameter,
        analysis_result: analysis.result,
        analysis_um_result: analysis.um_result,
        analysis_method: analysis.method,
        compliance_value: complianceResult?.value ?? null,
        compliance_isCheck:
          complianceResult?.isCheck === true
            ? "Conforme"
            : complianceResult?.isCheck === false
              ? "Non Conforme"
              : complianceResult?.isCheck === null
                ? "In Sospeso"
                : null,
        compliance_description: complianceResult?.description ?? null,
      });
    }
  }

  return rows;
}

interface ColumnFilterDropdownProps {
  column: ColumnDefinition;
  filter: ColumnFilter;
  sortColumn: string | null;
  sortDirection: "asc" | "desc";
  uniqueValues: string[];
  onFilterChange: (filter: ColumnFilter) => void;
  onSortChange: (column: string, direction: "asc" | "desc") => void;
  onClose: () => void;
}

function ColumnFilterDropdown({
  column,
  filter,
  sortColumn,
  sortDirection,
  uniqueValues,
  onFilterChange,
  onSortChange,
  onClose,
}: ColumnFilterDropdownProps) {
  const [localTextSearch, setLocalTextSearch] = useState(filter.textSearch);
  const [localSelected, setLocalSelected] = useState<Set<string>>(
    new Set(filter.selectedValues),
  );
  const [valueSearch, setValueSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  const filteredValues = useMemo(() => {
    if (!valueSearch) return uniqueValues;
    return uniqueValues.filter((v) =>
      v.toLowerCase().includes(valueSearch.toLowerCase()),
    );
  }, [uniqueValues, valueSearch]);

  const handleApply = () => {
    onFilterChange({
      textSearch: localTextSearch,
      selectedValues: localSelected,
    });
    onClose();
  };

  const handleClear = () => {
    setLocalTextSearch("");
    setLocalSelected(new Set());
    onFilterChange({
      textSearch: "",
      selectedValues: new Set(),
    });
    onClose();
  };

  const handleSelectAll = () => {
    setLocalSelected(new Set(uniqueValues));
  };

  const handleDeselectAll = () => {
    setLocalSelected(new Set());
  };

  const toggleValue = (value: string) => {
    const newSelected = new Set(localSelected);
    if (newSelected.has(value)) {
      newSelected.delete(value);
    } else {
      newSelected.add(value);
    }
    setLocalSelected(newSelected);
  };

  const isCurrentSort = sortColumn === column.key;

  return (
    <div className="column-filter-dropdown" ref={dropdownRef}>
      <div className="filter-dropdown-header">
        <span className="filter-dropdown-title">{column.label}</span>
        <button className="btn-icon-sm" onClick={onClose}>
          <X size={16} />
        </button>
      </div>

      <div className="filter-section">
        <div className="filter-section-title">Ordina</div>
        <div className="sort-buttons">
          <button
            className={`sort-btn ${isCurrentSort && sortDirection === "asc" ? "active" : ""}`}
            onClick={() => onSortChange(column.key, "asc")}
          >
            <ArrowUp size={14} />
            Crescente
          </button>
          <button
            className={`sort-btn ${isCurrentSort && sortDirection === "desc" ? "active" : ""}`}
            onClick={() => onSortChange(column.key, "desc")}
          >
            <ArrowDown size={14} />
            Decrescente
          </button>
        </div>
      </div>

      <div className="filter-section">
        <div className="filter-section-title">Cerca nel testo</div>
        <input
          type="text"
          className="filter-search-input"
          placeholder="Cerca..."
          value={localTextSearch}
          onChange={(e) => setLocalTextSearch(e.target.value)}
        />
      </div>

      <div className="filter-section">
        <div className="filter-section-title">Filtra per valore</div>
        <div className="filter-select-actions">
          <button className="filter-select-btn" onClick={handleSelectAll}>
            Seleziona tutto ({uniqueValues.length})
          </button>
          <span className="filter-select-separator">-</span>
          <button className="filter-select-btn" onClick={handleDeselectAll}>
            Cancella
          </button>
          <span className="filter-select-count">
            Visualizzati: {filteredValues.length}
          </span>
        </div>
        <div className="filter-value-search">
          <Search size={14} />
          <input
            type="text"
            placeholder="Cerca valore..."
            value={valueSearch}
            onChange={(e) => setValueSearch(e.target.value)}
          />
        </div>
        <div className="filter-values-list">
          {filteredValues.map((value) => (
            <label key={value} className="filter-value-item">
              <input
                type="checkbox"
                checked={localSelected.has(value)}
                onChange={() => toggleValue(value)}
              />
              <span className="filter-value-text">{value}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="filter-dropdown-footer">
        <button className="btn-secondary btn-sm" onClick={handleClear}>
          Cancella Filtro
        </button>
        <button className="btn-primary btn-sm" onClick={handleApply}>
          OK
        </button>
      </div>
    </div>
  );
}

interface ColumnVisibilityPanelProps {
  columns: ColumnDefinition[];
  visibleColumns: Set<string>;
  onToggleColumn: (key: string) => void;
  onShowAll: () => void;
  onHideOptional: () => void;
  onClose: () => void;
}

function ColumnVisibilityPanel({
  columns,
  visibleColumns,
  onToggleColumn,
  onShowAll,
  onHideOptional,
  onClose,
}: ColumnVisibilityPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  const groupedColumns = useMemo(() => {
    const groups: Record<string, ColumnDefinition[]> = {};
    columns.forEach((col) => {
      if (!groups[col.group]) {
        groups[col.group] = [];
      }
      groups[col.group].push(col);
    });
    return groups;
  }, [columns]);

  return (
    <div className="column-visibility-panel" ref={panelRef}>
      <div className="visibility-panel-header">
        <h4>Colonne Visibili</h4>
        <button className="btn-icon-sm" onClick={onClose}>
          <X size={16} />
        </button>
      </div>
      <div className="visibility-panel-actions">
        <button className="btn-link" onClick={onShowAll}>
          Mostra tutte
        </button>
        <button className="btn-link" onClick={onHideOptional}>
          Nascondi opzionali
        </button>
      </div>
      <div className="visibility-panel-content">
        {Object.entries(groupedColumns).map(([group, cols]) => (
          <div key={group} className="visibility-group">
            <h5 className="visibility-group-title">
              {GROUP_LABELS[group] || group}
            </h5>
            {cols.map((col) => (
              <label key={col.key} className="visibility-column-item">
                <input
                  type="checkbox"
                  checked={visibleColumns.has(col.key)}
                  onChange={() => onToggleColumn(col.key)}
                  disabled={col.sticky}
                />
                <span>{col.label}</span>
                {col.sticky && <span className="sticky-badge">Fissa</span>}
              </label>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ExtractionsTableView({
  extractions,
  onSelectExtraction,
  onEditExtraction,
  onAnalyzeExtraction,
}: ExtractionsTableViewProps) {
  // Flatten data: one row per analysis
  const rows = useMemo(
    () => flattenExtractions(extractions),
    [extractions],
  );

  // All columns (fixed, no more dynamic analysis columns)
  const allColumns = useMemo(
    () => [
      ...BASE_COLUMNS,
      ...MATRIX_COLUMNS,
      ...ANALYSIS_COLUMNS,
      ...COMPLIANCE_COLUMNS,
    ],
    [],
  );

  // State
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(() => {
    // Default: show base, matrix, compliance columns
    const defaultVisible = new Set<string>();
    [...BASE_COLUMNS, ...MATRIX_COLUMNS, ...COMPLIANCE_COLUMNS].forEach((col) =>
      defaultVisible.add(col.key),
    );
    // Show all analysis and compliance columns
    [...ANALYSIS_COLUMNS, ...COMPLIANCE_COLUMNS].forEach((col) => defaultVisible.add(col.key));
    return defaultVisible;
  });

  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [columnFilters, setColumnFilters] = useState<Map<string, ColumnFilter>>(
    new Map(),
  );
  const [activeFilterColumn, setActiveFilterColumn] = useState<string | null>(
    null,
  );
  const [showVisibilityPanel, setShowVisibilityPanel] = useState(false);

  // Unique values per column (calculated lazily)
  const getUniqueValues = useCallback(
    (columnKey: string): string[] => {
      const values = new Set<string>();
      rows.forEach((row) => {
        const value = row[columnKey];
        const strValue = value != null ? String(value) : "(vuoto)";
        values.add(strValue);
      });
      return Array.from(values).sort((a, b) => a.localeCompare(b, "it"));
    },
    [rows],
  );

  // Apply filters and sorting
  const filteredAndSortedRows = useMemo(() => {
    let result = [...rows];

    // Apply filters
    columnFilters.forEach((filter, columnKey) => {
      if (filter.textSearch.trim()) {
        result = result.filter((row) => {
          const value = row[columnKey];
          const strValue = value != null ? String(value).toLowerCase() : "";
          return strValue.includes(filter.textSearch.toLowerCase());
        });
      }
      if (filter.selectedValues.size > 0) {
        result = result.filter((row) => {
          const value = row[columnKey];
          const strValue = value != null ? String(value) : "(vuoto)";
          return filter.selectedValues.has(strValue);
        });
      }
    });

    // Apply sorting
    if (sortColumn) {
      result.sort((a, b) => {
        const valA = a[sortColumn];
        const valB = b[sortColumn];

        if (valA == null && valB == null) return 0;
        if (valA == null) return sortDirection === "asc" ? -1 : 1;
        if (valB == null) return sortDirection === "asc" ? 1 : -1;

        let comparison = 0;
        if (typeof valA === "number" && typeof valB === "number") {
          comparison = valA - valB;
        } else if (typeof valA === "boolean" && typeof valB === "boolean") {
          comparison = valA === valB ? 0 : valA ? -1 : 1;
        } else {
          comparison = String(valA).localeCompare(String(valB), "it");
        }

        return sortDirection === "asc" ? comparison : -comparison;
      });
    }

    return result;
  }, [rows, columnFilters, sortColumn, sortDirection]);

  // Visible columns list
  const visibleColumnsList = useMemo(
    () => allColumns.filter((col) => visibleColumns.has(col.key)),
    [allColumns, visibleColumns],
  );

  // Handlers
  const handleToggleColumn = (key: string) => {
    const newVisible = new Set(visibleColumns);
    if (newVisible.has(key)) {
      newVisible.delete(key);
    } else {
      newVisible.add(key);
    }
    setVisibleColumns(newVisible);
  };

  const handleShowAllColumns = () => {
    setVisibleColumns(new Set(allColumns.map((col) => col.key)));
  };

  const handleHideOptionalColumns = () => {
    const defaultVisible = new Set<string>();
    BASE_COLUMNS.forEach((col) => defaultVisible.add(col.key));
    setVisibleColumns(defaultVisible);
  };

  const handleFilterChange = (columnKey: string, filter: ColumnFilter) => {
    const newFilters = new Map(columnFilters);
    if (filter.textSearch === "" && filter.selectedValues.size === 0) {
      newFilters.delete(columnKey);
    } else {
      newFilters.set(columnKey, filter);
    }
    setColumnFilters(newFilters);
  };

  const handleSortChange = (column: string, direction: "asc" | "desc") => {
    setSortColumn(column);
    setSortDirection(direction);
  };

  const hasActiveFilter = (columnKey: string): boolean => {
    const filter = columnFilters.get(columnKey);
    return filter
      ? filter.textSearch.trim() !== "" || filter.selectedValues.size > 0
      : false;
  };

  const renderCellValue = (row: FlattenedRow, column: ColumnDefinition) => {
    const value = row[column.key];

    if (column.key === "fileName" && typeof value === "string") {
      return <span title={row._original.fileName}>{value}</span>;
    }

    if (column.key === "success") {
      return value ? (
        <span className="status-badge success">
          <CheckCircle2 size={14} />
          OK
        </span>
      ) : (
        <span className="status-badge error">
          <XCircle size={14} />
          Errore
        </span>
      );
    }

    if (value == null || value === "") {
      return <span className="cell-empty">-</span>;
    }

    if (typeof value === "boolean") {
      return value ? "S" : "No";
    }

    return String(value);
  };

  return (
    <div className="extractions-table-view">
      <div className="table-toolbar">
        <div className="table-info">
          <span>
            {filteredAndSortedRows.length} di {rows.length} analisi
          </span>
          {columnFilters.size > 0 && (
            <button
              className="btn-link clear-filters"
              onClick={() => setColumnFilters(new Map())}
            >
              Cancella tutti i filtri
            </button>
          )}
        </div>
        <div className="table-actions">
          <button
            className={`btn-icon-text ${showVisibilityPanel ? "active" : ""}`}
            onClick={() => setShowVisibilityPanel(!showVisibilityPanel)}
          >
            {showVisibilityPanel ? <EyeOff size={16} /> : <Eye size={16} />}
            Colonne
          </button>
          {showVisibilityPanel && (
            <ColumnVisibilityPanel
              columns={allColumns}
              visibleColumns={visibleColumns}
              onToggleColumn={handleToggleColumn}
              onShowAll={handleShowAllColumns}
              onHideOptional={handleHideOptionalColumns}
              onClose={() => setShowVisibilityPanel(false)}
            />
          )}
        </div>
      </div>

      <div className="table-container">
        <table className="extractions-table">
          <thead>
            <tr>
              <th className="table-header sticky" style={{ minWidth: 90 }}>
                <div className="header-content">
                  <span className="header-label">Azioni</span>
                </div>
              </th>
              {visibleColumnsList.map((column) => (
                <th
                  key={column.key}
                  className={`table-header ${column.sticky ? "sticky" : ""} ${
                    hasActiveFilter(column.key) ? "has-filter" : ""
                  } ${sortColumn === column.key ? "has-sort" : ""}`}
                  style={{ minWidth: column.width }}
                >
                  <div className="header-content">
                    <span className="header-label">{column.label}</span>
                    <button
                      className={`header-filter-btn ${
                        hasActiveFilter(column.key) || sortColumn === column.key
                          ? "active"
                          : ""
                      }`}
                      onClick={() =>
                        setActiveFilterColumn(
                          activeFilterColumn === column.key ? null : column.key,
                        )
                      }
                    >
                      <Filter size={14} />
                      {sortColumn === column.key &&
                        (sortDirection === "asc" ? (
                          <ArrowUp size={12} className="sort-indicator" />
                        ) : (
                          <ArrowDown size={12} className="sort-indicator" />
                        ))}
                    </button>
                  </div>
                  {activeFilterColumn === column.key && (
                    <ColumnFilterDropdown
                      column={column}
                      filter={
                        columnFilters.get(column.key) || {
                          textSearch: "",
                          selectedValues: new Set(),
                        }
                      }
                      sortColumn={sortColumn}
                      sortDirection={sortDirection}
                      uniqueValues={getUniqueValues(column.key)}
                      onFilterChange={(filter) =>
                        handleFilterChange(column.key, filter)
                      }
                      onSortChange={handleSortChange}
                      onClose={() => setActiveFilterColumn(null)}
                    />
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredAndSortedRows.map((row) => (
              <tr
                key={row.id}
                className="table-row"
                onClick={() => onSelectExtraction(row._original)}
              >
                <td className="table-cell sticky table-actions-cell">
                  <div className="table-row-actions">
                    {onEditExtraction && (
                      <button
                        className="btn-icon-sm"
                        title="Modifica"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditExtraction(row._original);
                        }}
                      >
                        <Pencil size={14} />
                      </button>
                    )}
                    {onAnalyzeExtraction && row._original.hasPdf && (
                      <button
                        className="btn-icon-sm"
                        title="Analizza con PDF"
                        onClick={(e) => {
                          e.stopPropagation();
                          onAnalyzeExtraction(row._original);
                        }}
                      >
                        <Eye size={14} />
                      </button>
                    )}
                  </div>
                </td>
                {visibleColumnsList.map((column) => (
                  <td
                    key={column.key}
                    className={`table-cell ${column.sticky ? "sticky" : ""}`}
                  >
                    {renderCellValue(row, column)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        {filteredAndSortedRows.length === 0 && (
          <div className="table-empty">
            <p>Nessuna estrazione corrisponde ai filtri applicati</p>
            <button
              className="btn-secondary"
              onClick={() => setColumnFilters(new Map())}
            >
              Cancella filtri
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
