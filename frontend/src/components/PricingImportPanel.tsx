import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { useMutation } from "@tanstack/react-query";

import { commitPricingImport, previewPricingImport } from "../api/pricing";
import type {
  PricingImportCommitSummary,
  PricingImportPreview,
  SpreadsheetImportMapping,
} from "../types";

const IMPORT_FIELDS: Array<{ key: keyof SpreadsheetImportMapping; label: string }> = [
  { key: "item_name", label: "Item name" },
  { key: "category", label: "Category" },
  { key: "unit", label: "Unit" },
  { key: "material_cost", label: "Material cost" },
  { key: "labor_cost", label: "Labor cost" },
  { key: "markup_percent", label: "Markup %" },
  { key: "default_price", label: "Default price" },
  { key: "notes", label: "Notes" },
  { key: "vendor", label: "Vendor" },
  { key: "sku", label: "SKU" },
];

const EMPTY_MAPPING: SpreadsheetImportMapping = {
  item_name: "",
  category: "",
  unit: "",
  material_cost: "",
  labor_cost: "",
  markup_percent: "",
  default_price: "",
  notes: "",
  vendor: "",
  sku: "",
};

type PricingImportPanelProps = {
  disabledReason?: string;
  onImportComplete?: (summary: PricingImportCommitSummary) => void;
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "Spreadsheet import failed.";
}

