"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { useRouter } from "next/navigation"
import { Eye, EyeOff } from "lucide-react"
import CreateLobbyDialog from "@/components/create-lobby-dialogue"
import QuickstartDialog from "@/components/quickstart-dialog"
import { fetchLlmConfig, type LlmConfig } from "@/lib/constants"

const API_KEY_STORAGE_KEY = "openai_api_key"

export default function Home() {
  const [lobbyId, setLobbyId] = useState("")
  const [playerName, setPlayerName] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [showApiKey, setShowApiKey] = useState(false)
  const [llmConfig, setLlmConfig] = useState<LlmConfig | null>(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showQuickstartDialog, setShowQuickstartDialog] = useState(false)
  const router = useRouter()

  // Until the server says otherwise, assume an OpenAI key is required (today's behaviour).
  const requiresApiKey = llmConfig?.requires_api_key ?? true

  // Prefill the API key from this browser's localStorage
  useEffect(() => {
    try {
      const savedKey = localStorage.getItem(API_KEY_STORAGE_KEY)
      if (savedKey) setApiKey(savedKey)
    } catch {
      // localStorage unavailable (private mode, blocked storage) — start empty
    }
  }, [])

  // Ask the server whether lobby creators need to bring their own OpenAI key
  useEffect(() => {
    let cancelled = false
    fetchLlmConfig().then((config) => {
      if (!cancelled) setLlmConfig(config)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const handleApiKeyChange = (value: string) => {
    setApiKey(value)
    try {
      localStorage.setItem(API_KEY_STORAGE_KEY, value)
    } catch {
      // localStorage unavailable — key just won't persist across reloads
    }
  }

  const handleJoinLobby = () => {
    if (lobbyId && playerName) {
      router.push(`/lobby/${lobbyId}?name=${encodeURIComponent(playerName)}`)
    }
  }

  const handleCreateLobbySuccess = (newLobbyId: string) => {
    setLobbyId(newLobbyId)
    setShowCreateDialog(false)
    router.push(`/lobby/${newLobbyId}?name=${encodeURIComponent(playerName)}`)
  }

  const canCreate = !!playerName && (!requiresApiKey || !!apiKey)

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl text-center">CREW-Wildfire</CardTitle>
          <CardDescription className="text-center">Join an existing lobby or create a new one</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="playerName" className="text-sm font-medium">
              Your Name
            </label>
            <Input
              id="playerName"
              placeholder="Enter your name"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="lobbyId" className="text-sm font-medium">
              Lobby ID
            </label>
            <Input
              id="lobbyId"
              placeholder="Enter lobby ID"
              value={lobbyId}
              onChange={(e) => setLobbyId(e.target.value.toUpperCase())}
            />
          </div>
          {requiresApiKey ? (
            <div className="space-y-2">
              <label htmlFor="apiKey" className="text-sm font-medium">
                OpenAI API Key
              </label>
              <div className="flex gap-2">
                <Input
                  id="apiKey"
                  type={showApiKey ? "text" : "password"}
                  placeholder="sk-..."
                  className="flex-1"
                  value={apiKey}
                  onChange={(e) => handleApiKeyChange(e.target.value.trim())}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9"
                  onClick={() => setShowApiKey((v) => !v)}
                  aria-label={showApiKey ? "Hide API key" : "Show API key"}
                >
                  {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-gray-500">
                Required to create a lobby (not to join). Stored only in this browser.
              </p>
            </div>
          ) : (
            <p className="text-xs text-gray-500">
              {llmConfig?.llm_provider === "local"
                ? `Using local model ${llmConfig.llm_model ?? ""}`.trim()
                : "Using the server's OpenAI key"}
              . No API key needed.
            </p>
          )}
        </CardContent>
        <CardFooter className="flex flex-col space-y-2">
          <Button className="w-full" onClick={handleJoinLobby} disabled={!lobbyId || !playerName}>
            Join Lobby
          </Button>
          <Button
            className="w-full"
            variant="default"
            onClick={() => setShowQuickstartDialog(true)}
            disabled={!canCreate}
          >
            Quickstart
          </Button>
          <Button
            className="w-full bg-transparent"
            variant="outline"
            onClick={() => setShowCreateDialog(true)}
            disabled={!canCreate}
          >
            Create New Lobby
          </Button>
        </CardFooter>
      </Card>
      <CreateLobbyDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        playerName={playerName}
        apiKey={requiresApiKey ? apiKey : ""}
        requiresApiKey={requiresApiKey}
        onSuccess={handleCreateLobbySuccess}
      />
      <QuickstartDialog
        open={showQuickstartDialog}
        onOpenChange={setShowQuickstartDialog}
        playerName={playerName}
        apiKey={requiresApiKey ? apiKey : ""}
        requiresApiKey={requiresApiKey}
        onSuccess={handleCreateLobbySuccess}
      />
    </main>
  )
}
