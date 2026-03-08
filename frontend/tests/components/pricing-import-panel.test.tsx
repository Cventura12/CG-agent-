import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PricingImportPanel } from "../../src/components/PricingImportPanel";

const { previewPricingImportMock, commitPricingImportMock } = vi.hoisted(() => ({
  previewPricingImportMock: vi.fn(async () => ({
    filename: "price-book.xlsx",
    source_type: "xlsx",
    sheet_names: ["Roofing", "Framing"],
    selected_sheet: "Roofing",
    headers: ["Item", "Unit", "Sell Price", "Vendor"],
    suggested_mapping: {
      item_name: "Item",
      category: "",
      unit: "Unit",
      material_cost: "",
      labor_cost: "",
      markup_percent: "",
      default_price: "Sell Price",
      notes: "",
      vendor: "Vendor",
      sku: "",
    },
    preview_rows: [
      {
        row_number: 2,
        raw: {
          Item: "Architectural shingles",
          Unit: "bundle",
          "Sell Price": "55",
          Vendor: "ABC Supply",
        },
        normalized: {
          row_number: 2,
          item_name: "Architectural shingles",
          category: "",
          unit: "bundle",
          material_cost: null,
          labor_cost: null,
          markup_percent: null,
          default_price: 55,
          notes: "",
          vendor: "ABC Supply",
          sku: "",
          item_key: "architectural_shingles",
          recognized_key: "",
          resolved_unit_cost: 55,
          status: "ready",
          reason: "",
        },
      },
    ],
    total_rows: 1,
  })),
  commitPricingImportMock: vi.fn(async () => ({
    import_log_id: "pricing-import-1",
    trace_id: "trace-import-1",
    filename: "price-book.xlsx",
    source_type: "xlsx",
    sheet_name: "Roofing",
    mapping: {
      item_name: "Item",
      category: "",
      unit: "Unit",
      material_cost: "",
      labor_cost: "",
      markup_percent: "",
      default_price: "Sell Price",
      notes: "",
      vendor: "Vendor",
      sku: "",
    },
    imported_count: 1,
    skipped_count: 1,
    error_count: 0,
    imported_rows: [],
    skipped_rows: [
      {
        row_number: 3,
        item_name: "",
        category: "",
        unit: "roll",
        material_cost: null,
        labor_cost: null,
        markup_percent: null,
        default_price: null,
        notes: "",
        vendor: "",
        sku: "",
        item_key: "",
        recognized_key: "",
        resolved_unit_cost: null,
        status: "skipped",
        reason: "Missing item name or SKU",
      },
    ],
  })),
}));

vi.mock("../../src/api/pricing", () => ({
  previewPricingImport: previewPricingImportMock,
  commitPricingImport: commitPricingImportMock,
}));

describe("PricingImportPanel", () => {
  beforeEach(() => {
    previewPricingImportMock.mockClear();
    commitPricingImportMock.mockClear();
  });

  it("previews, allows mapping changes, and renders the import summary", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <PricingImportPanel />
      </QueryClientProvider>
    );

    const file = new File(["header"], "price-book.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    fireEvent.change(screen.getByLabelText("CSV or XLSX"), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview import" }));

    await waitFor(() => expect(previewPricingImportMock).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Column Mapping")).toBeInTheDocument();
    expect(screen.getByText("Architectural shingles")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Vendor"), {
      target: { value: "Vendor" },
    });
    fireEvent.click(screen.getByRole("button", { name: "IMPORT PRICE BOOK" }));

    await waitFor(() => expect(commitPricingImportMock).toHaveBeenCalledTimes(1));
    expect(commitPricingImportMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: "price-book.xlsx" }),
      expect.objectContaining({
        item_name: "Item",
        unit: "Unit",
        default_price: "Sell Price",
        vendor: "Vendor",
      }),
      { sheetName: "Roofing" }
    );

    expect(await screen.findByText("Import Summary")).toBeInTheDocument();
    expect(screen.getByText("price rows written")).toBeInTheDocument();
    expect(screen.getByText(/Row 3 - Unnamed row/i)).toBeInTheDocument();
    expect(screen.getByText("Missing item name or SKU")).toBeInTheDocument();
  });
});
