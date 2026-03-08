import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { SignIn, useUser } from "@clerk/clerk-react";
import { useLocation, useNavigate } from "react-router-dom";

import { fetchOnboardingProfile, registerGc, saveOnboardingProfile } from "../api/auth";
import { PricingImportPanel } from "../components/PricingImportPanel";
import type { PricingImportCommitSummary } from "../types";

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
  general_construction: { labor_rate_per_square: 92, default_markup_pct: 25, tear_off_per_square: 58, laminated_shingles_per_square: 142, synthetic_underlayment_per_square: 20 },
  roofing: { labor_rate_per_square: 95, default_markup_pct: 27, tear_off_per_square: 62, laminated_shingles_per_square: 148, synthetic_underlayment_per_square: 21 },
  remodel: { labor_rate_per_square: 88, default_markup_pct: 24, tear_off_per_square: 54, laminated_shingles_per_square: 136, synthetic_underlayment_per_square: 19 },
};

const TRADE_BUTTONS = [
  { label: "Roofing", value: "roofing" as const },
  { label: "Framing", value: "general_construction" as const },
  { label: "Concrete", value: "general_construction" as const },
  { label: "Drywall", value: "remodel" as const },
  { label: "HVAC", value: "general_construction" as const },
  { label: "Electrical", value: "general_construction" as const },
  { label: "Plumbing", value: "general_construction" as const },
  { label: "General", value: "general_construction" as const },
];

const STEP_TITLES = ["Company", "Trades", "Pricing", "Ready"] as const;

function normalizePhone(value: string): string {
  return value.replace(/\s+/g, "").trim();
}

function parsePositiveNumber(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function asTradeKey(value: string): TradeKey {
  const normalized = value.trim().toLowerCase().replace(/[-\s]+/g, "_");
  if (normalized === "roofing") return "roofing";
  if (normalized === "remodel") return "remodel";
  return "general_construction";
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error !== null && "errors" in error) {
    const maybeErrors = (error as { errors?: Array<{ longMessage?: string; message?: string }> }).errors;
    const first = maybeErrors?.[0];
    if (first?.longMessage) return first.longMessage;
    if (first?.message) return first.message;
  }
  return "Authentication failed";
}

