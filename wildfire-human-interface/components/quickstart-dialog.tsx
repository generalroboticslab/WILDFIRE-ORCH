"use client"

import { useEffect, useMemo, useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Segmented } from "@/components/ui/segmented"
import ApiKeyField from "@/components/ApiKeyField"
import { useApiKey } from "@/hooks/use-api-key"
import { API_BASE_URL } from "@/lib/constants"
import { AGENT_TYPES, WORKER_TYPE_ORDER, countOfType, workerNames, type LevelAgents } from "@/lib/agents"
import { cn } from "@/lib/utils"

interface QuickstartPreset {
  name: string
  description: string
  level: string
  seed?: number
  collaboration_mode: string
  communication_mode: string
  hierarchy: {
    managers: string[]
    config: Record<string, { children: string[]; type: "horizontal" | "vertical"; team_name: string }>
  }
  difficulty: string
  recommended_players: number
}

interface Variant {
  key: string
  label: string
}

// One card: a single preset, or a family of seed variants ("special_drone_lost_1..5")
interface PresetGroup {
  id: string
  name: string
  description: string
  level: string
  difficulty: string
  players: number
  mode: string
  variants: Variant[]
}

interface QuickstartDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  playerName: string
  // False when the server runs a local model or has its own OpenAI key configured
  requiresApiKey?: boolean
  llmModel?: string | null
  onSuccess: (lobbyId: string) => void
}

const baseName = (name: string) => name.replace(/\s*\(Seed\s*\d+\)\s*$/i, "")

// Seed variants of one scenario share a key stem ("special_drone_lost_1..5"), the same level
// and the same name apart from "(Seed N)". Anything else stays its own card.
function groupPresets(presets: Record<string, QuickstartPreset>): { presets: PresetGroup[]; special: PresetGroup[] } {
  const stems = new Map<string, string[]>()
  for (const key of Object.keys(presets)) {
    const stem = key.replace(/_\d+$/, "")
    if (!stems.has(stem)) stems.set(stem, [])
    stems.get(stem)!.push(key)
  }
  const isVariantFamily = (members: string[]) => {
    if (members.length < 2) return false
    const first = presets[members[0]]
    return members.every((k) => presets[k].level === first.level && baseName(presets[k].name || "") === baseName(first.name || ""))
  }
  const groups: PresetGroup[] = []
  const seen = new Set<string>()
  for (const key of Object.keys(presets)) {
    const stem = key.replace(/_\d+$/, "")
    const members = stems.get(stem)!
    const isFamily = /_\d+$/.test(key) && isVariantFamily(members)
    const id = isFamily ? stem : key
    if (seen.has(id)) continue
    seen.add(id)
    const first = presets[isFamily ? members[0] : key]
    const variants: Variant[] = isFamily
      ? members
          .map((k) => ({ key: k, n: parseInt(k.match(/_(\d+)$/)![1], 10) }))
          .sort((a, b) => a.n - b.n)
          .map((v) => ({ key: v.key, label: String(v.n) }))
      : [{ key, label: "" }]
    groups.push({
      id,
      name: baseName(first.name || id).replace(/^Special:\s*/i, ""),
      description: first.description || "",
      level: first.level,
      difficulty: first.difficulty || "",
      players: first.recommended_players || 1,
      mode: first.collaboration_mode,
      variants,
    })
  }
  return {
    presets: groups.filter((g) => !g.id.startsWith("special_")),
    special: groups.filter((g) => g.id.startsWith("special_")),
  }
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

function Difficulty({ level }: { level: string }) {
  const color = level === "Easy" ? "bg-green-500" : level === "Medium" ? "bg-amber-500" : level === "Hard" ? "bg-red-600" : "bg-stone-400"
  if (!level) return null
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={cn("h-2 w-2 rounded-full", color)} />
      {level}
    </span>
  )
}

