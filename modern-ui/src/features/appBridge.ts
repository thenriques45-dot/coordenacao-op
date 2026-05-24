import { invoke } from "@tauri-apps/api/core";

export const tauriDisponivel = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export function invokeApp<T>(cmd: string, args?: Record<string, unknown>) {
  if (!tauriDisponivel) {
    return Promise.reject(new Error("Recurso disponível apenas no aplicativo desktop."));
  }
  return invoke<T>(cmd, args);
}