export function OnboardingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useUser();
  const [step, setStep] = useState(0);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [operatorNameRole, setOperatorNameRole] = useState("");
  const [primaryTrade, setPrimaryTrade] = useState<TradeKey>("general_construction");
  const [serviceArea, setServiceArea] = useState("");
  const [laborRatePerSquare, setLaborRatePerSquare] = useState("");
  const [defaultMarkupPct, setDefaultMarkupPct] = useState("");
  const [preferredSupplier, setPreferredSupplier] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [importSummary, setImportSummary] = useState<PricingImportCommitSummary | null>(null);
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const pricingMode = searchParams.get("pricing") === "1";

  const onboardingQuery = useQuery({ queryKey: ["auth", "onboarding"], queryFn: () => fetchOnboardingProfile(), enabled: !bypassAuth && !!user, retry: false });
  const activeDefaults = useMemo(() => DEFAULTS_BY_TRADE[primaryTrade] ?? DEFAULTS_BY_TRADE.general_construction, [primaryTrade]);
  const canShowWorkflow = bypassAuth || Boolean(user);
  const onboardingProfile = onboardingQuery.data;
  const needsRegistration = onboardingProfile ? !onboardingProfile.registered : !bypassAuth;

  const saveMutation = useMutation({
    mutationFn: async () => {
      const onboarding = onboardingQuery.data;
      if (!bypassAuth && !onboarding) throw new Error("Onboarding profile not loaded.");
      const normalizedPhone = normalizePhone(phoneNumber);
      if (!bypassAuth && onboarding && !onboarding.registered) {
        if (!normalizedPhone) throw new Error("Phone number is required.");
        await registerGc(normalizedPhone);
      }
      const defaults = DEFAULTS_BY_TRADE[primaryTrade] ?? DEFAULTS_BY_TRADE.general_construction;
      const payload = {
        company_name: companyName.trim(),
        primary_trade: primaryTrade,
        service_area: serviceArea.trim(),
        labor_rate_per_square: parsePositiveNumber(laborRatePerSquare) || defaults.labor_rate_per_square,
        default_markup_pct: parsePositiveNumber(defaultMarkupPct) || defaults.default_markup_pct,
        tear_off_per_square: defaults.tear_off_per_square,
        laminated_shingles_per_square: defaults.laminated_shingles_per_square,
        synthetic_underlayment_per_square: defaults.synthetic_underlayment_per_square,
        preferred_supplier: preferredSupplier.trim(),
        preferred_shingle_brand: "",
        notes: operatorNameRole.trim(),
      };
      if (!payload.company_name) throw new Error("Company name is required.");
      if (bypassAuth) {
        return { registered: true, onboarding_complete: true, gc_id: "demo", phone_number: normalizedPhone, ...payload, recommended_defaults: defaults, missing_fields: [] };
      }
      return saveOnboardingProfile(payload);
    },
    onMutate: () => setErrorMessage(null),
    onSuccess: () => setStep(3),
    onError: (error) => setErrorMessage(getErrorMessage(error)),
  });

  useEffect(() => {
    const onboarding = onboardingQuery.data;
    if (!onboarding) return;
    if (onboarding.registered && onboarding.onboarding_complete && !pricingMode) {
      navigate("/quote", { replace: true });
      return;
    }
    const trade = asTradeKey(onboarding.primary_trade || "general_construction");
    const defaults = onboarding.recommended_defaults ?? DEFAULTS_BY_TRADE[trade];
    setPhoneNumber(onboarding.phone_number || user?.primaryPhoneNumber?.phoneNumber || "");
    setCompanyName(onboarding.company_name || "");
    setOperatorNameRole(user?.fullName || "");
    setPrimaryTrade(trade);
    setServiceArea(onboarding.service_area || "");
    setLaborRatePerSquare(String(onboarding.labor_rate_per_square || defaults.labor_rate_per_square));
    setDefaultMarkupPct(String(onboarding.default_markup_pct || defaults.default_markup_pct));
    setPreferredSupplier(onboarding.preferred_supplier || "");
  }, [navigate, onboardingQuery.data, pricingMode, user]);

  useEffect(() => {
    if (pricingMode && step < 2) {
      setStep(2);
    }
  }, [pricingMode, step]);

  const canAdvanceCompanyStep = companyName.trim().length > 0 && serviceArea.trim().length > 0 && (!needsRegistration || normalizePhone(phoneNumber).length > 0);
  const canAdvanceTradeStep = primaryTrade.trim().length > 0;
  const isBusy = onboardingQuery.isLoading || saveMutation.isPending;

  return (
    <main className="onbs">
      <div style={{ width: "100%", maxWidth: 560 }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 11, marginBottom: 5 }}>
            <div className="brand-hex" style={{ width: 36, height: 36, fontSize: 13 }}>GC</div>
            <div>
              <div className="brand-name" style={{ fontSize: 24, letterSpacing: "3px" }}>GC <em>Agent</em></div>
              <div className="brand-sub" style={{ letterSpacing: "2.5px" }}>INTELLIGENT OPERATIONS SYSTEM</div>
            </div>
          </div>
        </div>

        <div className="strack">
          {STEP_TITLES.map((title, index) => (
            <div key={title} style={{ display: "flex", alignItems: "center", flex: index < STEP_TITLES.length - 1 ? 1 : 0 }}>
              <div className={`snode ${index < step ? "sn-done" : index === step ? "sn-active" : "sn-todo"}`}>{index + 1}</div>
              {index < STEP_TITLES.length - 1 ? <div className={`sline ${index < step ? "sl-done" : "sl-todo"}`} /> : null}
            </div>
          ))}
        </div>

        {!canShowWorkflow ? (
          <div className="panel">
            <div className="ph2"><span className="ptl">Operator Sign-In</span></div>
            <div className="pb lg"><SignIn routing="path" path="/onboarding" forceRedirectUrl="/onboarding" fallbackRedirectUrl="/onboarding" /></div>
          </div>
        ) : (
          <div className="panel">
            {step === 0 ? (
              <div className="pb lg vs ani">
                <div>
                  <h1 style={{ fontFamily: "'Oswald', sans-serif", fontSize: 20, fontWeight: 600, letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--cream)", marginBottom: 3 }}>Company setup</h1>
                  <div style={{ fontFamily: "'Syne Mono', monospace", fontSize: 8, color: "var(--fog)", letterSpacing: "1px" }}>GC AGENT USES THIS TO PERSONALIZE ALL ESTIMATES</div>
                </div>
                <div><label className="lbl" htmlFor="company_name">Company name</label><input id="company_name" className="inp" value={companyName} onChange={(event) => setCompanyName(event.target.value)} placeholder="e.g. Webb Construction LLC" /></div>
                <div><label className="lbl" htmlFor="operator_name_role">Your name &amp; role</label><input id="operator_name_role" className="inp" value={operatorNameRole} onChange={(event) => setOperatorNameRole(event.target.value)} placeholder="e.g. Marcus Webb, Owner" /></div>
                <div><label className="lbl" htmlFor="phone_number">Primary contact</label><input id="phone_number" className="inp" value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} placeholder="e.g. +15551234567" /></div>
                <div><label className="lbl" htmlFor="service_area">Service area</label><input id="service_area" className="inp" value={serviceArea} onChange={(event) => setServiceArea(event.target.value)} placeholder="e.g. Chattanooga, TN metro" /></div>
              </div>
            ) : null}

            {step === 1 ? (
              <div className="pb lg vs ani">
                <div>
                  <h2 style={{ fontFamily: "'Oswald', sans-serif", fontSize: 20, fontWeight: 600, letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--cream)", marginBottom: 3 }}>Trades</h2>
                  <div style={{ fontFamily: "'Syne Mono', monospace", fontSize: 8, color: "var(--fog)", letterSpacing: "1px" }}>SELECT ALL THAT APPLY — SHAPES YOUR ESTIMATING MEMORY</div>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                  {TRADE_BUTTONS.map((option) => (
                    <button key={option.label} type="button" onClick={() => setPrimaryTrade(option.value)} className={`btn ${primaryTrade === option.value ? "ba" : "bw"}`} style={{ borderRadius: 1, fontFamily: "'Syne Mono', monospace", fontSize: 9, letterSpacing: "1px" }}>{option.label}</button>
                  ))}
                </div>
              </div>
            ) : null}

            {step === 2 ? (
              <div className="pb lg vs ani">
                <div>
                  <h2 style={{ fontFamily: "'Oswald', sans-serif", fontSize: 20, fontWeight: 600, letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--cream)", marginBottom: 3 }}>Pricing baseline</h2>
                  <div style={{ fontFamily: "'Syne Mono', monospace", fontSize: 8, color: "var(--fog)", letterSpacing: "1px" }}>DEFAULTS ANCHOR EVERY ESTIMATE — REFINE ANYTIME</div>
                </div>
                <div className="g2">
                  <div><label className="lbl" htmlFor="labor_rate">Avg hourly labor</label><input id="labor_rate" className="inp" type="number" value={laborRatePerSquare} onChange={(event) => setLaborRatePerSquare(event.target.value)} placeholder={`e.g. $${activeDefaults.labor_rate_per_square}/hr`} /></div>
                  <div><label className="lbl" htmlFor="markup_pct">Overhead markup</label><input id="markup_pct" className="inp" type="number" value={defaultMarkupPct} onChange={(event) => setDefaultMarkupPct(event.target.value)} placeholder={`e.g. ${activeDefaults.default_markup_pct}%`} /></div>
                </div>
                <div><label className="lbl" htmlFor="supplier">Primary supplier</label><input id="supplier" className="inp" value={preferredSupplier} onChange={(event) => setPreferredSupplier(event.target.value)} placeholder="e.g. ABC Supply, Wesco" /></div>
                <div className="alert ainfo" style={{ fontSize: 11 }}><span>◈</span><span style={{ fontFamily: "'Syne Mono', monospace", fontSize: 8, letterSpacing: "0.5px", lineHeight: 1.7 }}>STARTING DEFAULTS ONLY — GC AGENT REFINES FROM REAL JOB OUTCOMES</span></div>
                <PricingImportPanel
                  disabledReason={
                    bypassAuth
                      ? "Spreadsheet import requires a signed-in contractor session. Demo mode keeps this disabled."
                      : undefined
                  }
                  onImportComplete={(summary) => setImportSummary(summary)}
                />
                {importSummary ? (
                  <div className="alert aok" style={{ fontSize: 12 }}>
                    <span>✓</span>
                    <div>
                      Imported {importSummary.imported_count} price rows and skipped {importSummary.skipped_count}. GC Agent will use this price book to anchor future estimates.
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {step === 3 ? (
              <div className="pb lg ani" style={{ textAlign: "center", padding: "40px 24px" }}>
                <div style={{ fontSize: 38, marginBottom: 14 }}>🏗</div>
                <h2 style={{ fontFamily: "'Oswald', sans-serif", fontSize: 24, fontWeight: 600, letterSpacing: "2.5px", textTransform: "uppercase", color: "var(--amber-hot)", marginBottom: 8 }}>System ready</h2>
                <div style={{ fontFamily: "'Syne Mono', monospace", fontSize: 8, color: "var(--fog)", letterSpacing: "1.5px", marginBottom: 24 }}>GC AGENT INITIALIZED · ESTIMATING ENGINE ACTIVE</div>
                {importSummary ? (
                  <div className="alert aok" style={{ marginBottom: 18, textAlign: "left", fontSize: 12 }}>
                    <span>✓</span>
                    <div>Imported {importSummary.imported_count} pricing rows. Your next useful step is generating a real quote draft against the imported baseline.</div>
                  </div>
                ) : null}
                <button type="button" className="cta" style={{ fontSize: 13, padding: "11px 28px" }} onClick={() => navigate("/quote", { replace: true })}>CREATE FIRST QUOTE</button>
              </div>
            ) : null}

            {errorMessage ? <div style={{ padding: "0 18px 14px", color: "var(--red-hi)", fontSize: 12 }}>{errorMessage}</div> : null}

            {step < 3 ? (
              <div style={{ borderTop: "1px solid var(--wire)", padding: "11px 14px", display: "flex", justifyContent: "flex-end", gap: 9 }}>
                {step > 0 ? <button type="button" className="btn bw" onClick={() => setStep((current) => Math.max(current - 1, 0))}>← Back</button> : null}
                {step < 2 ? (
                  <button type="button" className="cta" style={{ fontSize: 11, padding: "7px 18px" }} aria-label="Continue" disabled={(step === 0 && !canAdvanceCompanyStep) || (step === 1 && !canAdvanceTradeStep) || isBusy} onClick={() => setStep((current) => current + 1)}>CONTINUE →</button>
                ) : (
                  <button type="button" className="cta" style={{ fontSize: 11, padding: "7px 18px" }} disabled={isBusy} onClick={() => saveMutation.mutate()}>{saveMutation.isPending ? "SAVING..." : "FINISH SETUP"}</button>
                )}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </main>
  );
}

