import { motion } from "framer-motion";
import { FileText } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import { fetchWorkspaceTranscriptQuotePrefill } from "../../api/workspaceTranscripts";
import { fadeUp } from "../../lib/animations";
import { useAppStore } from "../../store/appStore";
import type { Quote, QuoteDraftInput, WorkspaceTranscriptQuotePrefill } from "../../types";
import { EmptyState } from "../ui/EmptyState";
import { QuoteCard } from "./QuoteCard";
import { QuoteComposer } from "./QuoteComposer";
import { QuoteDetail } from "./QuoteDetail";

type QuoteFilter = "all" | Quote["status"];

const filters: Array<{ label: string; value: QuoteFilter }> = [
  { label: "All", value: "all" },
  { label: "Draft", value: "draft" },
  { label: "Sent", value: "sent" },
  { label: "Accepted", value: "accepted" },
  { label: "Rejected", value: "rejected" },
];

function matchesFilter(quote: Quote, filter: QuoteFilter): boolean {
  return filter === "all" ? true : quote.status === filter;
}

function QuotesViewContent({ quotes, useStore = false }: { quotes: Quote[]; useStore?: boolean }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const updateQuoteStatus = useAppStore((state) => state.updateQuoteStatus);
  const setSelectedQuote = useAppStore((state) => state.setSelectedQuote);
  const createQuoteDraft = useAppStore((state) => state.createQuoteDraft);
  const jobs = useAppStore((state) => state.jobs);
  const activeJob = useAppStore((state) => state.jobs.find((job) => job.id === state.activeJobId) ?? null);
  const [filter, setFilter] = useState<QuoteFilter>("all");
  const [transcriptPrefill, setTranscriptPrefill] = useState<WorkspaceTranscriptQuotePrefill | null>(null);
  const [isTranscriptPrefillLoading, setIsTranscriptPrefillLoading] = useState(false);
  const [transcriptPrefillError, setTranscriptPrefillError] = useState<string | null>(null);

  const filteredQuotes = useMemo(() => quotes.filter((quote) => matchesFilter(quote, filter)), [filter, quotes]);
  const selectedQuote = filteredQuotes.find((quote) => quote.id === id) ?? quotes.find((quote) => quote.id === id) ?? null;
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const isComposerOpen = useMemo(() => searchParams.get("compose") === "1", [searchParams]);
  const transcriptId = useMemo(() => searchParams.get("transcriptId")?.trim() ?? "", [searchParams]);
  const composerJobId = useMemo(() => searchParams.get("jobId")?.trim() ?? "", [searchParams]);
  const composerJob = useMemo(
    () => jobs.find((job) => job.id === composerJobId) ?? activeJob,
    [activeJob, composerJobId, jobs]
  );

  useEffect(() => {
    if (useStore) {
      setSelectedQuote(selectedQuote?.id ?? null);
    }
  }, [selectedQuote?.id, setSelectedQuote, useStore]);

  useEffect(() => {
    if (!isComposerOpen || !transcriptId) {
      setTranscriptPrefill(null);
      setTranscriptPrefillError(null);
      setIsTranscriptPrefillLoading(false);
      return;
    }

    let cancelled = false;
    setIsTranscriptPrefillLoading(true);
    setTranscriptPrefillError(null);

    void fetchWorkspaceTranscriptQuotePrefill(transcriptId)
      .then((payload) => {
        if (cancelled) {
          return;
        }
        setTranscriptPrefill(payload);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        setTranscriptPrefill(null);
        setTranscriptPrefillError(error instanceof Error ? error.message : "Could not load transcript context.");
      })
      .finally(() => {
        if (!cancelled) {
          setIsTranscriptPrefillLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isComposerOpen, transcriptId]);

  const closeComposer = () => {
    navigate(location.pathname);
  };

  const handleCreateDraft = (input: QuoteDraftInput) => {
    const nextQuoteId = createQuoteDraft(input);
    if (nextQuoteId) {
      navigate(`/quotes/${nextQuoteId}`);
      return;
    }
    closeComposer();
  };

  return (
    <div className="relative flex h-full overflow-hidden bg-[var(--bg)]">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="border-b border-[var(--line)] px-3 py-2.5 sm:px-5">
          <div className="scrollbar-none flex gap-3 overflow-x-auto">
            {filters.map((filterEntry) => (
              <button
                key={filterEntry.value}
                type="button"
                onClick={() => setFilter(filterEntry.value)}
                className={`border-b-2 px-1 pb-2 pt-1 font-mono text-[12px] transition ${
                  filter === filterEntry.value
                    ? "border-[var(--accent)] text-[var(--t1)]"
                    : "border-transparent text-[var(--t3)] hover:text-[var(--t2)]"
                }`}
              >
                {filterEntry.label}
              </button>
            ))}
          </div>
        </div>

        <div className="scrollbar-none flex-1 overflow-y-auto">
          {filteredQuotes.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No quotes in this lane"
              description="The agent will keep new drafts and sends here once work starts moving."
              action={{ label: "Start new quote", onClick: () => navigate("/quotes?compose=1") }}
            />
          ) : (
            filteredQuotes.map((quote, index) => (
              <motion.div key={quote.id} custom={index} initial="hidden" animate="visible" variants={fadeUp}>
                <QuoteCard quote={quote} selected={selectedQuote?.id === quote.id} onClick={() => navigate(`/quotes/${quote.id}`)} />
              </motion.div>
            ))
          )}
        </div>
      </div>

      {isComposerOpen ? (
        <QuoteComposer
          initialJob={composerJob}
          transcriptPrefill={transcriptPrefill}
          isTranscriptPrefillLoading={isTranscriptPrefillLoading}
          transcriptPrefillError={transcriptPrefillError}
          onClose={closeComposer}
          onCreateDraft={handleCreateDraft}
        />
      ) : null}

      {selectedQuote && !isComposerOpen ? (
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className="absolute inset-0 z-20 lg:static lg:inset-auto"
        >
          <QuoteDetail quote={selectedQuote} onClose={() => navigate("/quotes")} onStatusChange={(status) => updateQuoteStatus(selectedQuote.id, status)} />
        </motion.div>
      ) : null}
    </div>
  );
}

export default function QuotesView() {
  const quotes = useAppStore((state) => state.quotes);
  return <QuotesViewContent quotes={quotes} useStore />;
}

export function QuotesViewDemo() {
  return <QuotesViewContent quotes={useAppStore.getState().quotes} />;
}
