"use client"

import { useCallback, useEffect, useState } from "react"

const STORAGE_KEY = "openai_api_key"

// The lobby creator's OpenAI key, remembered in this browser only.
export function useApiKey(): [string, (value: string) => void] {
  const [apiKey, setApiKeyState] = useState("")

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) setApiKeyState(saved)
    } catch {
      // localStorage unavailable (private mode, blocked storage): start empty
    }
  }, [])

  const setApiKey = useCallback((value: string) => {
    const trimmed = value.trim()
    setApiKeyState(trimmed)
    try {
      localStorage.setItem(STORAGE_KEY, trimmed)
    } catch {
      // key just won't persist across reloads
    }
  }, [])

  return [apiKey, setApiKey]
}
