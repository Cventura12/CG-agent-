import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { QueuePage } from "../../src/pages/QueuePage";

const transcriptApiMocks = vi.hoisted(() => ({
  linkTranscriptToJob: vi.fn(),
  markTranscriptReviewed: vi.fn(),
  discardTranscript: vi.fn(),
  logTranscriptAsUpdate: vi.fn(),
}));

function buildDefaultQueueData() {
  return {
    jobs: [
      {
        job_id: "job-1",
        job_name: "Miller Job",
        drafts: [
          {
            id: "draft-transcript-1",
            job_id: "job-1",
            job_name: "Miller Job",
            type: "transcript-review",
            title: "Call transcript review",
            content: "Transcript ID: ct-1\nSummary: Caller wants the revised quote before Friday.",
            why: "Transcript classified as quote question with high urgency.",
            status: "queued",
            created_at: "2026-03-06T10:00:00+00:00",
            trace_id: "trace-transcript-1",
            transcript: {
              transcript_id: "ct-1",
              source: "call_transcript",
              provider: "manual",
              caller_label: "Taylor Brooks - +14235550101",
              caller_phone: "+14235550101",
              summary: "Caller wants a first-pass estimate before Friday.",
              classification: "estimate_request",
              urgency: "high",
              confidence: 91,
              recommended_actions: ["Create quote draft", "Confirm permit allowance"],
              risk_flags: ["Client may stall approval without revised number."],
              missing_information: ["Updated total with permit allowance"],
              transcript_text: "Can you send me a first-pass estimate before Friday?",
              linked_quote_id: "quote-9",
              recording_url: "",
              started_at: null,
              duration_seconds: 114,
            },
          },
          {
            id: "draft-owner-1",
            job_id: "job-1",
            job_name: "Miller Job",
            type: "owner-update",
            title: "Owner update draft",
            content: "Send progress update about framing timeline.",
            why: "Owner is waiting on today's framing status.",
            status: "queued",
            created_at: "2026-03-06T11:00:00+00:00",
            trace_id: "trace-owner-1",
            transcript: null,
          },
        ],
      },
    ],
    inbox: {
      transcripts: [],
    },
  };
}

let mockQueueData = buildDefaultQueueData();

beforeEach(() => {
  mockQueueData = buildDefaultQueueData();
  Object.values(transcriptApiMocks).forEach((mockFn) => mockFn.mockReset());
});

vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => ({ userId: "gc-test" }),
}));

vi.mock("../../src/api/queue", () => ({
  approveAll: vi.fn(),
  approveDraft: vi.fn(),
  editDraft: vi.fn(),
  discardDraft: vi.fn(),
}));

vi.mock("../../src/api/transcripts", () => transcriptApiMocks);

vi.mock("../../src/hooks/useOnlineStatus", () => ({
  useOnlineStatus: () => true,
}));

vi.mock("../../src/hooks/useJobs", () => ({
  useJobs: () => ({
    data: {
      jobs: [
        {
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
          last_updated: "2026-03-06T10:00:00+00:00",
          open_items: [],
        },
      ],
    },
    isLoading: false,
  }),
}));

vi.mock("../../src/hooks/useQueue", () => ({
  useQueue: () => ({
    isLoading: false,
    isError: false,
    data: mockQueueData,
  }),
}));

