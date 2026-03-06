import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { SignIn, useUser } from "@clerk/clerk-react";
import clsx from "clsx";
import { ChevronLeft, Check } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { fetchOnboardingProfile, registerGc, saveOnboardingProfile } from "../api/auth";

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

const TRADE_OPTIONS: Array<{ value: TradeKey; label: string; detail: string }> = [
  { value: "general_construction", label: "General", detail: "Field coordination, framing, concrete, utilities" },
  { value: "roofing", label: "Roofing", detail: "Replacement, repair, storm work, steep-slope crews" },
  { value: "remodel", label: "Remodel", detail: "Interior scopes, restoration, phased work" },
];

const STEP_TITLES = ["Company setup", "Trades", "Pricing baseline", "System ready"] as const;

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
  const normalized = value.trim().toLowerCase().replace(/[-\s]+/g, "_");
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

function OperatorIdentity({ name }: { name: string }) {
  return (
    <div className="rounded-[2px] border border-border/80 bg-surface/80 px-4 py-3">
      <p className="data-label">Operator</p>
      <p className="mt-2 font-display text-xl uppercase tracking-[0.08em] text-text">{name}</p>
      <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-muted">Owner / GC</p>
    </div>
  );
}

function StepRail({ step }: { step: number }) {
  return (
    <div className="terminal-onboarding-stepper" aria-label="Onboarding progress">
      {STEP_TITLES.map((title, index) => {
        const isComplete = index < step;
        const isActive = index === step;
        return (
          <div key={title} className="terminal-onboarding-step-slot">
            <div
              className={clsx(
                "terminal-onboarding-step-node",
                isComplete && "terminal-onboarding-step-node-complete",
                isActive && "terminal-onboarding-step-node-active"
              )}
            >
              {isComplete ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : index + 1}
            </div>
            {index < STEP_TITLES.length - 1 ? (
              <div
                className={clsx(
                  "terminal-onboarding-step-line",
                  index < step && "terminal-onboarding-step-line-complete"
                )}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function OnboardingPage() {
  const navigate = useNavigate();
  const { user } = useUser();

  const [step, setStep] = useState(0);
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
    enabled: !bypassAuth && !!user,
    retry: false,
  });

  const activeDefaults = useMemo(() => {
    return DEFAULTS_BY_TRADE[primaryTrade] ?? DEFAULTS_BY_TRADE.general_construction;
  }, [primaryTrade]);

  const operatorName = useMemo(() => {
    if (bypassAuth) {
      return "Demo Operator";
    }
    return user?.fullName || user?.firstName || user?.primaryEmailAddress?.emailAddress || "Signed-in operator";
  }, [user]);

  const canShowWorkflow = bypassAuth || Boolean(user);
  const onboardingProfile = onboardingQuery.data;
  const needsRegistration = onboardingProfile ? !onboardingProfile.registered : !bypassAuth;

  const saveMutation = useMutation({
    mutationFn: async () => {
      const onboarding = onboardingQuery.data;
      if (!bypassAuth && !onboarding) {
        throw new Error("Onboarding profile not loaded.");
      }

      const normalizedPhone = normalizePhone(phoneNumber);
      if (!bypassAuth && onboarding && !onboarding.registered) {
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

      if (bypassAuth) {
        return {
          registered: true,
          onboarding_complete: true,
          gc_id: "demo",
          phone_number: normalizedPhone,
          ...payload,
          recommended_defaults: defaults,
          missing_fields: [],
        };
      }

      return saveOnboardingProfile(payload);
    },
    onMutate: () => {
      setErrorMessage(null);
    },
    onSuccess: () => {
      setStep(3);
    },
    onError: (error: unknown) => {
      setErrorMessage(getErrorMessage(error));
    },
  });

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
      String(onboarding.synthetic_underlayment_per_square || defaults.synthetic_underlayment_per_square)
    );
    setPreferredSupplier(onboarding.preferred_supplier || "");
    setPreferredShingleBrand(onboarding.preferred_shingle_brand || "");
    setNotes(onboarding.notes || "");
  }, [navigate, onboardingQuery.data, user]);

  const canAdvanceCompanyStep = companyName.trim().length > 0 && serviceArea.trim().length > 0 && (!needsRegistration || normalizePhone(phoneNumber).length > 0);
  const canAdvanceTradeStep = primaryTrade.trim().length > 0;
  const isBusy = onboardingQuery.isLoading || saveMutation.isPending;

  return (
    <main className="terminal-onboarding-shell">
      <div className="terminal-onboarding-frame">
        <div className="terminal-onboarding-brand-stack">
          <div className="terminal-brand-mark">GC</div>
          <div>
            <div className="terminal-brand-title">
              GC <span>Agent</span>
            </div>
            <p className="terminal-brand-sub">Intelligent Operations System</p>
          </div>
        </div>

        <StepRail step={step} />

        {!canShowWorkflow ? (
          <section className="surface-panel w-full max-w-[35rem]">
            <div className="surface-card-header">
              <div>
                <p className="kicker">Authentication</p>
                <h1 className="panel-title mt-3">Operator sign-in</h1>
                <p className="panel-subtitle">
                  Sign in first, then complete the operating baseline. This setup feeds your first live estimate.
                </p>
              </div>
            </div>
            <div className="surface-card-body">
              <SignIn
                routing="path"
                path="/onboarding"
                forceRedirectUrl="/onboarding"
                fallbackRedirectUrl="/onboarding"
              />
            </div>
          </section>
        ) : (
          <section className="surface-panel w-full max-w-[35rem]">
            {step < 3 ? (
              <>
                <div className="surface-card-header">
                  <div>
                    <p className="kicker">{STEP_TITLES[step]}</p>
                    <h1 className="panel-title mt-3">{STEP_TITLES[step]}</h1>
                    <p className="panel-subtitle">
                      {step === 0
                        ? "GC Agent uses this to personalize all estimates. Start with the company baseline and operator contact."
                        : step === 1
                          ? "Pick the trade lane that best matches the work you quote most often. This shapes the first pricing defaults."
                          : "Defaults anchor every estimate. You can refine them later as live job data accumulates."}
                    </p>
                  </div>
                </div>
                <div className="surface-card-body">
                  {onboardingQuery.isLoading ? (
                    <div className="rounded-[2px] border border-border/80 bg-surface/80 px-4 py-6 font-mono text-xs uppercase tracking-[0.16em] text-muted">
                      Loading contractor profile...
                    </div>
                  ) : null}

                  {!onboardingQuery.isLoading && step === 0 ? (
                    <div className="space-y-4">
                      <OperatorIdentity name={operatorName} />
                      <div>
                        <label className="data-label" htmlFor="company_name">
                          Company name
                        </label>
                        <input
                          id="company_name"
                          type="text"
                          value={companyName}
                          onChange={(event) => setCompanyName(event.target.value)}
                          placeholder="e.g. Webb Construction LLC"
                          className="field-input"
                        />
                      </div>
                      <div>
                        <label className="data-label" htmlFor="phone_number">
                          Primary contact
                        </label>
                        <input
                          id="phone_number"
                          type="tel"
                          value={phoneNumber}
                          onChange={(event) => setPhoneNumber(event.target.value)}
                          placeholder="e.g. +15551234567"
                          className="field-input"
                        />
                      </div>
                      <div>
                        <label className="data-label" htmlFor="service_area">
                          Service area
                        </label>
                        <input
                          id="service_area"
                          type="text"
                          value={serviceArea}
                          onChange={(event) => setServiceArea(event.target.value)}
                          placeholder="e.g. Chattanooga, TN metro"
                          className="field-input"
                        />
                      </div>
                    </div>
                  ) : null}

                  {!onboardingQuery.isLoading && step === 1 ? (
                    <div className="space-y-4">
                      <div className="grid gap-3 sm:grid-cols-3">
                        {TRADE_OPTIONS.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => setPrimaryTrade(option.value)}
                            className={clsx(
                              "min-h-[6rem] border px-4 py-4 text-left transition",
                              "rounded-[2px]",
                              primaryTrade === option.value
                                ? "border-orange bg-orange/10 text-text"
                                : "border-border bg-surface/80 text-muted hover:border-orange/60 hover:text-text"
                            )}
                          >
                            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">Trade lane</div>
                            <div className="mt-3 font-display text-2xl uppercase tracking-[0.08em] text-text">{option.label}</div>
                            <p className="mt-2 text-xs leading-5 text-muted">{option.detail}</p>
                          </button>
                        ))}
                      </div>
                      <div className="rounded-[2px] border border-blue-500/35 bg-blue-500/10 px-4 py-3 font-mono text-[10px] uppercase tracking-[0.12em] text-steel">
                        This sets the day-one baseline only. You can still quote any construction scope after setup.
                      </div>
                    </div>
                  ) : null}

                  {!onboardingQuery.isLoading && step === 2 ? (
                    <div className="space-y-4">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <label className="data-label" htmlFor="labor_rate">
                            Avg hourly labor
                          </label>
                          <input
                            id="labor_rate"
                            type="number"
                            value={laborRatePerSquare}
                            onChange={(event) => setLaborRatePerSquare(event.target.value)}
                            placeholder={`e.g. $${activeDefaults.labor_rate_per_square}/sq`}
                            className="field-input"
                          />
                        </div>
                        <div>
                          <label className="data-label" htmlFor="markup_pct">
                            Overhead markup
                          </label>
                          <input
                            id="markup_pct"
                            type="number"
                            value={defaultMarkupPct}
                            onChange={(event) => setDefaultMarkupPct(event.target.value)}
                            placeholder={`e.g. ${activeDefaults.default_markup_pct}%`}
                            className="field-input"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="data-label" htmlFor="supplier">
                          Primary supplier
                        </label>
                        <input
                          id="supplier"
                          type="text"
                          value={preferredSupplier}
                          onChange={(event) => setPreferredSupplier(event.target.value)}
                          placeholder="e.g. ABC Supply, Wesco"
                          className="field-input"
                        />
                      </div>

                      <div className="rounded-[2px] border border-blue-500/35 bg-blue-500/10 px-4 py-3 font-mono text-[10px] uppercase tracking-[0.12em] text-steel">
                        Starting defaults only. GC Agent refines from real job outcomes.
                      </div>

                      <button
                        type="button"
                        onClick={() => setShowAdvancedPricing((current) => !current)}
                        className="action-button-secondary"
                      >
                        {showAdvancedPricing ? "Hide detailed pricing" : "Show detailed pricing"}
                      </button>

                      {showAdvancedPricing ? (
                        <div className="grid gap-4 border-t border-border/80 pt-4 sm:grid-cols-2">
                          <div>
                            <label className="data-label" htmlFor="tear_off">
                              Removal baseline
                            </label>
                            <input
                              id="tear_off"
                              type="number"
                              value={tearOffPerSquare}
                              onChange={(event) => setTearOffPerSquare(event.target.value)}
                              className="field-input"
                            />
                          </div>
                          <div>
                            <label className="data-label" htmlFor="laminated">
                              Laminated material baseline
                            </label>
                            <input
                              id="laminated"
                              type="number"
                              value={laminatedPerSquare}
                              onChange={(event) => setLaminatedPerSquare(event.target.value)}
                              className="field-input"
                            />
                          </div>
                          <div>
                            <label className="data-label" htmlFor="underlayment">
                              Underlayment baseline
                            </label>
                            <input
                              id="underlayment"
                              type="number"
                              value={underlaymentPerSquare}
                              onChange={(event) => setUnderlaymentPerSquare(event.target.value)}
                              className="field-input"
                            />
                          </div>
                          <div>
                            <label className="data-label" htmlFor="brand">
                              Preferred material brand
                            </label>
                            <input
                              id="brand"
                              type="text"
                              value={preferredShingleBrand}
                              onChange={(event) => setPreferredShingleBrand(event.target.value)}
                              className="field-input"
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="data-label" htmlFor="notes">
                              Notes
                            </label>
                            <textarea
                              id="notes"
                              value={notes}
                              onChange={(event) => setNotes(event.target.value)}
                              rows={3}
                              className="field-textarea"
                            />
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {errorMessage ? <p className="mt-4 text-sm text-red-200">{errorMessage}</p> : null}
                </div>

                <div className="flex items-center justify-between gap-3 border-t border-border/80 px-4 py-4 sm:px-5">
                  <div>
                    {step > 0 ? (
                      <button
                        type="button"
                        onClick={() => setStep((current) => Math.max(current - 1, 0))}
                        className="action-button-secondary"
                      >
                        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                        Back
                      </button>
                    ) : null}
                  </div>
                  <div>
                    {step < 2 ? (
                      <button
                        type="button"
                        onClick={() => setStep((current) => current + 1)}
                        disabled={(step === 0 && !canAdvanceCompanyStep) || (step === 1 && !canAdvanceTradeStep)}
                        className="action-button-primary disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Continue ?
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => saveMutation.mutate()}
                        disabled={isBusy}
                        className="action-button-primary disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {saveMutation.isPending ? "Saving..." : "Finish setup"}
                      </button>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="surface-card-body py-14 text-center sm:py-16">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[2px] border border-orange/50 bg-orange/10 text-orange">
                    <Check className="h-8 w-8" aria-hidden="true" />
                  </div>
                  <p className="kicker mt-8">System initialized</p>
                  <h1 className="panel-title mt-4">System ready</h1>
                  <p className="mx-auto mt-4 max-w-lg text-sm leading-7 text-muted">
                    GC Agent has the company baseline, trade context, and starting pricing it needs to generate live quotes with usable assumptions.
                  </p>
                  <div className="mt-8 flex justify-center">
                    <button
                      type="button"
                      onClick={() => navigate("/quote?first_session=1", { replace: true })}
                      className="action-button-primary min-w-[14rem]"
                    >
                      Launch dashboard
                    </button>
                  </div>
                </div>
              </>
            )}
          </section>
        )}
      </div>
    </main>
  );
}

