import { useState, useCallback, useRef } from "react";
import { Upload, FileText, X, AlertCircle, Loader2 } from "lucide-react";

interface PdfDropZoneProps {
  onFilesSelected: (files: File[]) => void;
  isLoading?: boolean;
  maxFiles?: number;
}

export function PdfDropZone({ 
  onFilesSelected, 
  isLoading = false,
  maxFiles = 20 
}: PdfDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFiles = (files: File[]): File[] => {
    const pdfFiles = files.filter(
      (file) => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
    );
    
    if (pdfFiles.length === 0) {
      setError("Seleziona solo file PDF");
      return [];
    }
    
    if (pdfFiles.length > maxFiles) {
      setError(`Massimo ${maxFiles} file per volta`);
      return pdfFiles.slice(0, maxFiles);
    }
    
    setError(null);
    return pdfFiles;
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const droppedFiles = Array.from(e.dataTransfer.files);
    const validFiles = validateFiles(droppedFiles);
    
    if (validFiles.length > 0) {
      setSelectedFiles((prev) => {
        const newFiles = [...prev, ...validFiles].slice(0, maxFiles);
        return newFiles;
      });
    }
  }, [maxFiles]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const validFiles = validateFiles(files);
    
    if (validFiles.length > 0) {
      setSelectedFiles((prev) => {
        const newFiles = [...prev, ...validFiles].slice(0, maxFiles);
        return newFiles;
      });
    }
    
    // Reset input to allow selecting same file again
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
    setError(null);
  };

  const handleSubmit = () => {
    if (selectedFiles.length > 0) {
      onFilesSelected(selectedFiles);
    }
  };

  const clearAll = () => {
    setSelectedFiles([]);
    setError(null);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="pdf-drop-zone-container">
      {/* Drop Zone */}
      <div
        className={`pdf-drop-zone ${isDragging ? "dragging" : ""} ${isLoading ? "disabled" : ""}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !isLoading && fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          multiple
          onChange={handleFileInput}
          disabled={isLoading}
          style={{ display: "none" }}
        />
        
        <div className="drop-zone-content">
          {isLoading ? (
            <>
              <Loader2 size={48} className="spin" />
              <h3>Analisi in corso...</h3>
              <p>L'AI sta categorizzando e verificando i documenti</p>
            </>
          ) : (
            <>
              <Upload size={48} />
              <h3>Trascina qui i file PDF</h3>
              <p>oppure clicca per selezionare (max {maxFiles} file)</p>
              <span className="drop-zone-hint">
                L'AI analizzerà automaticamente ogni documento
              </span>
            </>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="drop-zone-error">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Selected Files List */}
      {selectedFiles.length > 0 && (
        <div className="selected-files">
          <div className="selected-files-header">
            <span>{selectedFiles.length} file selezionati</span>
            <button 
              className="btn-text" 
              onClick={clearAll}
              disabled={isLoading}
            >
              Rimuovi tutti
            </button>
          </div>
          
          <div className="files-list">
            {selectedFiles.map((file, index) => (
              <div key={`${file.name}-${index}`} className="file-item">
                <FileText size={20} />
                <div className="file-info">
                  <span className="file-name">{file.name}</span>
                  <span className="file-size">{formatFileSize(file.size)}</span>
                </div>
                <button
                  className="btn-icon-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFile(index);
                  }}
                  disabled={isLoading}
                >
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>

          <button
            className="btn-primary btn-analyze"
            onClick={handleSubmit}
            disabled={isLoading || selectedFiles.length === 0}
          >
            {isLoading ? (
              <>
                <Loader2 size={18} className="spin" />
                Analisi in corso...
              </>
            ) : (
              <>
                <Upload size={18} />
                Analizza {selectedFiles.length} PDF
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

