import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-react";
import { useSearchParams } from "react-router-dom";
import { Calendar, CheckCircle2, Mail, PlugZap, XCircle } from "lucide-react";

import {
  disconnectGoogle,
  fetchGoogleAuthUrl,
  fetchGoogleIntegrationStatus,
} from "../api/integrations";

function formatTimestamp(value: string | null): string {
  if (!value) return "Never";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function IntegrationsPage() {
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [connectError, setConnectError] = useState<string | null>(null);
  const [connectSuccess, setConnectSuccess] = useState(false);

  const statusQuery = useQuery({
    queryKey: ["google-integration-status", userId],
    queryFn: fetchGoogleIntegrationStatus,
    enabled: Boolean(userId),
    staleTime: 30_000,
  });

  const status = statusQuery.data;

  // Handle OAuth redirect result
  useEffect(() => {
    if (searchParams.get("google_connected") === "1") {
      setConnectSuccess(true);
      setConnectError(null);
      void queryClient.invalidateQueries({ queryKey: ["google-integration-status"] });
      setSearchParams({}, { replace: true });
    } else if (searchParams.get("google_error") === "1") {
      setConnectError("Google connection failed. Make sure you approved all requested permissions and try again.");
      setConnectSuccess(false);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams, queryClient]);

  const connectMutation = useMutation({
    mutationFn: fetchGoogleAuthUrl,
    onMutate: () => {
      setConnectError(null);
      setConnectSuccess(false);
    },
    onSuccess: (url) => {
      window.location.href = url;
    },
    onError: (error) => {
      setConnectError(error instanceof Error ? error.message : "Failed to start Google connection.");
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: disconnectGoogle,
    onMutate: () => {
      setConnectError(null);
      setConnectSuccess(false);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["google-integration-status"] });
    },
    onError: (error) => {
      setConnectError(error instanceof Error ? error.message : "Failed to disconnect.");
    },
  });

  const isConnected = status?.connected ?? false;
  const gmailEnabled = status?.gmail_enabled ?? false;
  const calendarEnabled = status?.calendar_enabled ?? false;

  return (
    <div className="pw gc-page">
      <section className="gc-page-header gc-fade-up rounded-[28px] px-5 py-6 sm:px-7 sm:py-7">
        <div className="relative z-10 flex flex-col gap-4">
          <div className="gc-overline">Connected services</div>
          <h1 className="gc-page-title">Integrations</h1>
          <p className="gc-page-copy mt-1 max-w-2xl">
            Connect Gmail to capture inbound field communication automatically. Connect Google Calendar to sync job completion targets.
          </p>
        </div>
      </section>

      {connectError ? (
        <div className="mt-6 rounded-2xl border border-orange-200 bg-orange-50 px-5 py-4 text-[15px] text-orange-700">
          {connectError}
        </div>
      ) : null}

      {connectSuccess ? (
        <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-[15px] text-emerald-700">
          Google account connected. Gmail capture and Calendar sync are now active.
        </div>
      ) : null}

      <div className="mt-6 space-y-5">
        {/* Google Integration Card */}
        <article className="gc-stack-card p-7">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm">
                <svg className="h-6 w-6" viewBox="0 0 48 48" aria-hidden="true">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                </svg>
              </div>
              <div>
                <div className="text-[18px] font-semibold text-slate-950">Google</div>
                <div className="mt-1 text-[14px] text-slate-500">Gmail &amp; Google Calendar</div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {statusQuery.isLoading ? (
                <span className="inline-flex rounded-xl border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-semibold text-slate-500">
                  Checking...
                </span>
              ) : isConnected ? (
                <>
                  <span className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700">
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Connected
                  </span>
                  <button
                    type="button"
                    className="inline-flex h-9 items-center rounded-xl border border-slate-300 bg-white px-4 text-[14px] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => disconnectMutation.mutate()}
                    disabled={disconnectMutation.isPending}
                  >
                    {disconnectMutation.isPending ? "Disconnecting..." : "Disconnect"}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="inline-flex h-9 items-center gap-2 rounded-xl border border-[#2453d4] bg-[#2453d4] px-4 text-[14px] font-semibold text-white transition hover:bg-[#1d44b8] disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => connectMutation.mutate()}
                  disabled={connectMutation.isPending}
                >
                  <PlugZap className="h-4 w-4" aria-hidden="true" />
                  {connectMutation.isPending ? "Redirecting..." : "Connect Google"}
                </button>
              )}
            </div>
          </div>

          {isConnected ? (
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {/* Gmail status */}
              <div className="rounded-[22px] border border-[var(--gc-line)] bg-[rgba(255,255,255,0.68)] px-5 py-5">
                <div className="flex items-center gap-3">
                  <Mail className="h-5 w-5 text-slate-500" aria-hidden="true" />
                  <div className="text-[16px] font-semibold text-slate-950">Gmail capture</div>
                  {gmailEnabled ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                  ) : (
                    <XCircle className="h-4 w-4 text-slate-400" aria-hidden="true" />
                  )}
                </div>
                <p className="mt-3 text-[14px] leading-6 text-slate-500">
                  {gmailEnabled
                    ? "Inbound emails matching field communication patterns are automatically surfaced in your review queue."
                    : "Gmail scope not granted. Reconnect to enable email capture."}
                </p>
                {gmailEnabled && status?.gmail_last_checked ? (
                  <p className="mt-3 text-[13px] text-slate-400">
                    Last checked {formatTimestamp(status.gmail_last_checked)}
                  </p>
                ) : null}
              </div>

              {/* Calendar status */}
              <div className="rounded-[22px] border border-[var(--gc-line)] bg-[rgba(255,255,255,0.68)] px-5 py-5">
                <div className="flex items-center gap-3">
                  <Calendar className="h-5 w-5 text-slate-500" aria-hidden="true" />
                  <div className="text-[16px] font-semibold text-slate-950">Calendar sync</div>
                  {calendarEnabled ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                  ) : (
                    <XCircle className="h-4 w-4 text-slate-400" aria-hidden="true" />
                  )}
                </div>
                <p className="mt-3 text-[14px] leading-6 text-slate-500">
                  {calendarEnabled
                    ? "Job completion targets sync to your Google Calendar automatically. Trigger a manual sync from any Job record."
                    : "Calendar scope not granted. Reconnect to enable calendar sync."}
                </p>
              </div>
            </div>
          ) : (
            <div className="mt-6 rounded-[22px] border border-dashed border-[var(--gc-line-strong)] bg-[rgba(255,255,255,0.48)] px-5 py-6">
              <p className="text-[14px] leading-6 text-slate-500">
                Connect your Google account to enable two features:
              </p>
              <ul className="mt-3 space-y-2 text-[14px] leading-6 text-slate-500">
                <li className="flex items-start gap-2">
                  <Mail className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                  <span><strong className="text-slate-700">Gmail capture</strong> — inbound emails from the field are read-only scanned every 15 minutes. Job-relevant emails become review items in your queue automatically.</span>
                </li>
                <li className="flex items-start gap-2">
                  <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                  <span><strong className="text-slate-700">Calendar sync</strong> — job completion targets appear on your Google Calendar. Sync individual jobs from the Job record.</span>
                </li>
              </ul>
            </div>
          )}
        </article>
      </div>
    </div>
  );
}
