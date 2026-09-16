"use client"

import { useEffect, useMemo, useState } from "react"
import { Loader2, Shuffle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import ApiKeyField from "@/components/ApiKeyField"
import TeamBuilder, { compositionText, createRootTeam, validateTeam, type TeamState } from "@/components/TeamBuilder"
import { useApiKey } from "@/hooks/use-api-key"
import { API_BASE_URL } from "@/lib/constants"
import { AGENT_TYPES, WORKER_TYPE_ORDER, countOfType, displayName, workerNames, type LevelAgents } from "@/lib/agents"
import { cn } from "@/lib/utils"

const COLLABORATION_MODES = [
  { value: "human_feedback", name: "Human feedback", description: "The AI runs the team. You guide it in chat." },
  { value: "human_control", name: "Human control", description: "You choose your agent's actions each step." },
] as const

// Levels with scripted mid-game events
const SPECIAL_LEVEL_KEYS = new Set([
  "Scout_Fire_Drone_Lost",
  "Transport_Helicopter_Down",
  "Rescue_Civilians_Surprise",
  "Suppress_Fire_Extinguish_Second_Fire",
  "Suppress_Fire_Contain_Water_Source",
  "Suppress_Fire_Extinguish_Rapid_Growth",
])

const CATEGORY_ORDER = [
  { prefix: "Demo", name: "Demo" },
  { prefix: "Cut_Trees", name: "Cut trees" },
  { prefix: "Scout_Fire", name: "Scout fire" },
  { prefix: "Transport_Firefighters", name: "Transport firefighters" },
  { prefix: "Rescue_Civilians", name: "Rescue civilians" },
  { prefix: "Suppress_Fire", name: "Suppress fire" },
  { prefix: "Scale_Level", name: "Scale" },
  { prefix: "Full_Game", name: "Full game" },
  { prefix: "VLM", name: "VLM" },
]

interface LevelInfo {
  name?: string
  description?: string
  map_size?: number
  max_steps?: number
  agents?: LevelAgents
}

interface CreateLobbyDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  playerName: string
  // False when the server runs a local model or has its own OpenAI key configured
  requiresApiKey?: boolean
  onSuccess: (lobbyId: string) => void
}

function groupLevels(levels: Record<string, LevelInfo>): { name: string; keys: string[] }[] {
  const groups: Record<string, string[]> = {}
  const special: string[] = []
  for (const key of Object.keys(levels)) {
    if (SPECIAL_LEVEL_KEYS.has(key)) {
      special.push(key)
      continue
    }
    const category = CATEGORY_ORDER.find((c) => key.startsWith(c.prefix))?.name || "Other"
    ;(groups[category] ||= []).push(key)
  }
  const ordered = CATEGORY_ORDER.filter((c) => groups[c.name]?.length).map((c) => ({ name: c.name, keys: groups[c.name] }))
  if (special.length) ordered.push({ name: "Special events", keys: special })
  if (groups["Other"]?.length) ordered.push({ name: "Other", keys: groups["Other"] })
  return ordered
}

function difficultyOf(level?: LevelInfo): "Easy" | "Medium" | "Hard" {
  const total = level?.agents ? Object.values(level.agents).reduce((s, n) => s + (n || 0), 0) : 0
  const complexity = total + (level?.map_size || 50) / 50 + (level?.max_steps || 30) / 30
  return complexity <= 6 ? "Easy" : complexity <= 12 ? "Medium" : "Hard"
}

function Composition({ agents }: { agents?: LevelAgents }) {
  if (!agents) return null
  return (
    <div className="flex items-center gap-2.5">
      {WORKER_TYPE_ORDER.map((type) => {
        const meta = AGENT_TYPES[type]
        const n = countOfType(agents, type)
        if (!n) return null
        const Icon = meta.icon
        return (
          <span key={type} className="inline-flex items-center gap-1 text-xs text-stone-700" title={`${n} ${meta.plural}`}>
            <Icon className={cn("h-[13px] w-[13px]", meta.text)} />
            {n}
          </span>
        )
      })}
    </div>
  )
}

