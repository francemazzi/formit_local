import { createRequire } from "node:module";
import { access } from "node:fs/promises";
import * as path from "node:path";

import {
  DOMMatrix as CanvasDOMMatrix,
  ImageData as CanvasImageData,
  Path2D as CanvasPath2D,
} from "@napi-rs/canvas";
import { TypeJob } from "@prisma/client";
import type {
  PDFDocumentProxy,
  TextItem,
  TextMarkedContent,
} from "pdfjs-dist/types/src/display/api";

import { JobService, jobService } from "./job.service";

type PdfJsLib = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

type DomLikeGlobal = Record<string, unknown>;
type ProcessWithBuiltin = typeof process & {
  getBuiltinModule?: (moduleName: string) => unknown;
  __pdfBuiltinCache__?: Map<string, unknown>;
};

const nodeRequire = createRequire(__filename);

let pdfjsLibPromise: Promise<PdfJsLib> | undefined;

const ensureProcessBuiltinAccess = (): void => {
  const proc = process as ProcessWithBuiltin;

  if (typeof proc.getBuiltinModule === "function") {
    return;
  }

  proc.__pdfBuiltinCache__ = proc.__pdfBuiltinCache__ ?? new Map();
  proc.getBuiltinModule = (moduleName: string) => {
    const cache = proc.__pdfBuiltinCache__ as Map<string, unknown>;
    if (cache.has(moduleName)) {
      return cache.get(moduleName);
    }

    try {
      const resolved = nodeRequire(moduleName);
      cache.set(moduleName, resolved);
      return resolved;
    } catch {
      return undefined;
    }
  };
};

const ensureDomPolyfills = (): void => {
  const domGlobals = globalThis as DomLikeGlobal;

  if (typeof domGlobals.DOMMatrix === "undefined") {
    domGlobals.DOMMatrix = CanvasDOMMatrix;
  }

  if (typeof domGlobals.ImageData === "undefined") {
    domGlobals.ImageData = CanvasImageData;
  }

  if (typeof domGlobals.Path2D === "undefined") {
    domGlobals.Path2D = CanvasPath2D;
  }
};

const loadPdfJsLib = (): Promise<PdfJsLib> => {
  if (!pdfjsLibPromise) {
    ensureProcessBuiltinAccess();
    ensureDomPolyfills();
    pdfjsLibPromise = import("pdfjs-dist/legacy/build/pdf.mjs").then(
      (module) => {
        const workerSrc = require.resolve(
          "pdfjs-dist/legacy/build/pdf.worker.mjs"
        );
        module.GlobalWorkerOptions.workerSrc =
          module.GlobalWorkerOptions.workerSrc ?? workerSrc;
        return module;
      }
    );
  }

  return pdfjsLibPromise;
};

export interface ExtractedTextEntry {
  resource: string;
  word_number: number;
  letter_number: number;
  text_extracted: string;
}

interface PdfTextExtractorDependencies {
  jobService: JobService;
}

const defaultDependencies: PdfTextExtractorDependencies = {
  jobService,
};

export class PdfTextExtractor {
  constructor(
    private readonly dependencies: PdfTextExtractorDependencies = defaultDependencies
  ) {}

  async extract(resourcePath: string): Promise<ExtractedTextEntry[]> {
    const job = await this.dependencies.jobService.createJob(
      TypeJob.EXTRACT_TEXT_FROM_PDF,
      { resourcePath }
    );

    await this.dependencies.jobService.markJobProcessing(job.id);

    let document: PDFDocumentProxy | undefined;

    try {
      const pdfjsLib = await loadPdfJsLib();
      const absolutePath = await this.resolveExistingPath(resourcePath);
      document = await pdfjsLib.getDocument({
        url: absolutePath,
        verbosity: 0,
      }).promise;

      const resourceLabel = path.basename(absolutePath);
      const entries: ExtractedTextEntry[] = [];
      let letterCounter = 0;

      for (let pageIndex = 1; pageIndex <= document.numPages; pageIndex += 1) {
        const page = await document.getPage(pageIndex);
        const textContent = await page.getTextContent();
        const pageText = this.composePageText(textContent.items);
        const pageWordCount = this.countWords(pageText);

        entries.push({
          resource: resourceLabel,
          word_number: pageWordCount,
          letter_number: letterCounter + 1,
          text_extracted: pageText,
        });

        letterCounter += pageText.length;
      }

      const totalWords = entries.reduce(
        (sum, entry) => sum + entry.word_number,
        0
      );

      await this.dependencies.jobService.markJobCompleted(job.id, {
        resource: resourceLabel,
        resourcePath: absolutePath,
        totalPages: entries.length,
        totalWords,
      });

      return entries;
    } catch (error) {
      await this.dependencies.jobService.markJobFailed(
        job.id,
        error instanceof Error
          ? error.message
          : "Unknown PDF extraction failure"
      );
      throw error;
    } finally {
      document?.destroy();
    }
  }

  private async resolveExistingPath(resourcePath: string): Promise<string> {
    const absolutePath = path.isAbsolute(resourcePath)
      ? resourcePath
      : path.resolve(process.cwd(), resourcePath);

    try {
      await access(absolutePath);
    } catch (error) {
      throw new Error(
        `PDF resource was not found at path: ${absolutePath}`,
        error instanceof Error ? { cause: error } : undefined
      );
    }

    return absolutePath;
  }

  private composePageText(items: Array<TextItem | TextMarkedContent>): string {
    const segments: string[] = [];
    items.forEach((item) => {
      if (!this.isTextItem(item)) {
        return;
      }

      const normalized = this.normalizeFragment(item.str);
      if (normalized) {
        segments.push(normalized);
      }

      if (item.hasEOL) {
        segments.push("\n");
      } else if (normalized) {
        segments.push(" ");
      }
    });

    return segments
      .join("")
      .replace(/[ \t]+\n/gu, "\n")
      .replace(/\n{3,}/gu, "\n\n")
      .replace(/[ \t]{2,}/gu, " ")
      .trim();
  }

  private countWords(text: string): number {
    return text.split(/\s+/u).filter(Boolean).length;
  }

  private normalizeFragment(value: string): string {
    return value.replace(/\s+/gu, " ").trim();
  }

  private isTextItem(
    item: TextItem | TextMarkedContent
  ): item is TextItem & { str: string } {
    return Boolean(item && typeof (item as Partial<TextItem>).str === "string");
  }
}

export const pdfTextExtractor = new PdfTextExtractor();

export const extractTextFromPdf = (
  resourcePath: string
): Promise<ExtractedTextEntry[]> => {
  return pdfTextExtractor.extract(resourcePath);
};
