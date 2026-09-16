"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import EntryShell from "@/components/EntryShell"
import CreateLobbyDialog from "@/components/create-lobby-dialogue"
import QuickstartDialog from "@/components/quickstart-dialog"
import { fetchLlmConfig, type LlmConfig } from "@/lib/constants"

export default function Home() {
  const [lobbyId, setLobbyId] = useState("")
  const [playerName, setPlayerName] = useState("")
  const [llmConfig, setLlmConfig] = useState<LlmConfig | null>(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showQuickstartDialog, setShowQuickstartDialog] = useState(false)
  const router = useRouter()

  // Until the server says otherwise, assume an OpenAI key is required.
  const requiresApiKey = llmConfig?.requires_api_key ?? true

  useEffect(() => {
    let cancelled = false
    fetchLlmConfig().then((config) => {
      if (!cancelled) setLlmConfig(config)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const name = playerName.trim()
  const code = lobbyId.trim()

  const goToLobby = (id: string) => {
    router.push(`/lobby/${id}?name=${encodeURIComponent(name)}`)
  }

  const handleJoin = () => {
    if (name && code) goToLobby(code)
  }

  return (
    <EntryShell width="max-w-[640px]">
      <div>
        <h1 className="text-2xl font-semibold leading-8">CREW-Wildfire</h1>
        <p className="mt-1 text-sm text-muted-foreground">Fight a wildfire alongside a team of AI agents.</p>
      </div>

      <div className="mt-6 space-y-2">
        <label htmlFor="playerName" className="text-sm font-medium">
          Your name
        </label>
        <Input
          id="playerName"
          autoFocus
          autoComplete="off"
          placeholder="Enter your name"
          value={playerName}
          onChange={(e) => setPlayerName(e.target.value)}
        />
      </div>

      <div className="my-6 h-px bg-border" />

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="flex flex-col gap-2.5">
          <div className="text-sm font-semibold">Start a game</div>
          <Button variant="outline" className="w-full" disabled={!name} onClick={() => setShowCreateDialog(true)}>
            Custom setup
          </Button>
          <Button className="w-full" disabled={!name} onClick={() => setShowQuickstartDialog(true)}>
            Quickstart
          </Button>
        </div>
        <div className="flex flex-col gap-2.5">
          <div className="text-sm font-semibold">Join a game</div>
          <Input
            id="lobbyId"
            placeholder="Lobby code"
            autoComplete="off"
            maxLength={8}
            className="font-mono uppercase tracking-[.08em] placeholder:normal-case placeholder:tracking-normal placeholder:font-sans"
            value={lobbyId}
            onChange={(e) => setLobbyId(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleJoin()
            }}
          />
          <Button className="w-full" disabled={!name || !code} onClick={handleJoin}>
            Join
          </Button>
        </div>
      </div>

      <CreateLobbyDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        playerName={name}
        requiresApiKey={requiresApiKey}
        onSuccess={goToLobby}
      />
      <QuickstartDialog
        open={showQuickstartDialog}
        onOpenChange={setShowQuickstartDialog}
        playerName={name}
        requiresApiKey={requiresApiKey}
        llmModel={llmConfig?.llm_provider === "local" ? llmConfig.llm_model : null}
        onSuccess={goToLobby}
      />
    </EntryShell>
  )
}
