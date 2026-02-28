import {
  ClerkProvider,
  SignedIn,
  SignedOut,
} from "@clerk/clerk-react";
import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { useApiAuthInterceptor } from "./api/client";
import { JobDetailPage } from "./pages/JobDetailPage";
import { OnboardingPage } from "./pages/OnboardingPage";
import { QueuePage } from "./pages/QueuePage";

const clerkPublishableKey = import.meta.env.VITE_CLERK_KEY as string | undefined;

function ProtectedRoute({ children }: { children: ReactNode }) {
  return (
    <>
      <SignedIn>{children}</SignedIn>
      <SignedOut>
        <Navigate to="/onboarding" replace />
      </SignedOut>
    </>
  );
}

function AppRoutes() {
  useApiAuthInterceptor();

  return (
    <Routes>
      <Route path="/onboarding" element={<OnboardingPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <QueuePage />
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
      <AppRoutes />
    </ClerkProvider>
  );
}
