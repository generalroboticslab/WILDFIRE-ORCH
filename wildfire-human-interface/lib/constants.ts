// Base URL of the FastAPI backend.
// In production the site is served behind the Caddy reverse proxy, which forwards /api/* to the
// backend, so a relative path works on any domain without rebuilding the image.
// For local development put NEXT_PUBLIC_API_URL=http://localhost:8000 in .env.local.
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "/api"

// Which language-model provider the server runs, and whether lobby creators must supply
// their own OpenAI API key. Mirrors the backend's GET /config.
export type LlmConfig = {
  llm_provider: "openai" | "local"
  llm_model: string | null
  requires_api_key: boolean
}

const DEFAULT_LLM_CONFIG: LlmConfig = {
  llm_provider: "openai",
  llm_model: null,
  requires_api_key: true,
}

// Falls back to "OpenAI, key required" whenever the backend cannot be reached, so the
// key prompt is never dropped by mistake.
export async function fetchLlmConfig(): Promise<LlmConfig> {
  try {
    const res = await fetch(`${API_BASE_URL}/config`)
    if (!res.ok) return DEFAULT_LLM_CONFIG
    const data = await res.json()
    return {
      llm_provider: data.llm_provider === "local" ? "local" : "openai",
      llm_model: typeof data.llm_model === "string" ? data.llm_model : null,
      requires_api_key: data.requires_api_key !== false,
    }
  } catch {
    return DEFAULT_LLM_CONFIG
  }
}
