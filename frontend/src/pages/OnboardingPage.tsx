import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { SignIn, SignedIn, SignedOut, useUser } from "@clerk/clerk-react";
import { useNavigate } from "react-router-dom";

import { fetchCurrentGcProfile, registerGc } from "../api/auth";

const bypassAuth = import.meta.env.VITE_BYPASS_AUTH === "true";

function normalizePhone(value: string): string {
  return value.replace(/\s+/g, "").trim();
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "object" && error !== null && "errors" in error) {
    const maybeErrors = (error as { errors?: Array<{ longMessage?: string; message?: string }> }).errors;
    const first = maybeErrors?.[0];
    if (first?.longMessage) {
      return first.longMessage;
    }
    if (first?.message) {
      return first.message;
    }
  }

  return "Authentication failed";
}

export function OnboardingPage() {
  const navigate = useNavigate();
  const { user } = useUser();
  const [phoneNumber, setPhoneNumber] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const profileQuery = useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => fetchCurrentGcProfile(),
    enabled: !!user,
    retry: false,
  });

  const registerMutation = useMutation({
    mutationFn: (phone: string) => registerGc(phone),
    onMutate: () => {
      setErrorMessage(null);
    },
    onSuccess: () => {
      navigate("/", { replace: true });
    },
    onError: (error: unknown) => {
      setErrorMessage(getErrorMessage(error));
    },
  });

  useEffect(() => {
    if (bypassAuth) {
      navigate("/quote", { replace: true });
    }
  }, [navigate]);

  useEffect(() => {
    const clerkPhone = user?.primaryPhoneNumber?.phoneNumber;
    if (clerkPhone && !phoneNumber) {
      setPhoneNumber(clerkPhone);
    }
  }, [user, phoneNumber]);

  useEffect(() => {
    if (profileQuery.isSuccess) {
      navigate("/", { replace: true });
    }
  }, [profileQuery.isSuccess, navigate]);

  return (
    <main className="min-h-screen bg-bg px-3 py-6 text-text sm:px-4">
      <div className="mx-auto max-w-md rounded-lg border border-border bg-surface p-5">
        <h1 className="font-mono text-sm uppercase tracking-[0.16em] text-orange">GC Agent Onboarding</h1>

        {bypassAuth ? (
          <p className="mt-3 text-sm text-muted">
            Demo mode is enabled locally. Authentication is bypassed and the app redirects straight to the quote
            screen.
          </p>
        ) : null}

        <SignedOut>
          {bypassAuth ? null : (
            <>
              <p className="mt-3 text-sm text-muted">
                Continue with Clerk sign-in. If Google is the only enabled provider in Clerk, this screen will show
                Google only.
              </p>

              <div className="mt-4">
                <SignIn
                  routing="path"
                  path="/onboarding"
                  forceRedirectUrl="/onboarding"
                  fallbackRedirectUrl="/onboarding"
                />
              </div>
            </>
          )}
        </SignedOut>

        <SignedIn>
          {bypassAuth ? null : (
            <>
              <p className="mt-3 text-sm text-muted">
                Confirm the phone number that should receive WhatsApp updates.
              </p>

              <form
                className="mt-4 space-y-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  const normalized = normalizePhone(phoneNumber);
                  if (!normalized) {
                    setErrorMessage("Phone number is required");
                    return;
                  }
                  registerMutation.mutate(normalized);
                }}
              >
                <label className="block text-xs uppercase tracking-wider text-muted" htmlFor="phone_number">
                  Phone Number
                </label>
                <input
                  id="phone_number"
                  type="tel"
                  value={phoneNumber}
                  onChange={(event) => setPhoneNumber(event.target.value)}
                  placeholder="+15551234567"
                  className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-orange"
                />

                {errorMessage ? <p className="text-sm text-red-300">{errorMessage}</p> : null}

                <button
                  type="submit"
                  disabled={registerMutation.isPending || profileQuery.isLoading}
                  className="w-full rounded-md bg-green px-4 py-2 text-sm font-medium text-bg transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {registerMutation.isPending ? "Saving..." : "Continue to Queue"}
                </button>
              </form>
            </>
          )}
        </SignedIn>
      </div>
    </main>
  );
}
