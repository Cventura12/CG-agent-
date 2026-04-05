export function shouldUseMockApi(): boolean {
  const env = import.meta.env;
  if (env.VITE_OFFLINE_MODE === "1" || env.VITE_MOCK_MODE === "1") {
    return true;
  }

  if (typeof window === "undefined") {
    return false;
  }

  const hostname = window.location.hostname || "";
  if (env.VITE_FORCE_OFFLINE === "1") {
    return true;
  }

  if (hostname.includes("vercel.app")) {
    return false;
  }

  return false;
}
