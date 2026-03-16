import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { JobDetailPage } from "../../src/pages/JobDetailPage";

const transcriptApiMocks = vi.hoisted(() => ({
  logTranscriptAsUpdate: vi.fn(),
}));

function buildDefaultJobDetail() {
  return {
    job: {
      id: "job-1",
      name: "Miller Job",
      type: "Roofing",
      status: "active",
      health: "on-track",
      address: "101 Main St",
      contract_value: 90000,
      contract_type: "Lump Sum",
      est_completion: "2026-12-01",
      notes: "",
      last_updated: "2026-03-05T10:00:00+00:00",
      open_items: [],
    },
    recent_updates: [
      {
        id: "update-1",
        job_id: "job-1",
        input_type: "sms",
        raw_input: "Crew confirmed material drop for tomorrow morning.",
        parsed_changes: { owner: "PM" },
        drafts_created: [],
        created_at: "2026-03-06T08:00:00+00:00",
      },
    ],
    call_history: [
      {
        id: "transcript-1",
        timestamp: "2026-03-06T10:00:00+00:00",
        trace_id: "trace-transcript-1",
        caller_label: "Taylor Brooks - +14235550101",
        caller_phone: "+14235550101",
        source: "call_transcript",
        provider: "manual",
        summary: "Caller wants a first-pass estimate before Friday.",
        classification: "estimate_request",
        urgency: "high",
        confidence: 91,
        risk_flags: ["Client may stall approval without revised number."],
        recommended_actions: ["Create quote draft", "Confirm permit allowance"],
        missing_information: ["Updated total with permit allowance"],
        transcript_text: "Can you send me a first-pass estimate before Friday?",
        linked_quote_id: "quote-9",
        related_queue_item_ids: ["draft-transcript-1"],
        recording_url: "",
        started_at: null,
        duration_seconds: 114,
      },
    ],
    audit_timeline: [
      {
        id: "timeline-1",
        event_type: "update_logged",
        title: "Update logged",
        summary: "Crew confirmed material drop for tomorrow morning.",
        timestamp: "2026-03-06T08:00:00+00:00",
        actor: "system",
        metadata: { raw_input: "Crew confirmed material drop for tomorrow morning." },
      },
    ],
    followup_state: null,
  };
}

let mockJobDetail = buildDefaultJobDetail();

beforeEach(() => {
  mockJobDetail = buildDefaultJobDetail();
  transcriptApiMocks.logTranscriptAsUpdate.mockReset();
});

vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => ({ userId: "gc-test" }),
}));

vi.mock("../../src/api/jobs", () => ({
  createOpenItemDraftAction: vi.fn(),
  fetchJobDetail: async () => mockJobDetail,
}));

vi.mock("../../src/api/queue", () => ({
  approveDraft: vi.fn(),
  editDraft: vi.fn(),
  discardDraft: vi.fn(),
}));

vi.mock("../../src/api/transcripts", () => transcriptApiMocks);

vi.mock("../../src/hooks/useQueue", () => ({
  useQueue: () => ({
    isLoading: false,
    data: {
      jobs: [],
      inbox: { transcripts: [] },
    },
    dataUpdatedAt: 0,
  }),
}));

function renderJobDetailPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/jobs/job-1"]}>
        <Routes>
          <Route path="/jobs/:jobId" element={<JobDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("JobDetailPage transcript history", () => {
  it("renders transcript summaries and keeps raw transcript collapsed by default", async () => {
    renderJobDetailPage();

    expect(await screen.findByText("Calls & communication")).toBeInTheDocument();
    expect(screen.getByText("Caller wants a first-pass estimate before Friday.")).toBeInTheDocument();
    expect(screen.getByText(/Taylor Brooks/)).toBeInTheDocument();
    expect(screen.getByText("What changed")).toBeInTheDocument();
    expect(screen.getByText("Crew confirmed material drop for tomorrow morning.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Queue review" })).toHaveAttribute("href", "/queue");
    expect(screen.getByRole("link", { name: "Create quote draft" })).toHaveAttribute(
      "href",
      "/quote?transcript_id=transcript-1"
    );
    expect(screen.queryByText("Can you send me a first-pass estimate before Friday?")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "View transcript" }));

    expect(await screen.findByText("Can you send me a first-pass estimate before Friday?")).toBeInTheDocument();
  });

  it("falls back cleanly when transcript summary and raw text are missing", async () => {
    mockJobDetail = {
      job: {
        id: "job-1",
        name: "Miller Job",
        type: "Roofing",
        status: "active",
        health: "on-track",
        address: "101 Main St",
        contract_value: 90000,
        contract_type: "Lump Sum",
        est_completion: "2026-12-01",
        notes: "",
        last_updated: "2026-03-05T10:00:00+00:00",
        open_items: [],
      },
      recent_updates: [],
      call_history: [
        {
          id: "transcript-fallback",
          timestamp: "2026-03-06T10:00:00+00:00",
          trace_id: "trace-transcript-fallback",
          caller_label: "",
          caller_phone: "",
          source: "",
          provider: "",
          summary: "",
          classification: "",
          urgency: "",
          confidence: null,
          risk_flags: [],
          recommended_actions: [],
          missing_information: [],
          transcript_text: "",
          linked_quote_id: "",
          related_queue_item_ids: [],
          recording_url: "",
          started_at: null,
          duration_seconds: null,
        },
      ],
      audit_timeline: [],
      followup_state: null,
    };

    renderJobDetailPage();

    expect(await screen.findByText("Manual transcript review needed.")).toBeInTheDocument();
    expect(screen.getByText("Inbound call transcript")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "View transcript" }));
    expect(await screen.findByText("Transcript text unavailable.")).toBeInTheDocument();
  });

  it("shows a direct log-as-update action for update-like call history entries", async () => {
    transcriptApiMocks.logTranscriptAsUpdate.mockResolvedValue({
      transcript_id: "transcript-update-1",
      review_state: "logged_update",
      job_id: "job-1",
      job_name: "Miller Job",
      trace_id: "trace-update-1",
      created_draft_ids: ["draft-update-1"],
      errors: [],
    });
    mockJobDetail = {
      ...buildDefaultJobDetail(),
      call_history: [
        {
          id: "transcript-update-1",
          timestamp: "2026-03-06T11:00:00+00:00",
          trace_id: "trace-update-1",
          caller_label: "Jordan Lane - +14235550102",
          caller_phone: "+14235550102",
          source: "call_transcript",
          provider: "manual",
          summary: "Crew found additional framing damage behind the siding.",
          classification: "job_update",
          urgency: "high",
          confidence: 87,
          risk_flags: ["Potential scope increase"],
          recommended_actions: ["Log as update", "Review risk"],
          missing_information: ["Replacement quantity"],
          transcript_text: "Crew found additional framing damage behind the siding.",
          linked_quote_id: "",
          related_queue_item_ids: [],
          recording_url: "",
          started_at: null,
          duration_seconds: 72,
        },
      ],
    };

    renderJobDetailPage();

    fireEvent.click(await screen.findByRole("button", { name: "Log as update" }));

    await waitFor(() => {
      expect(transcriptApiMocks.logTranscriptAsUpdate).toHaveBeenCalledWith("transcript-update-1");
    });
  });
});
