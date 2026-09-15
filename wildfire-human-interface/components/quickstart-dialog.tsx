"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Loader2, Users, Flame, Truck, Zap, Plane, Crown } from "lucide-react"
import { API_BASE_URL } from "@/lib/constants"

interface QuickstartPreset {
  name: string
  description: string
  level: string
  seed?: number
  collaboration_mode: string
  communication_mode: string
  hierarchy: {
    managers: string[]
    config: Record<string, {
      children: string[]
      type: "horizontal" | "vertical"
      team_name: string
    }>
  }
  difficulty: string
  recommended_players: number
}

interface QuickstartDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  playerName: string
  apiKey: string
  // False when the server runs a local model or has its own OpenAI key configured
  requiresApiKey?: boolean
  onSuccess: (lobbyId: string) => void
}

export default function QuickstartDialog({ open, onOpenChange, playerName, apiKey, requiresApiKey = true, onSuccess }: QuickstartDialogProps) {
  const [presets, setPresets] = useState<Record<string, QuickstartPreset>>({})
  const [levels, setLevels] = useState<any>({})
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchData() {
      try {
        const [presetsRes, levelsRes] = await Promise.all([
          fetch(`${API_BASE_URL}/quickstart_presets`),
          fetch(`${API_BASE_URL}/levels`)
        ])

        const presetsData = await presetsRes.json()
        const levelsData = await levelsRes.json()

        setPresets(presetsData.presets || {})
        setLevels(levelsData.levels || {})
        setError(null)
      } catch (e) {
        console.error("Error fetching quickstart data:", e)
        setError("Failed to load presets")
      }
    }

    if (open) {
      fetchData()
      setSelectedPreset(null)
      setCreating(false)
    }
  }, [open])

  const generateAgentNames = (levelKey: string) => {
    const level = levels[levelKey]
    if (!level || !level.agents) return []

    const agentOrder = ["firefighters", "bulldozers", "drones", "helicopters"]
    const agentNames: string[] = []
    let agentId = 1

    for (const agentType of agentOrder) {
      const count = level.agents[agentType] || 0
      for (let i = 0; i < count; i++) {
        agentNames.push(`AGENT_${agentId}`)
        agentId++
      }
    }

    return agentNames
  }

  const getAgentIcon = (type: string) => {
    switch (type) {
      case "firefighters": return <Flame className="h-3 w-3" />
      case "bulldozers": return <Truck className="h-3 w-3" />
      case "drones": return <Zap className="h-3 w-3" />
      case "helicopters": return <Plane className="h-3 w-3" />
      default: return <Users className="h-3 w-3" />
    }
  }

  const handleSelectPreset = async (presetKey: string) => {
    const preset = presets[presetKey]
    if (!preset) return

    const level = levels[preset.level]
    if (!level) {
      setError(`Level "${preset.level}" not found`)
      return
    }

    if (requiresApiKey && !apiKey) {
      setError("Please enter your OpenAI API key on the home page first")
      return
    }

    setSelectedPreset(presetKey)
    setCreating(true)
    setError(null)

    try {
      const newLobbyId = Math.random().toString(36).substring(2, 8).toUpperCase()
      const agents = generateAgentNames(preset.level)

      const response = await fetch(`${API_BASE_URL}/create_lobby`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lobby_id: newLobbyId,
          creator_name: playerName,
          level: preset.level,
          seed: preset.seed ?? null,
          roles: {
            agents: agents,
            managers: preset.hierarchy.managers,
          },
          hierarchy: preset.hierarchy.config,
          communication_mode: preset.communication_mode,
          collaboration_mode: preset.collaboration_mode,
          // Only sent when the creator supplied one; the server may not need it at all
          ...(apiKey ? { openai_api_key: apiKey } : {}),
        }),
      })

      if (!response.ok) {
        let detail = "Failed to create lobby"
        try {
          const errorData = await response.json()
          if (errorData?.detail) detail = errorData.detail
        } catch {
          // Non-JSON error response — keep the generic message
        }
        throw new Error(detail)
      }

      // Brief delay for visual feedback
      setTimeout(() => {
        onSuccess(newLobbyId)
      }, 1000)

    } catch (e) {
      console.error("Error creating lobby:", e)
      setError(e instanceof Error ? e.message : "Failed to create lobby")
      setCreating(false)
      setSelectedPreset(null)
    }
  }

  const handleClose = () => {
    if (!creating) {
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl text-center">Quickstart</DialogTitle>
          <p className="text-sm text-gray-600 text-center">
            Select a preset to jump straight into the game
          </p>
        </DialogHeader>

        {creating && selectedPreset && presets[selectedPreset] && (
          <div className="flex flex-col items-center justify-center py-12 space-y-6">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <div className="text-center space-y-2">
              <h3 className="text-lg font-semibold">Creating Game</h3>
              <p className="text-sm text-gray-600">{presets[selectedPreset].name}</p>
            </div>
          </div>
        )}

        {!creating && (
          <div className="space-y-4 mt-4">
            {error && (
              <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(presets).map(([key, preset]) => {
                const level = levels[preset.level]
                const totalAgents = level?.agents
                  ? Object.values(level.agents).reduce((sum: number, count: any) => sum + count, 0)
                  : 0

                return (
                  <div
                    key={key}
                    className="border rounded-lg p-4 hover:shadow-md transition-all cursor-pointer hover:border-primary"
                    onClick={() => handleSelectPreset(key)}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-semibold">{preset.name}</h3>
                      <Badge
                        variant={
                          preset.difficulty === "Easy" ? "secondary" :
                          preset.difficulty === "Medium" ? "default" : "destructive"
                        }
                      >
                        {preset.difficulty}
                      </Badge>
                    </div>

                    <p className="text-sm text-gray-600 mb-3">{preset.description}</p>

                    <div className="space-y-2 text-xs text-gray-500">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {totalAgents} agents
                        </span>
                        <span className="flex items-center gap-1">
                          <Crown className="h-3 w-3" />
                          {preset.hierarchy.managers.length} manager{preset.hierarchy.managers.length !== 1 ? "s" : ""}
                        </span>
                      </div>

                      {level?.agents && (
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(level.agents).map(([type, count]) => (
                            count > 0 && (
                              <span key={type} className="flex items-center gap-1">
                                {getAgentIcon(type)}
                                {count}
                              </span>
                            )
                          ))}
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-1 border-t">
                        <span>
                          {preset.collaboration_mode === "human_feedback" ? "AI + Feedback" : "Human Control"}
                        </span>
                        <span>
                          {preset.recommended_players} player{preset.recommended_players !== 1 ? "s" : ""}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {Object.keys(presets).length === 0 && !error && (
              <div className="text-center py-8 text-gray-500">
                <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                Loading presets...
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
