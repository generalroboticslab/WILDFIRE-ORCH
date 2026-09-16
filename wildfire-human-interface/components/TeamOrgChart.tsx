"use client"

import { useMemo } from "react"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import AgentTile from "@/components/AgentTile"
import OrgChartLayout, { type ChartNode } from "@/components/OrgChartLayout"
import AgentDetailCard from "@/components/AgentDetailCard"

interface AgentData {
  type: number
  name?: string
  alive?: boolean
  mission?: string
  status_summary?: string
  percent_complete?: number
  current_phase?: string
  phase_history?: string[]
  future_phases?: string[]
  options?: Array<{ description: string }>
  option_history?: Array<{ description: string }>
  children_ids?: number[]
  children_names?: string[]
}

interface TeamOrgChartProps {
  rootAgent: AgentData
  childrenData: Record<string, AgentData>
  rootAgentId?: number
  selectedAgentId?: number | null
  onAgentSelect?: (id: number) => void
  thinkingAgentIds?: Set<number>
  destroyedAgentIds?: Set<number>
  typeOf?: (id: number) => number | null
}

const ROOT = "root"

// The in-game team chart: the manager's subtree drawn with the shared tiles.
export default function TeamOrgChart({ rootAgent, childrenData, rootAgentId, selectedAgentId, onAgentSelect, thinkingAgentIds, destroyedAgentIds, typeOf }: TeamOrgChartProps) {
  const { nodes, agents } = useMemo(() => {
    const nodes: ChartNode[] = []
    const agents = new Map<string, AgentData>()
    const visit = (agent: AgentData, id: string, parentId: string | null, guard = 0) => {
      nodes.push({ id, parentId })
      agents.set(id, agent)
      if (agent.type === -1 && agent.children_ids && guard < 20) {
        agent.children_ids.forEach((childId, idx) => {
          const child = childrenData[String(childId)]
          if (!child) return
          visit({ ...child, name: child.name || agent.children_names?.[idx] || `AGENT_${childId}` }, String(childId), id, guard + 1)
        })
      }
    }
    visit(rootAgent, ROOT, null)
    return { nodes, agents }
  }, [rootAgent, childrenData])

  if (!rootAgent) {
    return <div className="py-8 text-center text-stone-400">No team data yet</div>
  }

  return (
    <OrgChartLayout
      nodes={nodes}
      renderNode={(id) => {
        const agent = agents.get(id)!
        const numId = id === ROOT ? rootAgentId : Number(id)
        const destroyed = agent.alive === false || (numId !== undefined && destroyedAgentIds?.has(numId)) || false
        const thinking = !destroyed && numId !== undefined && (thinkingAgentIds?.has(numId) || false)
        const selected = numId !== undefined && selectedAgentId === numId
        return (
          <HoverCard openDelay={200} closeDelay={100}>
            <HoverCardTrigger asChild>
              <AgentTile
                name={agent.name || (numId !== undefined ? `AGENT_${numId}` : "?")}
                type={agent.type}
                state={destroyed ? "destroyed" : selected ? "selected" : "default"}
                progress={agent.percent_complete ?? null}
                thinking={thinking}
                className="cursor-pointer hover:shadow-sm"
                onClick={() => {
                  if (numId !== undefined) onAgentSelect?.(numId)
                }}
              />
            </HoverCardTrigger>
            <HoverCardContent side="right" className="pointer-events-none w-80">
              <AgentDetailCard agent={agent} compact typeOf={typeOf} />
            </HoverCardContent>
          </HoverCard>
        )
      }}
    />
  )
}