export function PricingImportPanel({ disabledReason, onImportComplete }: PricingImportPanelProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedSheet, setSelectedSheet] = useState("");
  const [mapping, setMapping] = useState<SpreadsheetImportMapping>(EMPTY_MAPPING);
  const [preview, setPreview] = useState<PricingImportPreview | null>(null);
  const [summary, setSummary] = useState<PricingImportCommitSummary | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const previewMutation = useMutation({
    mutationFn: async (params: { file: File; sheetName?: string }) =>
      previewPricingImport(params.file, { sheetName: params.sheetName }),
    onSuccess: (payload) => {
      setPreview(payload);
      setSummary(null);
      setErrorMessage(null);
      setSelectedSheet(payload.selected_sheet);
      setMapping(payload.suggested_mapping);
    },
    onError: (error) => {
      setPreview(null);
      setSummary(null);
      setErrorMessage(getErrorMessage(error));
    },
  });

  const commitMutation = useMutation({
    mutationFn: async (params: { file: File; mapping: SpreadsheetImportMapping; sheetName?: string }) =>
      commitPricingImport(params.file, params.mapping, { sheetName: params.sheetName }),
    onSuccess: (payload) => {
      setSummary(payload);
      setErrorMessage(null);
      onImportComplete?.(payload);
    },
    onError: (error) => {
      setSummary(null);
      setErrorMessage(getErrorMessage(error));
    },
  });

  useEffect(() => {
    if (!selectedFile || disabledReason) {
      return;
    }
    const normalizedSheet = selectedSheet.trim();
    if (preview && normalizedSheet && normalizedSheet !== preview.selected_sheet) {
      previewMutation.mutate({ file: selectedFile, sheetName: normalizedSheet });
    }
  }, [disabledReason, preview, previewMutation, selectedFile, selectedSheet]);

  const canPreview = Boolean(selectedFile) && !disabledReason && !previewMutation.isPending;
  const canCommit =
    Boolean(selectedFile) &&
    Boolean(preview) &&
    !disabledReason &&
    !previewMutation.isPending &&
    !commitMutation.isPending;

  const headerOptions = useMemo(() => preview?.headers ?? [], [preview]);
  const importedPreviewRows = preview?.preview_rows ?? [];

  const handleFileSelection = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] ?? null;
    setSelectedFile(nextFile);
    setPreview(null);
    setSummary(null);
    setErrorMessage(null);
    setSelectedSheet("");
    setMapping(EMPTY_MAPPING);
  };

  const handlePreview = () => {
    if (!selectedFile || disabledReason) {
      return;
    }
    previewMutation.mutate({ file: selectedFile, sheetName: selectedSheet });
  };

  const handleMappingChange = (field: keyof SpreadsheetImportMapping, value: string) => {
    setMapping((current) => ({ ...current, [field]: value }));
  };

  const handleCommit = () => {
    if (!selectedFile || !preview || disabledReason) {
      return;
    }
    commitMutation.mutate({
      file: selectedFile,
      mapping,
      sheetName: selectedSheet || preview.selected_sheet,
    });
  };

  return (
    <div className="panel">
      <div className="ph2">
        <span className="ptl">Price Book Import</span>
      </div>
      <div className="pb vs">
        <div style={{ fontSize: 12, color: "var(--steel)" }}>
          Upload a contractor price sheet to preview column mapping before GC Agent writes the normalized pricing rows.
        </div>

        {disabledReason ? (
          <div className="alert ainfo" style={{ fontSize: 12 }}>
            <span>*</span>
            <div>{disabledReason}</div>
          </div>
        ) : null}

        <div className="g2">
          <div>
            <label className="lbl" htmlFor="pricing-import-file">
              CSV or XLSX
            </label>
            <input
              id="pricing-import-file"
              className="inp"
              type="file"
              accept=".csv,.xlsx"
              onChange={handleFileSelection}
              disabled={Boolean(disabledReason)}
            />
          </div>

          {preview?.sheet_names && preview.sheet_names.length > 1 ? (
            <div>
              <label className="lbl" htmlFor="pricing-import-sheet">
                Workbook sheet
              </label>
              <select
                id="pricing-import-sheet"
                className="sel"
                value={selectedSheet}
                onChange={(event) => setSelectedSheet(event.target.value)}
              >
                {preview.sheet_names.map((sheetName) => (
                  <option key={sheetName} value={sheetName}>
                    {sheetName}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label className="lbl">Preview status</label>
              <div style={{ fontSize: 12, color: "var(--fog)", paddingTop: 10 }}>
                {preview ? `${preview.source_type.toUpperCase()} sheet ready for mapping.` : "No workbook preview loaded yet."}
              </div>
            </div>
          )}
        </div>

        <div className="hs" style={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button type="button" className="btn bw" onClick={handlePreview} disabled={!canPreview}>
            {previewMutation.isPending ? "Previewing..." : "Preview import"}
          </button>
          <button type="button" className="cta" onClick={handleCommit} disabled={!canCommit}>
            {commitMutation.isPending ? "IMPORTING..." : "IMPORT PRICE BOOK"}
          </button>
        </div>

        {errorMessage ? (
          <div className="alert awarn" style={{ fontSize: 12 }}>
            <span>!</span>
            <div>{errorMessage}</div>
          </div>
        ) : null}

        {preview ? (
          <>
            <div className="sh">Column Mapping</div>
            <div className="g2">
              {IMPORT_FIELDS.map((field) => (
                <div key={field.key}>
                  <label className="lbl" htmlFor={`mapping-${field.key}`}>
                    {field.label}
                  </label>
                  <select
                    id={`mapping-${field.key}`}
                    className="sel"
                    value={mapping[field.key]}
                    onChange={(event) => handleMappingChange(field.key, event.target.value)}
                  >
                    <option value="">Ignore column</option>
                    {headerOptions.map((header) => (
                      <option key={`${field.key}-${header}`} value={header}>
                        {header}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div className="sh">Preview Rows</div>
            {importedPreviewRows.length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--fog)" }}>No data rows were detected in this sheet.</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="lit" style={{ minWidth: 760 }}>
                  <thead>
                    <tr>
                      <th>Row</th>
                      <th>Item</th>
                      <th>Item Key</th>
                      <th>Unit</th>
                      <th>Resolved Price</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importedPreviewRows.map((row) => (
                      <tr key={row.row_number}>
                        <td>{row.row_number}</td>
                        <td>{row.normalized.item_name || "--"}</td>
                        <td>{row.normalized.item_key || "--"}</td>
                        <td>{row.normalized.unit || "--"}</td>
                        <td>
                          {typeof row.normalized.resolved_unit_cost === "number"
                            ? `$${row.normalized.resolved_unit_cost.toFixed(2)}`
                            : "--"}
                        </td>
                        <td>
                          <span className={`tag ${row.normalized.status === "ready" ? "tg" : "ta"}`}>
                            {row.normalized.status === "ready"
                              ? "ready"
                              : row.normalized.reason || "skipped"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : null}

        {summary ? (
          <>
            <div className="sh">Import Summary</div>
            <div className="sstrip c2">
              <div className="scell">
                <div className="sk">Imported</div>
                <div className="sv">{summary.imported_count}</div>
                <div className="sd up">price rows written</div>
              </div>
              <div className="scell">
                <div className="sk">Skipped</div>
                <div className="sv">{summary.skipped_count}</div>
                <div className="sd flat">rows left unchanged</div>
              </div>
            </div>
            {summary.skipped_rows.length > 0 ? (
              <div className="vs">
                {summary.skipped_rows.slice(0, 5).map((row) => (
                  <div key={row.row_number} style={{ border: "1px solid var(--wire)", padding: "8px 10px" }}>
                    <div style={{ fontSize: 12, color: "var(--cream)" }}>
                      Row {row.row_number} - {row.item_name || row.sku || "Unnamed row"}
                    </div>
                    <div
                      style={{
                        marginTop: 4,
                        fontFamily: "'Syne Mono', monospace",
                        fontSize: 8,
                        color: "var(--fog)",
                        letterSpacing: "0.5px",
                      }}
                    >
                      {row.reason || "Skipped during import"}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

