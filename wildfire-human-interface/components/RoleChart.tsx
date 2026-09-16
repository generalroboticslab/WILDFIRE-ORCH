"use client"

import { useMemo } from "react"
import AgentTile from "@/components/AgentTile"
import OrgChartLayout, { type ChartNode } from "@/components/OrgChartLayout"
import { agentTypeFromName, type LevelAgents } from "@/lib/agents"
import { cn } from "@/lib/utils"

interface Player {
  name: string
  role?: string | null
}

interface HierarchyConfig {
  children?: string[]
  type?: string
  team_name?: string
}

interface RoleChartProps {
  hierarchy: Record<string, HierarchyConfig>
  agents: string[]
  managers: string[]
  players: Player[]
  currentPlayer: string
  levelAgents?: LevelAgents
  onRoleClaim: (role: string) => void
}

// The lobby's role picker: the team drawn as tiles, click one to claim it.
export default function RoleChart({ hierarchy, agents, managers, players, currentPlayer, levelAgents, onRoleClaim }: RoleChartProps) {
  const nodes = useMemo<ChartNode[]>(() => {
    const parentOf = new Map<string, string>()
    for (const [manager, config] of Object.entries(hierarchy)) {
      for (const child of config?.children || []) parentOf.set(child, manager)
    }
    const all = [...managers, ...agents]
    const depthOf = (role: string, guard = 0): number => {
      const p = parentOf.get(role)
      return p && guard < 50 ? depthOf(p, guard + 1) + 1 : 0
    }
    const maxDepth = Math.max(0, ...all.map((r) => depthOf(r)))
    return all.map((role) => {
      const parentId = parentOf.get(role) ?? null
      // Agents nobody manages sit in a row of their own at the bottom
      const orphanWorker = !parentId && !managers.includes(role)
      return { id: role, parentId, level: orphanWorker ? maxDepth + 1 : undefined }
    })
  }, [hierarchy, agents, managers])

  const claimedBy = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of players) if (p.role) m.set(p.role, p.name)
    return m
  }, [players])

  return (
    <OrgChartLayout
      nodes={nodes}
      renderNode={(role) => {
        const owner = claimedBy.get(role)
        const mine = owner === currentPlayer
        const taken = !!owner && !mine
        const type = agentTypeFromName(role, levelAgents, managers)
        return (
          <AgentTile
            name={role}
            type={type}
            state={mine ? "yours" : taken ? "taken" : "available"}
            sub={taken ? owner : undefined}
            role="button"
            tabIndex={taken ? -1 : 0}
            aria-disabled={taken}
            onClick={() => {
              if (!taken) onRoleClaim(role)
            }}
            onKeyDown={(e) => {
              if (!taken && (e.key === "Enter" || e.key === " ")) {
                e.preventDefault()
                onRoleClaim(role)
              }
            }}
            className={cn(taken ? "cursor-not-allowed" : "cursor-pointer")}
          />
        )
      }}
    />
  )
}
