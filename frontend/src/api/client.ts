import axios from "axios";

const baseURL =
  (import.meta.env.VITE_API_URL as string | undefined) ??
  "http://localhost:8000/api/v1";
const publicBaseURL =
  (import.meta.env.VITE_PUBLIC_API_URL as string | undefined) ??
  `${baseURL.replace(/\/api\/v1\/?$/i, "")}/public`;

export const appApiBaseUrl = baseURL;
export const publicApiBaseUrl = publicBaseURL;

export const apiClient = axios.create({
  baseURL: appApiBaseUrl,
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
  },
});

export const publicApiClient = axios.create({
  baseURL: publicApiBaseUrl,
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
});



