"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { Crown, Flame, Truck, Camera, Plane, Users, ChevronRight, ChevronDown, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
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

interface TeamTreeViewProps {
  rootAgent: AgentData
  childrenData: Record<string, AgentData>
  rootAgentId?: number
  selectedAgentId?: number | null
  onAgentSelect?: (id: number) => void
  thinkingAgentIds?: Set<number>
  disableHover?: boolean
  destroyedAgentIds?: Set<number>
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
}

const TYPE_CONFIG: Record<number, { name: string; icon: typeof Flame; color: string }> = {
  [-1]: { name: "Manager", icon: Crown, color: "text-blue-600" },
  0: { name: "Firefighter", icon: Flame, color: "text-red-500" },
  1: { name: "Bulldozer", icon: Truck, color: "text-yellow-600" },
  2: { name: "Drone", icon: Camera, color: "text-purple-500" },
  3: { name: "Helicopter", icon: Plane, color: "text-cyan-500" },
}

function TreeNode({ agent, agentNumId, childrenData, level, isLast, selectedAgentId, onAgentSelect, thinkingAgentIds, disableHover, destroyedAgentIds }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(level < 2) // Auto-expand first 2 levels
  const config = TYPE_CONFIG[agent.type] ?? { name: "Unknown", icon: Users, color: "text-gray-500" }
  const TypeIcon = config.icon
  const isManager = agent.type === -1
  const hasChildren = isManager && agent.children_ids && agent.children_ids.length > 0
  const isDestroyed = agent.alive === false || destroyedAgentIds?.has(agentNumId ?? -999) || false
  const isThinking = !isDestroyed && (thinkingAgentIds?.has(agentNumId ?? -999) || false)

  // Get current action/phase summary
  const summary = isManager
    ? agent.current_phase ? `Phase: ${agent.current_phase}` : ""
    : agent.options?.[0]?.description ? `Current: ${agent.options[0].description}` : ""

  const agentRowContent = (
    <div
      className={`flex-1 hover:bg-gray-50 rounded px-1 py-0.5 cursor-pointer transition-colors ${
        isDestroyed ? 'opacity-40' : ''
      } ${
        selectedAgentId != null && agentNumId === selectedAgentId ? 'ring-2 ring-blue-500 bg-blue-50' : ''
      }`}
      onClick={() => { if (agentNumId != null) onAgentSelect?.(agentNumId) }}
    >
      <div className="flex items-center gap-1.5">
        <TypeIcon className={cn("h-3.5 w-3.5 flex-shrink-0", isDestroyed ? "text-gray-400" : config.color)} />
        <span className={cn("font-medium text-sm", isDestroyed ? "text-gray-400 line-through" : "text-gray-800")}>{agent.name || "Unknown"}</span>
        <Badge
          variant={isManager ? "default" : "secondary"}
          className="text-[10px] px-1 py-0 h-4"
        >
          {config.name}
        </Badge>
        {isDestroyed && <span className="text-[10px] font-bold text-red-600 bg-red-100 px-1 py-0 rounded h-4 inline-flex items-center">DESTROYED</span>}
        {!isDestroyed && isThinking && (
          <Loader2 className="h-3 w-3 ml-1 animate-spin text-blue-500" />
        )}
      </div>

      {/* Inline Summary */}
      {!isDestroyed && summary && (
        <div className="text-xs text-gray-500 ml-5 max-w-[400px]">
          {summary}
        </div>
      )}
    </div>
  )

  return (
    <div className="relative">
      {/* Tree line connector */}
      {level > 0 && (
        <div className="absolute left-0 top-0 bottom-0 w-4">
          {/* Vertical line */}
          <div
            className={cn(
              "absolute left-1.5 top-0 w-px bg-gray-300",
              isLast ? "h-3" : "h-full"
            )}
          />
          {/* Horizontal line */}
          <div className="absolute left-1.5 top-3 w-2.5 h-px bg-gray-300" />
        </div>
      )}

      <div className={cn("relative", level > 0 && "ml-4")}>
        {/* Agent Row */}
        <div className="flex items-start gap-1 py-0.5">
          {/* Expand/Collapse Button */}
          {hasChildren ? (
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex-shrink-0 w-4 h-4 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
            >
              {expanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
            </button>
          ) : (
            <div className="w-4" /> // Spacer
          )}

          {/* Agent Info — with hover card or plain div depending on disableHover */}
          {disableHover ? (
            agentRowContent
          ) : (
            <HoverCard openDelay={300} closeDelay={100}>
              <HoverCardTrigger asChild>
                {agentRowContent}
              </HoverCardTrigger>
              <HoverCardContent side="right" className="w-72">
                <AgentDetailCard agent={agent} />
              </HoverCardContent>
            </HoverCard>
          )}
        </div>

        {/* Children (recursive) */}
        {expanded && hasChildren && (
          <div className="relative">
            {/* Continuing vertical line */}
            <div className="absolute left-1.5 top-0 bottom-0 w-px bg-gray-300" />

            {agent.children_ids!.map((childId, idx) => {
              const childData = childrenData[String(childId)]
              const childName = childData.name || agent.children_names?.[idx] || `AGENT_${childId}`
              const isChildLast = idx === agent.children_ids!.length - 1

              if (!childData) {
                return (
                  <div key={childId} className="ml-4 py-0.5 text-xs text-gray-400 italic">
                    {childName} - Data not available
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
                  isLast={isChildLast}
                  selectedAgentId={selectedAgentId}
                  onAgentSelect={onAgentSelect}
                  thinkingAgentIds={thinkingAgentIds}
                  disableHover={disableHover}
                  destroyedAgentIds={destroyedAgentIds}
                />
              )
            })}
          </div>
        )}

        {/* Collapsed children indicator */}
        {!expanded && hasChildren && (
          <div className="ml-5 text-xs text-gray-400 italic">
            ({agent.children_ids!.length} children hidden)
          </div>
        )}
      </div>
    </div>
  )
}

export default function TeamTreeView({ rootAgent, childrenData, rootAgentId, selectedAgentId, onAgentSelect, thinkingAgentIds, disableHover, destroyedAgentIds }: TeamTreeViewProps) {
  if (!rootAgent) {
    return (
      <div className="text-center text-gray-400 py-8">
        No team hierarchy data
      </div>
    )
  }

  return (
    <div className="p-2 overflow-auto">
      <TreeNode
        agent={rootAgent}
        agentNumId={rootAgentId}
        childrenData={childrenData || {}}
        level={0}
        isLast={true}
        selectedAgentId={selectedAgentId}
        onAgentSelect={onAgentSelect}
        thinkingAgentIds={thinkingAgentIds}
        disableHover={disableHover}
        destroyedAgentIds={destroyedAgentIds}
      />
    </div>
  )
}
