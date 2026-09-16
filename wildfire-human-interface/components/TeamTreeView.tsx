"use client"

import { useState } from "react"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { ChevronRight, ChevronDown, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import AgentDetailCard from "@/components/AgentDetailCard"
import { agentMeta, displayName, friendlyText } from "@/lib/agents"

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

interface TeamTreeViewProps {
  rootAgent: AgentData
  childrenData: Record<string, AgentData>
  rootAgentId?: number
  selectedAgentId?: number | null
  onAgentSelect?: (id: number) => void
  thinkingAgentIds?: Set<number>
  disableHover?: boolean
  destroyedAgentIds?: Set<number>
  typeOf?: (id: number) => number | null
}

interface TreeNodeProps {
  agent: AgentData
  agentNumId?: number
  childrenData: Record<string, AgentData>
  level: number
  isLast: boolean
  selectedAgentId?: number | null
  onAgentSelect?: (id: number) => void
  thinkingAgentIds?: Set<number>
  disableHover?: boolean
  destroyedAgentIds?: Set<number>
  typeOf?: (id: number) => number | null
}

function TreeNode({ agent, agentNumId, childrenData, level, isLast, selectedAgentId, onAgentSelect, thinkingAgentIds, disableHover, destroyedAgentIds, typeOf }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(level < 2)
  const meta = agentMeta(agent.type)
  const Icon = meta.icon
  const isManager = agent.type === -1
  const hasChildren = isManager && agent.children_ids && agent.children_ids.length > 0
  const isDestroyed = agent.alive === false || destroyedAgentIds?.has(agentNumId ?? -999) || false
  const isThinking = !isDestroyed && (thinkingAgentIds?.has(agentNumId ?? -999) || false)
  const selected = selectedAgentId != null && agentNumId === selectedAgentId
  const friendly = (t: string) => (typeOf ? friendlyText(t, typeOf) : t)

  const summary = isManager
    ? agent.current_phase
      ? friendly(agent.current_phase)
      : ""
    : agent.options?.[0]?.description
      ? friendly(agent.options[0].description)
      : ""

  const row = (
    <div
      className={cn(
        "flex-1 cursor-pointer rounded-md px-1.5 py-1 transition-colors hover:bg-muted",
        isDestroyed && "opacity-40",
        selected && "bg-brand-soft ring-1 ring-brand",
      )}
      onClick={() => {
        if (agentNumId != null) onAgentSelect?.(agentNumId)
      }}
    >
      <div className="flex items-center gap-1.5">
        <Icon className={cn("h-3.5 w-3.5 flex-shrink-0", isDestroyed ? "text-stone-400" : meta.text)} />
        <span className={cn("text-sm font-medium", isDestroyed ? "text-stone-400 line-through" : "text-foreground")}>
          {displayName(agent.name, agent.type)}
        </span>
        {isDestroyed && <span className="rounded bg-red-100 px-1 text-[10px] font-semibold text-red-600">Destroyed</span>}
        {isThinking && <Loader2 className="ml-1 h-3 w-3 animate-spin text-brand" />}
      </div>
      {!isDestroyed && summary && <div className="ml-5 max-w-[400px] truncate text-xs text-muted-foreground">{summary}</div>}
    </div>
  )

  return (
    <div className="relative">
      {level > 0 && (
        <div className="absolute bottom-0 left-0 top-0 w-4">
          <div className={cn("absolute left-1.5 top-0 w-px bg-stone-300", isLast ? "h-3.5" : "h-full")} />
          <div className="absolute left-1.5 top-3.5 h-px w-2.5 bg-stone-300" />
        </div>
      )}
      <div className={cn("relative", level > 0 && "ml-4")}>
        <div className="flex items-start gap-1 py-0.5">
          {hasChildren ? (
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="mt-1.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded text-stone-400 hover:bg-muted hover:text-stone-600"
            >
              {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </button>
          ) : (
            <div className="w-4" />
          )}
          {disableHover ? (
            row
          ) : (
            <HoverCard openDelay={300} closeDelay={100}>
              <HoverCardTrigger asChild>{row}</HoverCardTrigger>
              <HoverCardContent side="right" className="w-72">
                <AgentDetailCard agent={agent} typeOf={typeOf} />
              </HoverCardContent>
            </HoverCard>
          )}
        </div>

        {expanded && hasChildren && (
          <div className="relative">
            <div className="absolute bottom-0 left-1.5 top-0 w-px bg-stone-300" />
            {agent.children_ids!.map((childId, idx) => {
              const childData = childrenData[String(childId)]
              const childName = childData?.name || agent.children_names?.[idx] || `AGENT_${childId}`
              if (!childData) {
                return (
                  <div key={childId} className="ml-4 py-0.5 text-xs italic text-stone-400">
                    {displayName(childName, typeOf?.(childId))} · no data
                  </div>
                )
              }
              return (
                <TreeNode
                  key={childId}
                  agent={{ ...childData, name: childName }}
                  agentNumId={childId}
                  childrenData={childrenData}
                  level={level + 1}
                  isLast={idx === agent.children_ids!.length - 1}
                  selectedAgentId={selectedAgentId}
                  onAgentSelect={onAgentSelect}
                  thinkingAgentIds={thinkingAgentIds}
                  disableHover={disableHover}
                  destroyedAgentIds={destroyedAgentIds}
                  typeOf={typeOf}
                />
              )
            })}
          </div>
        )}

        {!expanded && hasChildren && (
          <div className="ml-5 text-xs italic text-stone-400">{agent.children_ids!.length} hidden</div>
        )}
      </div>
    </div>
  )
}

export default function TeamTreeView({ rootAgent, childrenData, rootAgentId, selectedAgentId, onAgentSelect, thinkingAgentIds, disableHover, destroyedAgentIds, typeOf }: TeamTreeViewProps) {
  if (!rootAgent) {
    return <div className="py-8 text-center text-stone-400">No team data yet</div>
  }

  return (
    <div className="overflow-auto p-2">
      <TreeNode
        agent={rootAgent}
        agentNumId={rootAgentId}
        childrenData={childrenData || {}}
        level={0}
        isLast
        selectedAgentId={selectedAgentId}
        onAgentSelect={onAgentSelect}
        thinkingAgentIds={thinkingAgentIds}
        disableHover={disableHover}
        destroyedAgentIds={destroyedAgentIds}
        typeOf={typeOf}
      />
    </div>
  )
}
