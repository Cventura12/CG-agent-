import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { UserButton, useAuth, useClerk } from "@clerk/clerk-react";

import { createReferralInvite } from "../api/referrals";
import { useReferrals } from "../hooks/useReferrals";

function formatTimestamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

export function ReferralsPage() {
  const { userId } = useAuth();
  const { signOut } = useClerk();
  const currentUserId = userId ?? null;
  const queryClient = useQueryClient();

  const referralsQuery = useReferrals(currentUserId);
  const data = referralsQuery.data;

  const [channel, setChannel] = useState("link");
  const [destination, setDestination] = useState("");
  const [inviteeName, setInviteeName] = useState("");
  const [note, setNote] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const [shareMessage, setShareMessage] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const inviteMutation = useMutation({
    mutationFn: async () =>
      createReferralInvite({
        channel,
        destination,
        invitee_name: inviteeName,
        note,
      }),
    onMutate: () => {
      setErrorMessage(null);
      setCopied(null);
    },
    onSuccess: async (payload) => {
      setShareUrl(payload.share_url);
      setShareMessage(payload.share_message);
      await queryClient.invalidateQueries({ queryKey: ["referrals", currentUserId ?? "anonymous"] });
    },
    onError: (error: unknown) => {
      if (error instanceof Error && error.message) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage("Could not create referral invite.");
      }
    },
  });

  const recentInvites = useMemo(() => (data?.invites ?? []).slice(0, 8), [data]);
  const recentLeads = useMemo(() => (data?.leads ?? []).slice(0, 8), [data]);

  const copyText = async (value: string, key: string) => {
    if (!value.trim()) {
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
    } catch {
      setErrorMessage("Clipboard copy failed. Copy manually.");
    }
  };

  return (
    <main className="min-h-screen bg-bg px-3 pb-6 pt-3 text-text sm:px-4">
      <div className="mx-auto max-w-5xl space-y-4">
        <header className="rounded-2xl border border-border bg-surface/95 p-4 backdrop-blur-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-orange">Referrals</p>
              <h1 className="mt-1 text-xl font-semibold text-text">Invite a contractor</h1>
              <p className="mt-1 text-sm text-muted">
                Share your referral link, track accepted invites, and see inbound leads in one place.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void signOut({ redirectUrl: "/onboarding" })}
                className="rounded-md border border-border px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-muted transition hover:border-orange hover:text-orange"
              >
                Sign Out
              </button>
              <UserButton afterSignOutUrl="/onboarding" />
            </div>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <article className="rounded-2xl border border-border bg-surface p-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">Invites total</p>
            <p className="mt-2 text-2xl font-semibold text-text">{data?.summary.invites_total ?? 0}</p>
          </article>
          <article className="rounded-2xl border border-border bg-surface p-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">Pending</p>
            <p className="mt-2 text-2xl font-semibold text-text">{data?.summary.invites_pending ?? 0}</p>
          </article>
          <article className="rounded-2xl border border-border bg-surface p-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">Accepted</p>
            <p className="mt-2 text-2xl font-semibold text-text">{data?.summary.invites_accepted ?? 0}</p>
          </article>
          <article className="rounded-2xl border border-border bg-surface p-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">Leads created</p>
            <p className="mt-2 text-2xl font-semibold text-text">{data?.summary.leads_total ?? 0}</p>
          </article>
        </section>

        <section className="rounded-2xl border border-border bg-surface p-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">Create invite</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs uppercase tracking-[0.16em] text-muted" htmlFor="ref-channel">
                Channel
              </label>
              <select
                id="ref-channel"
                value={channel}
                onChange={(event) => setChannel(event.target.value)}
                className="mt-2 w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-text outline-none transition focus:border-orange"
              >
                <option value="link">Link only</option>
                <option value="sms">SMS</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="email">Email</option>
              </select>
            </div>
            <div>
              <label className="text-xs uppercase tracking-[0.16em] text-muted" htmlFor="ref-destination">
                Destination (optional)
              </label>
              <input
                id="ref-destination"
                type="text"
                value={destination}
                onChange={(event) => setDestination(event.target.value)}
                placeholder="+14235551234 or email@domain.com"
                className="mt-2 w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-text outline-none transition focus:border-orange"
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-[0.16em] text-muted" htmlFor="ref-name">
                Invitee name (optional)
              </label>
              <input
                id="ref-name"
                type="text"
                value={inviteeName}
                onChange={(event) => setInviteeName(event.target.value)}
                className="mt-2 w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-text outline-none transition focus:border-orange"
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-[0.16em] text-muted" htmlFor="ref-note">
                Note (optional)
              </label>
              <input
                id="ref-note"
                type="text"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Why this contact is a fit"
                className="mt-2 w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-text outline-none transition focus:border-orange"
              />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => inviteMutation.mutate()}
              disabled={inviteMutation.isPending}
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-green px-4 py-2 text-sm font-medium text-bg transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {inviteMutation.isPending ? "Creating..." : "Create referral invite"}
            </button>
            {errorMessage ? <span className="text-sm text-red-300">{errorMessage}</span> : null}
          </div>

          {shareUrl ? (
            <div className="mt-4 space-y-2 rounded-xl border border-border bg-bg p-3">
              <p className="text-xs uppercase tracking-[0.16em] text-muted">Share URL</p>
              <div className="flex flex-wrap items-center gap-2">
                <code className="rounded-md bg-surface px-2 py-1 text-xs text-text">{shareUrl}</code>
                <button
                  type="button"
                  onClick={() => void copyText(shareUrl, "url")}
                  className="rounded-md border border-border px-2 py-1 text-xs text-muted transition hover:border-orange hover:text-orange"
                >
                  {copied === "url" ? "Copied" : "Copy URL"}
                </button>
              </div>
              <p className="text-xs uppercase tracking-[0.16em] text-muted">Share message</p>
              <div className="flex flex-wrap items-center gap-2">
                <code className="rounded-md bg-surface px-2 py-1 text-xs text-text">{shareMessage}</code>
                <button
                  type="button"
                  onClick={() => void copyText(shareMessage, "message")}
                  className="rounded-md border border-border px-2 py-1 text-xs text-muted transition hover:border-orange hover:text-orange"
                >
                  {copied === "message" ? "Copied" : "Copy message"}
                </button>
              </div>
            </div>
          ) : null}
        </section>

        <section className="grid gap-3 lg:grid-cols-2">
          <article className="rounded-2xl border border-border bg-surface p-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">Recent invites</p>
            {referralsQuery.isLoading ? <p className="mt-3 text-sm text-muted">Loading invites...</p> : null}
            {!referralsQuery.isLoading && recentInvites.length === 0 ? (
              <p className="mt-3 text-sm text-muted">No invites yet.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {recentInvites.map((invite) => (
                  <div key={invite.id} className="rounded-xl border border-border bg-bg px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted">
                        {invite.channel}
                      </span>
                      <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-text">
                        {invite.status}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-text">{invite.invitee_name || invite.destination || "Unnamed invite"}</p>
                    <p className="mt-1 text-xs text-muted">Code: {invite.invite_code}</p>
                    <p className="mt-1 text-xs text-muted">{formatTimestamp(invite.created_at)}</p>
                  </div>
                ))}
              </div>
            )}
          </article>

          <article className="rounded-2xl border border-border bg-surface p-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">Inbound leads</p>
            {referralsQuery.isLoading ? <p className="mt-3 text-sm text-muted">Loading leads...</p> : null}
            {!referralsQuery.isLoading && recentLeads.length === 0 ? (
              <p className="mt-3 text-sm text-muted">No accepted leads yet.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {recentLeads.map((lead) => (
                  <div key={lead.id} className="rounded-xl border border-border bg-bg px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted">
                        {lead.source || "web"}
                      </span>
                      <span className="rounded-full border border-green/50 bg-green/10 px-2 py-0.5 text-[11px] text-green">
                        {lead.status}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-text">{lead.referred_name || "Unnamed lead"}</p>
                    <p className="mt-1 text-xs text-muted">{lead.referred_contact || "No contact captured"}</p>
                    <p className="mt-1 text-xs text-muted">{formatTimestamp(lead.created_at)}</p>
                  </div>
                ))}
              </div>
            )}
          </article>
        </section>
      </div>
    </main>
  );
}