function renderQueuePage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <QueuePage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("QueuePage transcript review cards", () => {
  it("renders transcript summary first and keeps raw transcript collapsible", async () => {
    renderQueuePage();

    expect(await screen.findByText(/Taylor Brooks/)).toBeInTheDocument();
    expect(screen.getByText("Caller wants a first-pass estimate before Friday.")).toBeInTheDocument();
    expect(screen.getByText("Create quote draft")).toBeInTheDocument();
    expect(screen.getByText("estimate request")).toBeInTheDocument();
    expect(screen.queryByText("Can you send me a first-pass estimate before Friday?")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText(/Taylor Brooks/));
    fireEvent.click(await screen.findByRole("button", { name: "View transcript" }));

    expect(await screen.findByText("Can you send me a first-pass estimate before Friday?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark reviewed" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open job" })).toHaveAttribute("href", "/jobs/job-1");
    expect(screen.getByRole("link", { name: "Create quote draft" })).toHaveAttribute(
      "href",
      "/quote?transcript_id=ct-1"
    );
  });

  it("keeps standard queue drafts visible alongside transcript review items", async () => {
    renderQueuePage();

    expect(await screen.findByText(/Taylor Brooks/)).toBeInTheDocument();
    expect(screen.getAllByText("Miller Job").length).toBeGreaterThan(0);
    expect(screen.getByText("Owner is waiting on today's framing status.")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Owner is waiting on today's framing status."));

    expect(await screen.findByLabelText("Draft content")).toHaveValue("Send progress update about framing timeline.");
    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Discard" })).toBeInTheDocument();
  });

  it("falls back gracefully when transcript context is incomplete", async () => {
    mockQueueData = {
      jobs: [
        {
          job_id: "job-1",
          job_name: "Miller Job",
          drafts: [
            {
              id: "draft-transcript-fallback",
              job_id: "job-1",
              job_name: "Miller Job",
              type: "transcript-review",
              title: "Call transcript review",
              content: "Transcript ID: ct-fallback",
              why: "",
              status: "queued",
              created_at: "2026-03-06T12:00:00+00:00",
              trace_id: "trace-fallback",
              transcript: {
                transcript_id: "",
                source: "",
                provider: "",
                caller_label: "",
                caller_phone: "",
                summary: "",
                classification: "",
                urgency: "",
                confidence: null,
                recommended_actions: [],
                risk_flags: [],
                missing_information: [],
                transcript_text: "",
                linked_quote_id: "",
                recording_url: "",
                started_at: null,
                duration_seconds: null,
              },
            },
          ],
        },
      ],
      inbox: {
        transcripts: [],
      },
    };

    renderQueuePage();

    expect(await screen.findByText("Inbound call transcript")).toBeInTheDocument();
    expect(screen.getByText("Manual transcript review needed.")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Inbound call transcript"));
    fireEvent.click(screen.getByRole("button", { name: "View transcript" }));
    expect(await screen.findByText("Transcript text unavailable.")).toBeInTheDocument();
  });

  it("renders unlinked transcript inbox items before the job-backed queue", async () => {
    mockQueueData = {
      jobs: [],
      inbox: {
        transcripts: [
          {
            transcript_id: "ct-inbox-1",
            trace_id: "trace-inbox-1",
            caller_label: "Taylor Brooks - +14235550101",
            caller_phone: "+14235550101",
            source: "call_transcript",
            provider: "twilio",
            summary: "Caller needs a first-pass estimate before Friday.",
            classification: "estimate_request",
            urgency: "high",
            confidence: 88,
            recommended_actions: ["Create quote draft"],
            risk_flags: ["Tight turnaround"],
            missing_information: ["Exact square footage"],
            transcript_text: "Can you send me a first-pass estimate before Friday?",
            linked_quote_id: "",
            related_queue_item_ids: [],
            created_at: "2026-03-06T10:00:00+00:00",
            recording_url: "",
            started_at: null,
            duration_seconds: 90,
            match_source: "",
            review_state: "pending",
          },
        ],
      },
    };

    renderQueuePage();

    expect(await screen.findByText("Transcript Inbox")).toBeInTheDocument();
    expect(screen.getByText("Caller needs a first-pass estimate before Friday.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Link to job" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark reviewed" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create quote draft" })).toHaveAttribute(
      "href",
      "/quote?transcript_id=ct-inbox-1"
    );
    expect(screen.queryByText("Can you send me a first-pass estimate before Friday?")).not.toBeInTheDocument();
  });

  it("shows a direct log-as-update action for linked update-like transcript reviews", async () => {
    transcriptApiMocks.logTranscriptAsUpdate.mockResolvedValue({
      transcript_id: "ct-update-1",
      review_state: "logged_update",
      job_id: "job-1",
      job_name: "Miller Job",
      trace_id: "trace-update-1",
      created_draft_ids: ["draft-update-1"],
      errors: [],
    });
    mockQueueData = {
      jobs: [
        {
          job_id: "job-1",
          job_name: "Miller Job",
          drafts: [
            {
              id: "draft-transcript-update",
              job_id: "job-1",
              job_name: "Miller Job",
              type: "transcript-review",
              title: "Call transcript review",
              content: "Transcript ID: ct-update-1\nSummary: Crew found additional damage.",
              why: "Transcript classified as job update with high urgency.",
              status: "queued",
              created_at: "2026-03-06T12:00:00+00:00",
              trace_id: "trace-update-1",
              transcript: {
                transcript_id: "ct-update-1",
                source: "call_transcript",
                provider: "manual",
                caller_label: "Jordan Lane - +14235550102",
                caller_phone: "+14235550102",
                summary: "Crew found additional damage behind the siding.",
                classification: "job_update",
                urgency: "high",
                confidence: 89,
                recommended_actions: ["Log as update", "Review risk"],
                risk_flags: ["Potential change in scope"],
                missing_information: ["Replacement quantity"],
                transcript_text: "We found additional damage behind the siding.",
                linked_quote_id: "",
                recording_url: "",
                started_at: null,
                duration_seconds: 96,
              },
            },
          ],
        },
      ],
      inbox: { transcripts: [] },
    };

    renderQueuePage();

    fireEvent.click(await screen.findByText(/Jordan Lane/));
    fireEvent.click(await screen.findByRole("button", { name: "Log as update" }));

    await waitFor(() => {
      expect(transcriptApiMocks.logTranscriptAsUpdate).toHaveBeenCalledWith("ct-update-1");
    });
  });
});