export default function CreateLobbyDialog({ open, onOpenChange, playerName, requiresApiKey = true, onSuccess }: CreateLobbyDialogProps) {
  const [step, setStep] = useState<1 | 2>(1)
  const [levels, setLevels] = useState<Record<string, LevelInfo>>({})
  const [selectedLevel, setSelectedLevel] = useState("")
  const [seed, setSeed] = useState("")
  const [collaborationMode, setCollaborationMode] = useState<string>("human_feedback")
  const [team, setTeam] = useState<TeamState>({ managers: [], hierarchy: {}, managerConfigs: {} })
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [apiKey, setApiKey] = useApiKey()

  useEffect(() => {
    if (!open) return
    let cancelled = false
    fetch(`${API_BASE_URL}/levels`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setLevels(data.levels || {})
      })
      .catch(() => {
        if (!cancelled) setError("Could not load the levels. Check that the server is running.")
      })
    return () => {
      cancelled = true
    }
  }, [open])

  const level = selectedLevel ? levels[selectedLevel] : undefined
  const levelAgents: LevelAgents = level?.agents || { firefighters: 0, bulldozers: 0, drones: 0, helicopters: 0 }
  const agents = useMemo(() => workerNames(level?.agents), [level])
  const groups = useMemo(() => groupLevels(levels), [levels])
  const validation = validateTeam(agents, team)

  const reset = () => {
    setStep(1)
    setSelectedLevel("")
    setSeed("")
    setCollaborationMode("human_feedback")
    setTeam({ managers: [], hierarchy: {}, managerConfigs: {} })
    setCreating(false)
    setError(null)
  }

  const handleClose = (o: boolean) => {
    if (creating) return
    onOpenChange(o)
    if (!o) reset()
  }

  const selectLevel = (key: string) => {
    setSelectedLevel(key)
    setTeam({ managers: [], hierarchy: {}, managerConfigs: {} })
  }

  const goToTeam = () => {
    // The root manager is created for you; every other manager goes under it.
    if (team.managers.length === 0) setTeam(createRootTeam(agents))
    setError(null)
    setStep(2)
  }

  const handleCreate = async () => {
    if (!selectedLevel || !playerName || !validation.ok) return
    if (requiresApiKey && !apiKey) {
      setError("Enter your OpenAI API key on the previous step.")
      return
    }
    setCreating(true)
    setError(null)
    try {
      const newLobbyId = Math.random().toString(36).substring(2, 8).toUpperCase()
      const hierarchy: Record<string, { children: string[]; type: string; team_name: string }> = {}
      for (const manager of team.managers) {
        const config = team.managerConfigs[manager] || { type: "vertical", team_name: `Team ${manager}` }
        hierarchy[manager] = { children: team.hierarchy[manager] || [], type: config.type, team_name: config.team_name }
      }
      const response = await fetch(`${API_BASE_URL}/create_lobby`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lobby_id: newLobbyId,
          creator_name: playerName,
          level: selectedLevel,
          seed: seed ? parseInt(seed, 10) : null,
          roles: { agents, managers: team.managers },
          hierarchy,
          communication_mode: "team_chat",
          collaboration_mode: collaborationMode,
          // Only sent when the server asks for one (a stale saved key must not be validated otherwise)
          ...(requiresApiKey && apiKey ? { openai_api_key: apiKey } : {}),
        }),
      })
      if (!response.ok) {
        let detail = "Could not create the lobby."
        try {
          const errorData = await response.json()
          if (errorData?.detail) detail = errorData.detail
        } catch {
          // Non-JSON error response: keep the generic message
        }
        throw new Error(detail)
      }
      onSuccess(newLobbyId)
      reset()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the lobby.")
      setCreating(false)
    }
  }

  const statusLine = () => {
    if (validation.unassigned.length > 0) {
      const n = validation.unassigned.length
      return { color: "bg-amber-500", text: `${n} agent${n === 1 ? "" : "s"} still unassigned` }
    }
    if (validation.emptyManagers.length > 0) {
      const names = validation.emptyManagers.map((m) => displayName(m, -1)).join(", ")
      return { color: "bg-amber-500", text: `${names} ${validation.emptyManagers.length === 1 ? "has" : "have"} no members` }
    }
    return { color: "bg-green-500", text: "Everyone is on the team" }
  }
  const status = statusLine()

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="flex max-h-[92vh] max-w-[1000px] flex-col gap-4 overflow-hidden">
        <DialogHeader>
          <div className="flex items-baseline justify-between gap-3 pr-6">
            <DialogTitle className="text-lg font-semibold">Custom setup</DialogTitle>
            <span className="text-[13px] text-muted-foreground">Step {step} of 2 · {step === 1 ? "Level and mode" : "Team"}</span>
          </div>
        </DialogHeader>

        {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        {step === 1 && (
          <div className="grid min-h-0 gap-5 md:grid-cols-[380px_minmax(0,1fr)]">
            {/* Level list */}
            <div className="max-h-[560px] overflow-y-auto rounded-lg border p-1.5">
              {groups.length === 0 && (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading levels
                </div>
              )}
              {groups.map((group) => (
                <div key={group.name} className="flex flex-col gap-0.5">
                  <div className="px-2.5 pb-0.5 pt-2 text-[11px] font-semibold uppercase tracking-[.06em] text-muted-foreground">{group.name}</div>
                  {group.keys.map((key) => {
                    const info = levels[key]
                    const active = key === selectedLevel
                    const diff = difficultyOf(info)
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => selectLevel(key)}
                        className={cn(
                          "flex w-full items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-left transition-colors",
                          active ? "border-brand bg-brand-soft" : "border-transparent hover:bg-muted",
                        )}
                      >
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate text-[13px] font-medium leading-[18px]">{info?.name || key}</span>
                          <span className="text-[11px] leading-[14px] text-muted-foreground">
                            {compositionText(info?.agents)} · {info?.map_size}×{info?.map_size} · {info?.max_steps} steps
                          </span>
                        </span>
                        <span
                          title={diff}
                          className={cn("h-2 w-2 flex-shrink-0 rounded-full", diff === "Easy" ? "bg-green-500" : diff === "Medium" ? "bg-amber-500" : "bg-red-600")}
                        />
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>

            {/* Details, seed, mode, key */}
            <div className="flex min-w-0 flex-col gap-4">
              <div className="flex flex-col gap-2 rounded-lg border bg-background px-4 py-3.5">
                {level ? (
                  <>
                    <div className="text-base font-semibold leading-[22px]">{level.name || selectedLevel}</div>
                    <div className="text-[13px] leading-[18px] text-stone-700">{level.description || "No description."}</div>
                    <div className="mt-0.5 flex items-center gap-3.5">
                      <Composition agents={level.agents} />
                      <span className="text-xs text-muted-foreground">
                        {level.map_size}×{level.map_size} map · {level.max_steps} steps
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="py-2 text-[13px] text-muted-foreground">Pick a level on the left.</div>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <label htmlFor="seed" className="text-sm font-medium">
                  Seed
                </label>
                <div className="flex gap-2">
                  <Input
                    id="seed"
                    type="number"
                    placeholder="Random"
                    className="font-mono"
                    value={seed}
                    onChange={(e) => setSeed(e.target.value)}
                  />
                  <Button type="button" variant="outline" onClick={() => setSeed(Math.floor(Math.random() * 10000).toString())}>
                    <Shuffle className="h-4 w-4" /> Random
                  </Button>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">Collaboration mode</span>
                <div className="flex gap-2.5">
                  {COLLABORATION_MODES.map((mode) => {
                    const active = collaborationMode === mode.value
                    return (
                      <button
                        key={mode.value}
                        type="button"
                        onClick={() => setCollaborationMode(mode.value)}
                        className={cn(
                          "flex flex-1 gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors",
                          active ? "border-brand bg-brand-soft" : "hover:bg-muted",
                        )}
                      >
                        <span
                          className={cn("mt-0.5 h-4 w-4 flex-shrink-0 rounded-full border", active ? "border-[5px] border-brand" : "border-stone-400")}
                        />
                        <span className="flex flex-col gap-0.5">
                          <span className="text-[13px] font-semibold leading-[18px]">{mode.name}</span>
                          <span className="text-xs leading-4 text-muted-foreground">{mode.description}</span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {requiresApiKey && <ApiKeyField value={apiKey} onChange={setApiKey} />}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="flex min-h-0 flex-col gap-3 overflow-y-auto">
            <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
              {level?.name || selectedLevel} · {COLLABORATION_MODES.find((m) => m.value === collaborationMode)?.name} ·{" "}
              <Composition agents={level?.agents} />
            </div>
            <TeamBuilder agents={agents} levelAgents={levelAgents} team={team} onChange={setTeam} />
          </div>
        )}

        <div className="flex items-center justify-between gap-3 border-t pt-4">
          {step === 1 ? (
            <>
              <Button type="button" variant="ghost" onClick={() => handleClose(false)}>
                Cancel
              </Button>
              <Button type="button" disabled={!selectedLevel} onClick={goToTeam}>
                Next: Team
              </Button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-4">
                <Button type="button" variant="outline" onClick={() => setStep(1)} disabled={creating}>
                  Back
                </Button>
                <span className="inline-flex items-center gap-1.5 text-xs text-stone-700">
                  <span className={cn("h-2 w-2 rounded-full", status.color)} />
                  {status.text}
                </span>
              </div>
              <Button type="button" disabled={!validation.ok || creating} onClick={handleCreate}>
                {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                Create lobby
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
