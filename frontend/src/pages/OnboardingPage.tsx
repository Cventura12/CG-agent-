import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { SignIn, SignedIn, SignedOut, useUser } from "@clerk/clerk-react";
import { useNavigate } from "react-router-dom";

import { fetchOnboardingProfile, registerGc, saveOnboardingProfile } from "../api/auth";
import { PageHeader } from "../components/PageHeader";
import { SurfaceCard } from "../components/SurfaceCard";

const bypassAuth = import.meta.env.VITE_BYPASS_AUTH === "true";

type TradeKey = "general_construction" | "roofing" | "remodel";

type PricingDefaults = {
  labor_rate_per_square: number;
  default_markup_pct: number;
  tear_off_per_square: number;
  laminated_shingles_per_square: number;
  synthetic_underlayment_per_square: number;
};

const DEFAULTS_BY_TRADE: Record<TradeKey, PricingDefaults> = {
  general_construction: {
    labor_rate_per_square: 92,
    default_markup_pct: 25,
    tear_off_per_square: 58,
    laminated_shingles_per_square: 142,
    synthetic_underlayment_per_square: 20,
  },
  roofing: {
    labor_rate_per_square: 95,
    default_markup_pct: 27,
    tear_off_per_square: 62,
    laminated_shingles_per_square: 148,
    synthetic_underlayment_per_square: 21,
  },
  remodel: {
    labor_rate_per_square: 88,
    default_markup_pct: 24,
    tear_off_per_square: 54,
    laminated_shingles_per_square: 136,
    synthetic_underlayment_per_square: 19,
  },
};

const TRADE_OPTIONS: Array<{ value: TradeKey; label: string }> = [
  { value: "general_construction", label: "General construction" },
  { value: "roofing", label: "Roofing" },
  { value: "remodel", label: "Remodel / restoration" },
];

function normalizePhone(value: string): string {
  return value.replace(/\s+/g, "").trim();
}

function parsePositiveNumber(value: string): number {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }
  return parsed;
}

