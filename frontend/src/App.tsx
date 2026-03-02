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
import { BottomNav } from "./components/BottomNav";
import { useQueueNotificationStub } from "./hooks/useQueueNotificationStub";
import { BriefingPage } from "./pages/BriefingPage";
import { JobDetailPage } from "./pages/JobDetailPage";
import { JobsPage } from "./pages/JobsPage";
import { OnboardingPage } from "./pages/OnboardingPage";
import { QuotePage } from "./pages/QuotePage";
import { QueuePage } from "./pages/QueuePage";

const clerkPublishableKey = import.meta.env.VITE_CLERK_KEY as string | undefined;

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

  return (
    <div className="pb-20">
      {children}
      <BottomNav />
    </div>
  );
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
          <ProtectedRoute>
            <BriefingPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/queue"
        element={
          <ProtectedRoute>
            <QueuePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/jobs"
        element={
          <ProtectedRoute>
            <JobsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/jobs/:jobId"
        element={
          <ProtectedRoute>
            <JobDetailPage />
          </ProtectedRoute>
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
      <Route path="*" element={<Navigate to="/" replace />} />
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
