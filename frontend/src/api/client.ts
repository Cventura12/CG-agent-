import { useAuth } from "@clerk/clerk-react";
import axios from "axios";
import { useEffect } from "react";

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

export function useApiAuthInterceptor() {
  const { getToken } = useAuth();

  useEffect(() => {
    const interceptorId = apiClient.interceptors.request.use(async (config) => {
      const token = await getToken();
      if (token) {
        config.headers = config.headers ?? {};
        (config.headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
      } else if (config.headers) {
        delete (config.headers as Record<string, string>)["Authorization"];
      }
      return config;
    });

    return () => {
      apiClient.interceptors.request.eject(interceptorId);
    };
  }, [getToken]);
}

