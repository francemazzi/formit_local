import { useState } from "react";
import { FileX, ExternalLink } from "lucide-react";
import { conformityApi } from "../api/conformityPdf";

interface PdfViewerProps {
  extractionId: string;
  hasPdf: boolean;
  fileName: string;
}

export function PdfViewer({ extractionId, hasPdf, fileName }: PdfViewerProps) {
  const [loadError, setLoadError] = useState(false);

  if (!hasPdf) {
    return (
      <div className="pdf-not-available">
        <FileX size={48} />
        <p>PDF non disponibile per questa estrazione</p>
        <span className="pdf-not-available-hint">
          I PDF caricati prima dell'aggiornamento non sono stati salvati
        </span>
      </div>
    );
  }

  const pdfUrl = conformityApi.getPdfUrl(extractionId);

  if (loadError) {
    return (
      <div className="pdf-not-available">
        <FileX size={48} />
        <p>Impossibile caricare il PDF</p>
        <button
          className="btn btn-secondary"
          onClick={() => setLoadError(false)}
        >
          Riprova
        </button>
      </div>
    );
  }

  return (
    <div className="pdf-viewer">
      <div className="pdf-viewer-toolbar">
        <span className="pdf-viewer-filename" title={fileName}>
          {fileName}
        </span>
        <a
          href={pdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-icon-sm"
          title="Apri in nuova scheda"
        >
          <ExternalLink size={16} />
        </a>
      </div>
      <iframe
        src={pdfUrl}
        className="pdf-viewer-frame"
        title={`PDF: ${fileName}`}
        onError={() => setLoadError(true)}
      />
    </div>
  );
}