function asTradeKey(value: string): TradeKey {
  const normalized = value.trim().toLowerCase().replace("-", "_").replace(" ", "_");
  if (normalized === "roofing") {
    return "roofing";
  }
  if (normalized === "remodel") {
    return "remodel";
  }
  return "general_construction";
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
  const [companyName, setCompanyName] = useState("");
  const [primaryTrade, setPrimaryTrade] = useState<TradeKey>("general_construction");
  const [serviceArea, setServiceArea] = useState("");
  const [laborRatePerSquare, setLaborRatePerSquare] = useState("");
  const [defaultMarkupPct, setDefaultMarkupPct] = useState("");
  const [tearOffPerSquare, setTearOffPerSquare] = useState("");
  const [laminatedPerSquare, setLaminatedPerSquare] = useState("");
  const [underlaymentPerSquare, setUnderlaymentPerSquare] = useState("");
  const [preferredSupplier, setPreferredSupplier] = useState("");
  const [preferredShingleBrand, setPreferredShingleBrand] = useState("");
  const [notes, setNotes] = useState("");
  const [showAdvancedPricing, setShowAdvancedPricing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const onboardingQuery = useQuery({
    queryKey: ["auth", "onboarding"],
    queryFn: () => fetchOnboardingProfile(),
    enabled: !!user,
    retry: false,
  });

  const activeDefaults = useMemo(() => {
    return DEFAULTS_BY_TRADE[primaryTrade] ?? DEFAULTS_BY_TRADE.general_construction;
  }, [primaryTrade]);

  const hydratePricingFromDefaults = (defaults: PricingDefaults) => {
    setLaborRatePerSquare((current) => current || String(defaults.labor_rate_per_square));
    setDefaultMarkupPct((current) => current || String(defaults.default_markup_pct));
    setTearOffPerSquare((current) => current || String(defaults.tear_off_per_square));
    setLaminatedPerSquare((current) => current || String(defaults.laminated_shingles_per_square));
    setUnderlaymentPerSquare((current) => current || String(defaults.synthetic_underlayment_per_square));
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const onboarding = onboardingQuery.data;
      if (!onboarding) {
        throw new Error("Onboarding profile not loaded.");
      }

      const normalizedPhone = normalizePhone(phoneNumber);
      if (!onboarding.registered) {
        if (!normalizedPhone) {
          throw new Error("Phone number is required.");
        }
        await registerGc(normalizedPhone);
      }

      const defaults = DEFAULTS_BY_TRADE[primaryTrade] ?? DEFAULTS_BY_TRADE.general_construction;
      const payload = {
        company_name: companyName.trim(),
        primary_trade: primaryTrade,
        service_area: serviceArea.trim(),
        labor_rate_per_square: parsePositiveNumber(laborRatePerSquare) || defaults.labor_rate_per_square,
        default_markup_pct: parsePositiveNumber(defaultMarkupPct) || defaults.default_markup_pct,
        tear_off_per_square: parsePositiveNumber(tearOffPerSquare) || defaults.tear_off_per_square,
        laminated_shingles_per_square:
          parsePositiveNumber(laminatedPerSquare) || defaults.laminated_shingles_per_square,
        synthetic_underlayment_per_square:
          parsePositiveNumber(underlaymentPerSquare) || defaults.synthetic_underlayment_per_square,
        preferred_supplier: preferredSupplier.trim(),
        preferred_shingle_brand: preferredShingleBrand.trim(),
        notes: notes.trim(),
      };

      if (!payload.company_name) {
        throw new Error("Company name is required.");
      }

      return saveOnboardingProfile(payload);
    },
    onMutate: () => {
      setErrorMessage(null);
    },
    onSuccess: () => {
      navigate("/quote?first_session=1", { replace: true });
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
    const onboarding = onboardingQuery.data;
    if (!onboarding) {
      return;
    }

    if (onboarding.registered && onboarding.onboarding_complete) {
      navigate("/", { replace: true });
      return;
    }

    const trade = asTradeKey(onboarding.primary_trade || "general_construction");
    const defaults = onboarding.recommended_defaults ?? DEFAULTS_BY_TRADE[trade];

    setPhoneNumber(onboarding.phone_number || user?.primaryPhoneNumber?.phoneNumber || "");
    setCompanyName(onboarding.company_name || "");
    setPrimaryTrade(trade);
    setServiceArea(onboarding.service_area || "");
    setLaborRatePerSquare(String(onboarding.labor_rate_per_square || defaults.labor_rate_per_square));
    setDefaultMarkupPct(String(onboarding.default_markup_pct || defaults.default_markup_pct));
    setTearOffPerSquare(String(onboarding.tear_off_per_square || defaults.tear_off_per_square));
    setLaminatedPerSquare(
      String(onboarding.laminated_shingles_per_square || defaults.laminated_shingles_per_square)
    );
    setUnderlaymentPerSquare(
      String(
        onboarding.synthetic_underlayment_per_square || defaults.synthetic_underlayment_per_square
      )
    );
    setPreferredSupplier(onboarding.preferred_supplier || "");
    setPreferredShingleBrand(onboarding.preferred_shingle_brand || "");
    setNotes(onboarding.notes || "");
  }, [onboardingQuery.data, user, navigate]);

  return (
    <main className="page-wrap">
      <div className="mx-auto max-w-5xl section-stack">
        <PageHeader
          eyebrow="Onboarding"
          title="Set the operating baseline"
          description="Get the first quote running fast. Start with company basics, trade context, and default pricing so GC Agent has usable assumptions on day one."
          stats={[
            { label: "Target", value: "Under 10 min" },
            { label: "Result", value: "First send-ready quote" },
            { label: "Mode", value: bypassAuth ? "Demo" : "Live", tone: bypassAuth ? "warning" : "success" },
          ]}
        />

        <div className="grid gap-4 xl:grid-cols-[0.92fr_1.08fr]">
          <SurfaceCard eyebrow="Why this matters" title="What the setup unlocks">
            <div className="space-y-3 text-sm leading-7 text-muted">
              <p>
                GC Agent is strongest when the first quote already reflects your trade, your pricing posture, and the materials you actually buy.
              </p>
              <p>
                The fast path is simple: company name, trade, service area, then recommended defaults. Advanced pricing is there if you want tighter control before the first estimate.
              </p>
              {bypassAuth ? (
                <div className="rounded-[1.2rem] border border-yellow/40 bg-yellow/10 px-4 py-3 text-yellow">
                  Demo mode is enabled locally. Authentication is bypassed and the app redirects straight to the quote screen.
                </div>
              ) : null}
            </div>
          </SurfaceCard>

          <SurfaceCard eyebrow="Setup" title="Contractor profile">
            <SignedOut>
              {bypassAuth ? null : (
                <>
                  <p className="text-sm text-muted">
                    Continue with Clerk sign-in. If Google is the only enabled provider in Clerk, this screen will show Google only.
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
                  <p className="text-sm text-muted">
                    Fast start takes about 2 minutes: company + trade + service area, then GC Agent applies recommended pricing defaults for your first quote.
                  </p>

                  <form
                    className="mt-4 space-y-4"
                    onSubmit={(event) => {
                      event.preventDefault();
                      saveMutation.mutate();
                    }}
                  >
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-muted" htmlFor="phone_number">
                      Phone Number
                    </label>
                    <input
                      id="phone_number"
                      type="tel"
                      value={phoneNumber}
                      onChange={(event) => setPhoneNumber(event.target.value)}
                      placeholder="+15551234567"
                      className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-orange"
                    />
                  </div>
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-muted" htmlFor="company_name">
                      Company Name
                    </label>
                    <input
                      id="company_name"
                      type="text"
                      value={companyName}
                      onChange={(event) => setCompanyName(event.target.value)}
                      placeholder="Your company"
                      className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-orange"
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-muted" htmlFor="primary_trade">
                      Primary Trade
                    </label>
                    <select
                      id="primary_trade"
                      value={primaryTrade}
                      onChange={(event) => {
                        const nextTrade = asTradeKey(event.target.value);
                        setPrimaryTrade(nextTrade);
                      }}
                      className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-orange"
                    >
                      {TRADE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-muted" htmlFor="service_area">
                      Service Area
                    </label>
                    <input
                      id="service_area"
                      type="text"
                      value={serviceArea}
                      onChange={(event) => setServiceArea(event.target.value)}
                      placeholder="Chattanooga + 35 miles"
                      className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-orange"
                    />
                  </div>
                </div>

                <div className="rounded-md border border-border bg-bg px-3 py-3 text-xs text-muted">
                  Recommended defaults: labor ${activeDefaults.labor_rate_per_square}/sq, markup{" "}
                  {activeDefaults.default_markup_pct}%, tear-off ${activeDefaults.tear_off_per_square}/sq.
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      hydratePricingFromDefaults(activeDefaults);
                      saveMutation.mutate();
                    }}
                    disabled={saveMutation.isPending || onboardingQuery.isLoading}
                    className="rounded-md bg-green px-4 py-2 text-sm font-medium text-bg transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saveMutation.isPending ? "Saving..." : "Quick Start with Defaults"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      hydratePricingFromDefaults(activeDefaults);
                      setShowAdvancedPricing((current) => !current);
                    }}
                    className="rounded-md border border-border px-4 py-2 text-sm text-muted transition hover:border-orange hover:text-orange"
                  >
                    {showAdvancedPricing ? "Hide advanced pricing" : "Show advanced pricing"}
                  </button>
                </div>

                {showAdvancedPricing ? (
                  <>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div>
                        <label className="block text-xs uppercase tracking-wider text-muted" htmlFor="labor_rate">
                          Labor $/sq
                        </label>
                        <input
                          id="labor_rate"
                          type="number"
                          value={laborRatePerSquare}
                          onChange={(event) => setLaborRatePerSquare(event.target.value)}
                          placeholder="90"
                          className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-orange"
                        />
                      </div>
                      <div>
                        <label className="block text-xs uppercase tracking-wider text-muted" htmlFor="markup_pct">
                          Markup %
                        </label>
                        <input
                          id="markup_pct"
                          type="number"
                          value={defaultMarkupPct}
                          onChange={(event) => setDefaultMarkupPct(event.target.value)}
                          placeholder="25"
                          className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-orange"
                        />
                      </div>
                      <div>
                        <label className="block text-xs uppercase tracking-wider text-muted" htmlFor="tear_off">
                          Tear-off $/sq
                        </label>
                        <input
                          id="tear_off"
                          type="number"
                          value={tearOffPerSquare}
                          onChange={(event) => setTearOffPerSquare(event.target.value)}
                          placeholder="55"
                          className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-orange"
                        />
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="block text-xs uppercase tracking-wider text-muted" htmlFor="laminated">
                          Laminated shingles $/sq
                        </label>
                        <input
                          id="laminated"
                          type="number"
                          value={laminatedPerSquare}
                          onChange={(event) => setLaminatedPerSquare(event.target.value)}
                          placeholder="135"
                          className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-orange"
                        />
                      </div>
                      <div>
                        <label className="block text-xs uppercase tracking-wider text-muted" htmlFor="underlayment">
                          Underlayment $/sq
                        </label>
                        <input
                          id="underlayment"
                          type="number"
                          value={underlaymentPerSquare}
                          onChange={(event) => setUnderlaymentPerSquare(event.target.value)}
                          placeholder="22"
                          className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-orange"
                        />
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="block text-xs uppercase tracking-wider text-muted" htmlFor="supplier">
                          Preferred Supplier
                        </label>
                        <input
                          id="supplier"
                          type="text"
                          value={preferredSupplier}
                          onChange={(event) => setPreferredSupplier(event.target.value)}
                          placeholder="ABC Supply"
                          className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-orange"
                        />
                      </div>
                      <div>
                        <label className="block text-xs uppercase tracking-wider text-muted" htmlFor="shingle_brand">
                          Preferred Shingle Brand
                        </label>
                        <input
                          id="shingle_brand"
                          type="text"
                          value={preferredShingleBrand}
                          onChange={(event) => setPreferredShingleBrand(event.target.value)}
                          placeholder="GAF Timberline HDZ"
                          className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-orange"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs uppercase tracking-wider text-muted" htmlFor="notes">
                        Notes (optional)
                      </label>
                      <textarea
                        id="notes"
                        value={notes}
                        onChange={(event) => setNotes(event.target.value)}
                        rows={3}
                        className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-orange"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={saveMutation.isPending || onboardingQuery.isLoading}
                      className="w-full rounded-md border border-orange bg-transparent px-4 py-2 text-sm font-medium text-orange transition hover:bg-orange/10 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {saveMutation.isPending ? "Saving..." : "Save Full Pricing Profile"}
                    </button>
                  </>
                ) : null}

                {errorMessage ? <p className="text-sm text-red-300">{errorMessage}</p> : null}
                  </form>
                </>
              )}
            </SignedIn>
          </SurfaceCard>
        </div>
      </div>
    </main>
  );
}
