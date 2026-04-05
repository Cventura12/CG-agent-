export function shouldUseMockApi(): boolean {
  const env = import.meta.env;
  if (env.VITE_OFFLINE_MODE === "1" || env.VITE_MOCK_MODE === "1") {
    return true;
  }

  if (typeof window === "undefined") {
    return false;
  }

  const hostname = window.location.hostname || "";
  const publicUrl = (env.VITE_PUBLIC_API_URL as string | undefined) ?? (env.VITE_API_URL as string | undefined) ?? "";

  if (hostname.includes("vercel.app")) {
    return true;
  }

  return false;
}
