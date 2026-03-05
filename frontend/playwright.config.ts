import { defineConfig } from "@playwright/test";

const PORT = 4174;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30000,
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${PORT}`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    env: {
      VITE_BYPASS_AUTH: "true",
      VITE_CLERK_KEY: process.env.E2E_CLERK_KEY ?? "pk_test_placeholder_for_local",
      VITE_BETA_API_KEY: "e2e-key",
      VITE_BETA_CONTRACTOR_ID: "00000000-0000-0000-0000-000000000001",
      VITE_API_URL: "http://127.0.0.1:8000/api/v1",
      VITE_PUBLIC_API_URL: "http://127.0.0.1:8000/public",
    },
  },
});

