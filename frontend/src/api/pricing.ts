import { apiClient } from "./client";
import type {
  ApiEnvelope,
  PricingImportCommitSummary,
  PricingImportPreview,
  SpreadsheetImportMapping,
} from "../types";

function buildFormData(
  file: File,
  options: {
    sheetName?: string;
    mapping?: SpreadsheetImportMapping;
  } = {}
): FormData {
  const formData = new FormData();
  formData.append("file", file);
  if (options.sheetName?.trim()) {
    formData.append("sheet_name", options.sheetName.trim());
  }
  if (options.mapping) {
    formData.append("mapping_json", JSON.stringify(options.mapping));
  }
  return formData;
}

const multipartTransform = [
  (data: unknown, headers: unknown) => {
    if (headers && typeof (headers as { delete?: (key: string) => void }).delete === "function") {
      (headers as { delete: (key: string) => void }).delete("Content-Type");
    } else if (headers && typeof headers === "object") {
      delete (headers as Record<string, unknown>)["Content-Type"];
    }
    return data;
  },
];

export async function previewPricingImport(
  file: File,
  options: { sheetName?: string } = {}
): Promise<PricingImportPreview> {
  const response = await apiClient.post<ApiEnvelope<PricingImportPreview>>(
    "/pricing/import/preview",
    buildFormData(file, { sheetName: options.sheetName }),
    { transformRequest: multipartTransform }
  );

  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error || "Could not preview pricing spreadsheet");
  }
  return response.data.data;
}

export async function commitPricingImport(
  file: File,
  mapping: SpreadsheetImportMapping,
  options: { sheetName?: string } = {}
): Promise<PricingImportCommitSummary> {
  const response = await apiClient.post<ApiEnvelope<PricingImportCommitSummary>>(
    "/pricing/import/commit",
    buildFormData(file, { sheetName: options.sheetName, mapping }),
    { transformRequest: multipartTransform }
  );

  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error || "Could not import pricing spreadsheet");
  }
  return response.data.data;
}