export default function QuickstartDialog({ open, onOpenChange, playerName, requiresApiKey = true, llmModel, onSuccess }: QuickstartDialogProps) {
  const [presets, setPresets] = useState<Record<string, QuickstartPreset>>({})
  const [levels, setLevels] = useState<Record<string, any>>({})
  const [seedChoice, setSeedChoice] = useState<Record<string, string>>({})
  const [creating, setCreating] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [apiKey, setApiKey] = useApiKey()

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setCreating(null)
    Promise.all([fetch(`${API_BASE_URL}/quickstart_presets`), fetch(`${API_BASE_URL}/levels`)])
      .then(async ([presetsRes, levelsRes]) => {
        const presetsData = await presetsRes.json()
        const levelsData = await levelsRes.json()
        if (cancelled) return
        setPresets(presetsData.presets || {})
        setLevels(levelsData.levels || {})
      })
      .catch(() => {
        if (!cancelled) setError("Could not load the presets. Check that the server is running.")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open])

  const groups = useMemo(() => groupPresets(presets), [presets])

  const start = async (group: PresetGroup) => {
    const variant = group.variants.length > 1 ? seedChoice[group.id] || group.variants[0].key : group.variants[0].key
    const preset = presets[variant]
    if (!preset) return
    const level = levels[preset.level]
    if (!level) {
      setError(`Level "${preset.level}" is not available on this server.`)
      return
    }
    if (requiresApiKey && !apiKey) {
      setError("Enter your OpenAI API key first.")
      return
    }
    setCreating(group.id)
    setError(null)
    try {
      const newLobbyId = Math.random().toString(36).substring(2, 8).toUpperCase()
      const response = await fetch(`${API_BASE_URL}/create_lobby`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lobby_id: newLobbyId,
          creator_name: playerName,
          level: preset.level,
          seed: preset.seed ?? null,
          roles: { agents: workerNames(level.agents), managers: preset.hierarchy.managers },
          hierarchy: preset.hierarchy.config,
          communication_mode: preset.communication_mode,
          collaboration_mode: preset.collaboration_mode,
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the lobby.")
      setCreating(null)
    }
  }

  const renderCard = (group: PresetGroup) => {
    const level = levels[group.level]
    const busy = creating === group.id
    return (
      <div key={group.id} className="flex flex-col gap-2 rounded-lg border bg-card p-3 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold">{group.name}</span>
          <Difficulty level={group.difficulty} />
        </div>
        <p className="line-clamp-2 text-xs text-muted-foreground">{group.description}</p>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <Composition agents={level?.agents} />
          <div className="flex items-center gap-2">
            {group.variants.length > 1 && (
              <span className="inline-flex items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground">Seed</span>
                <Segmented
                  aria-label="Seed"
                  value={seedChoice[group.id] || group.variants[0].key}
                  onChange={(v) => setSeedChoice((prev) => ({ ...prev, [group.id]: v }))}
                  options={group.variants.map((v) => ({ value: v.key, label: v.label }))}
                />
              </span>
            )}
            <Button size="sm" className="h-7 px-3 text-xs" disabled={!!creating} onClick={() => start(group)}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Start"}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !creating && onOpenChange(o)}>
      <DialogContent className="flex max-h-[90vh] max-w-[880px] flex-col gap-4 overflow-hidden">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">Quickstart</DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between gap-3 rounded-lg bg-muted px-3 py-2.5">
          <span className="text-[13px] text-stone-700">
            {requiresApiKey
              ? "Every game below plays with an AI team you can guide in chat."
              : llmModel
                ? `Games run on the server's local model (${llmModel}).`
                : "Games run on the server's OpenAI key."}
          </span>
          {requiresApiKey && <ApiKeyField compact value={apiKey} onChange={setApiKey} />}
        </div>

        {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        <div className="-mr-2 flex min-h-0 flex-col gap-3 overflow-y-auto pr-2">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading presets
            </div>
          )}
          {!loading && groups.presets.length > 0 && (
            <>
              <div className="text-[13px] font-semibold">Presets</div>
              <div className="grid gap-3 sm:grid-cols-2">{groups.presets.map(renderCard)}</div>
            </>
          )}
          {!loading && groups.special.length > 0 && (
            <>
              <div className="mt-1 text-[13px] font-semibold">
                Special events <span className="font-normal text-muted-foreground">· something changes mid-game</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">{groups.special.map(renderCard)}</div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
