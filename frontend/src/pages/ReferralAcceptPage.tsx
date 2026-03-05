import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";

import { acceptReferralInvitePublic } from "../api/referrals";

export function ReferralAcceptPage() {
  const params = useParams<{ inviteCode: string }>();
  const inviteCode = (params.inviteCode ?? "").trim().toUpperCase();

  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [successText, setSuccessText] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  const acceptMutation = useMutation({
    mutationFn: async () =>
      acceptReferralInvitePublic({
        invite_code: inviteCode,
        referred_name: name,
        referred_contact: contact,
        source: "referral_page",
      }),
    onMutate: () => {
      setSuccessText(null);
      setErrorText(null);
    },
    onSuccess: () => {
      setSuccessText("Thanks. Your referral has been recorded.");
    },
    onError: (error: unknown) => {
      if (error instanceof Error && error.message) {
        setErrorText(error.message);
      } else {
        setErrorText("Could not submit referral right now.");
      }
    },
  });

  return (
    <main className="min-h-screen bg-bg px-3 py-6 text-text sm:px-4">
      <div className="mx-auto max-w-md rounded-2xl border border-border bg-surface p-5">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-orange">GC Agent Referral</p>
        <h1 className="mt-2 text-xl font-semibold text-text">Contractor invite</h1>
        <p className="mt-2 text-sm text-muted">
          Referral code: <span className="font-mono text-text">{inviteCode || "missing"}</span>
        </p>
        <p className="mt-2 text-sm text-muted">
          Share your details so the contractor who referred you can track this invite.
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <label className="text-xs uppercase tracking-[0.16em] text-muted" htmlFor="ref-name">
              Your name
            </label>
            <input
              id="ref-name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-2 w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-text outline-none transition focus:border-orange"
              placeholder="Taylor Roofing"
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-[0.16em] text-muted" htmlFor="ref-contact">
              Phone or email
            </label>
            <input
              id="ref-contact"
              type="text"
              value={contact}
              onChange={(event) => setContact(event.target.value)}
              className="mt-2 w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-text outline-none transition focus:border-orange"
              placeholder="+14235551234"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={() => acceptMutation.mutate()}
          disabled={!inviteCode || acceptMutation.isPending}
          className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-green px-4 py-2 text-sm font-medium text-bg transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {acceptMutation.isPending ? "Submitting..." : "Submit referral"}
        </button>

        {successText ? (
          <div className="mt-3 rounded-xl border border-green/40 bg-green/10 px-3 py-2 text-sm text-green">
            {successText}
          </div>
        ) : null}
        {errorText ? (
          <div className="mt-3 rounded-xl border border-red-400/40 bg-red-400/10 px-3 py-2 text-sm text-red-200">
            {errorText}
          </div>
        ) : null}

        <p className="mt-4 text-center text-xs text-muted">
          Already using GC Agent?{" "}
          <Link to="/onboarding" className="text-orange hover:underline">
            Go to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
