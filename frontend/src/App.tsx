import {
  AuthenticateWithRedirectCallback,
  ClerkFailed,
  ClerkLoaded,
  ClerkLoading,
  ClerkProvider,
  SignedIn,
  SignedOut,
  useAuth,
} from "@clerk/clerk-react";
import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { useApiAuthInterceptor } from "./api/client";
import { AppShell } from "./components/AppShell";
import { useQueueNotificationStub } from "./hooks/useQueueNotificationStub";
import { AnalyticsPage } from "./pages/AnalyticsPage";
import { BriefingPage } from "./pages/BriefingPage";
import { JobDetailPage } from "./pages/JobDetailPage";
import { JobsPage } from "./pages/JobsPage";
import { InsightsPage } from "./pages/InsightsPage";
import { OnboardingPage } from "./pages/OnboardingPage";
import { QuotePage } from "./pages/QuotePage";
import { QueuePage } from "./pages/QueuePage";

const clerkPublishableKey = import.meta.env.VITE_CLERK_KEY as string | undefined;
const bypassAuth = import.meta.env.VITE_BYPASS_AUTH === "true";

function AppStatusScreen({
  title,
  detail,
}: {
  title: string;
  detail: string;
}) {
  return (
    <main className="min-h-screen bg-bg px-3 py-6 text-text sm:px-4">
      <div className="mx-auto max-w-md rounded-lg border border-border bg-surface p-5">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-orange">GC Agent</p>
        <h1 className="mt-2 text-lg font-semibold text-text">{title}</h1>
        <p className="mt-2 text-sm text-muted">{detail}</p>
      </div>
    </main>
  );
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  if (bypassAuth) {
    return <ProtectedAppFrame>{children}</ProtectedAppFrame>;
  }

  return (
    <>
      <SignedIn>
        <ProtectedAppFrame>{children}</ProtectedAppFrame>
      </SignedIn>
      <SignedOut>
        <Navigate to="/onboarding" replace />
      </SignedOut>
    </>
  );
}

function ProtectedAppFrame({ children }: { children: ReactNode }) {
  const { userId } = useAuth();
  useQueueNotificationStub(userId ?? null);

  return <AppShell>{children}</AppShell>;
}

function AppRoutes() {
  useApiAuthInterceptor();

  return (
    <Routes>
      <Route path="/sso-callback" element={<AuthenticateWithRedirectCallback />} />
      <Route path="/onboarding" element={<OnboardingPage />} />
      <Route
        path="/"
        element={
          bypassAuth ? (
            <Navigate to="/quote" replace />
          ) : (
            <ProtectedRoute>
              <BriefingPage />
            </ProtectedRoute>
          )
        }
      />
      <Route
        path="/queue"
        element={
          bypassAuth ? (
            <Navigate to="/quote" replace />
          ) : (
            <ProtectedRoute>
              <QueuePage />
            </ProtectedRoute>
          )
        }
      />
      <Route
        path="/jobs"
        element={
          bypassAuth ? (
            <Navigate to="/quote" replace />
          ) : (
            <ProtectedRoute>
              <JobsPage />
            </ProtectedRoute>
          )
        }
      />
      <Route
        path="/jobs/:jobId"
        element={
          bypassAuth ? (
            <Navigate to="/quote" replace />
          ) : (
            <ProtectedRoute>
              <JobDetailPage />
            </ProtectedRoute>
          )
        }
      />
      <Route
        path="/quote"
        element={
          <ProtectedRoute>
            <QuotePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/analytics"
        element={
          bypassAuth ? (
            <Navigate to="/quote" replace />
          ) : (
            <ProtectedRoute>
              <AnalyticsPage />
            </ProtectedRoute>
          )
        }
      />
      <Route
        path="/insights"
        element={
          bypassAuth ? (
            <Navigate to="/quote" replace />
          ) : (
            <ProtectedRoute>
              <InsightsPage />
            </ProtectedRoute>
          )
        }
      />
      <Route path="*" element={<Navigate to={bypassAuth ? "/quote" : "/"} replace />} />
    </Routes>
  );
}

export default function App() {
  if (!clerkPublishableKey) {
    throw new Error("VITE_CLERK_KEY is required");
  }

  return (
    <ClerkProvider publishableKey={clerkPublishableKey}>
      <ClerkLoading>
        <AppStatusScreen
          title="Loading sign-in"
          detail="GC Agent is initializing Clerk. This should only take a few seconds."
        />
      </ClerkLoading>
      <ClerkFailed>
        <AppStatusScreen
          title="Sign-in failed to load"
          detail="Clerk could not initialize. Verify the publishable key and refresh the page."
        />
      </ClerkFailed>
      <ClerkLoaded>
        <AppRoutes />
      </ClerkLoaded>
    </ClerkProvider>
  );
}
