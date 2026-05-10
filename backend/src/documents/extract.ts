import { createRequire } from "node:module";
import mammoth from "mammoth";
import { logger } from "../config/logger.js";

// pdf-parse and xlsx have buggy ESM entries — use createRequire to load CJS builds directly.
const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse/lib/pdf-parse.js") as (b: Buffer) => Promise<{ text: string }>;
const XLSX = require("xlsx") as typeof import("xlsx");

export type ExtractionResult = {
  status: "extracted" | "stored_only" | "failed";
  text: string | null;
  reason?: string;
};

const TEXT_MIMES = new Set(["text/plain", "text/markdown", "text/csv"]);

const XLSX_MIMES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/octet-stream",
]);

export async function extractText(
  buffer: Buffer,
  mimeType: string,
  filename: string,
): Promise<ExtractionResult> {
  try {
    if (mimeType === "application/pdf") {
      const data = await pdfParse(buffer);
      const text = (data.text ?? "").trim();
      if (text.length === 0) {
        return {
          status: "stored_only",
          text: null,
          reason: "image-only PDF, no extractable text",
        };
      }
      return { status: "extracted", text };
    }

    if (
      mimeType ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      filename.toLowerCase().endsWith(".docx")
    ) {
      const { value } = await mammoth.extractRawText({ buffer });
      return { status: "extracted", text: value.trim() };
    }

    if (TEXT_MIMES.has(mimeType) || /\.(txt|md|csv)$/i.test(filename)) {
      return { status: "extracted", text: buffer.toString("utf-8").trim() };
    }

    if (XLSX_MIMES.has(mimeType) || /\.(xlsx|xls)$/i.test(filename)) {
      const wb = XLSX.read(buffer, { type: "buffer" });
      const parts: string[] = wb.SheetNames.map((name) => {
        const ws = wb.Sheets[name];
        const csv = XLSX.utils.sheet_to_csv(ws, { skipHidden: true });
        return `=== Sheet: ${name} ===\n${csv}`;
      });
      const text = parts.join("\n\n").trim();
      if (text.length === 0) {
        return { status: "stored_only", text: null, reason: "empty spreadsheet" };
      }
      return { status: "extracted", text };
    }

    return {
      status: "stored_only",
      text: null,
      reason: `unsupported type: ${mimeType}`,
    };
  } catch (err) {
    logger.error({ err, filename }, "Document extraction failed");
    return {
      status: "failed",
      text: null,
      reason: (err as Error).message,
    };
  }
}
