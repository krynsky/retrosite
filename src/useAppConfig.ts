import { useEffect, useState } from "react";
import type { AppConfig } from "./types";

export const defaultAppConfig: AppConfig = {
  mode: "local",
  canGenerateReports: true,
  canEditReports: true,
  canSubmitRequests: false,
  requestSink: "local"
};

export function normalizeAppConfig(payload: Partial<AppConfig> | null | undefined): AppConfig {
  const mode = payload?.mode === "request-only" ? "request-only" : "local";
  return {
    mode,
    canGenerateReports: payload?.canGenerateReports ?? mode === "local",
    canEditReports: payload?.canEditReports ?? mode === "local",
    canSubmitRequests: payload?.canSubmitRequests ?? mode === "request-only",
    requestSink: String(payload?.requestSink ?? "local")
  };
}

export function useAppConfig() {
  const [config, setConfig] = useState<AppConfig>(defaultAppConfig);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadConfig() {
      try {
        const response = await fetch("/api/config");
        if (!response.ok) return;
        const payload = await response.json();
        if (!cancelled) {
          setConfig(normalizeAppConfig(payload));
        }
      } catch {
        // Static-only previews should keep the local-capable defaults.
      } finally {
        if (!cancelled) {
          setLoaded(true);
        }
      }
    }

    void loadConfig();
    return () => {
      cancelled = true;
    };
  }, []);

  return { config, loaded };
}
