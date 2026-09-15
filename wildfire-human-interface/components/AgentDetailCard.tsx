"use client"

import { Badge } from "@/components/ui/badge"
import { Crown, Flame, Truck, Camera, Plane, Users, Target, Layers, Zap } from "lucide-react"
import { cn } from "@/lib/utils"

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
}

interface AgentDetailCardProps {
  agent: AgentData
  compact?: boolean
}

const TYPE_CONFIG: Record<number, { name: string; icon: typeof Flame; color: string }> = {
  [-1]: { name: "Manager", icon: Crown, color: "text-blue-600" },
  0: { name: "Firefighter", icon: Flame, color: "text-red-500" },
  1: { name: "Bulldozer", icon: Truck, color: "text-yellow-600" },
  2: { name: "Drone", icon: Camera, color: "text-purple-500" },
  3: { name: "Helicopter", icon: Plane, color: "text-cyan-500" },
}

export default function AgentDetailCard({ agent, compact = false }: AgentDetailCardProps) {
  const config = TYPE_CONFIG[agent.type] ?? { name: "Unknown", icon: Users, color: "text-gray-500" }
  const TypeIcon = config.icon
  const isManager = agent.type === -1

  return (
    <div className={cn("space-y-2", compact ? "text-xs" : "text-sm")}>
      {/* Header: Icon + Name + Type Badge */}
      <div className="flex items-center gap-2">
        <TypeIcon className={cn("flex-shrink-0", config.color, compact ? "h-4 w-4" : "h-5 w-5")} />
        <span className="font-semibold truncate">{agent.name || "Unknown Agent"}</span>
        <Badge variant={isManager ? "default" : "secondary"} className="text-xs flex-shrink-0">
          {config.name}
        </Badge>
      </div>

      {agent.alive === false && (
        <div className="bg-red-50 border border-red-300 rounded-lg p-3 text-center">
          <span className="text-red-700 font-semibold text-xs">AGENT DESTROYED — No longer operational</span>
        </div>
      )}

      {agent.alive !== false && (
        <>
          {/* Mission Section */}
          {agent.mission && (
            <div className="bg-green-50 border border-green-200 rounded p-2">
              <div className="flex items-center gap-1 text-green-700 font-medium mb-1">
                <Target className="h-3 w-3" />
                <span>Mission</span>
              </div>
              <p className={cn("text-gray-700 text-xs leading-relaxed", compact && "line-clamp-2")}>{agent.mission}</p>

              {/* Progress Bar */}
              {agent.percent_complete !== undefined && agent.percent_complete !== null && (
                <div className="mt-2">
                  <div className="flex justify-between text-xs mb-0.5">
                    <span className="text-gray-500">Progress</span>
                    <span className="text-green-700 font-medium">{Math.round(agent.percent_complete)}%</span>
                  </div>
                  <div className="w-full bg-green-200 rounded-full h-1.5">
                    <div
                      className="bg-green-600 h-1.5 rounded-full transition-all"
                      style={{ width: `${Math.min(agent.percent_complete, 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Phases (vertical Managers) or Options (Workers) */}
          {isManager && agent.current_phase ? (
            // Phase Display for vertical managers (those with an active phase)
            <div className="bg-purple-50 border border-purple-200 rounded p-2">
              <div className="flex items-center gap-1 text-purple-700 font-medium mb-1">
                <Layers className="h-3 w-3" />
                <span>Phases</span>
              </div>

              <div className="space-y-1">
                {/* Past phases */}
                {agent.phase_history && agent.phase_history.length > 0 && (
                  <div className={cn("text-xs text-gray-400", compact && "truncate")}>
                    Past: {agent.phase_history.slice(-2).join(" → ")}
                  </div>
                )}
                {/* Current */}
                <div className="flex items-center gap-1">
                  <span className="text-xs text-gray-500">Current:</span>
                  <Badge className={cn("bg-purple-600 text-white text-xs whitespace-normal text-left", compact && "line-clamp-2 max-w-[180px]")}>{agent.current_phase}</Badge>
                </div>
                {/* Future phases */}
                {agent.future_phases && agent.future_phases.length > 0 && (
                  <div className={cn("text-xs text-gray-400", compact && "truncate")}>
                    Next: {agent.future_phases.slice(0, 2).join(" → ")}
                  </div>
                )}
              </div>
            </div>
          ) : !isManager ? (
            // Option Display for Workers
            <div className="bg-indigo-50 border border-indigo-200 rounded p-2">
              <div className="flex items-center gap-1 text-indigo-700 font-medium mb-1">
                <Zap className="h-3 w-3" />
                <span>Actions</span>
              </div>

              {agent.options && agent.options.length > 0 ? (
                <div className="space-y-1">
                  {/* Past options */}
                  {agent.option_history && agent.option_history.length > 0 && (
                    <div className={cn("text-xs text-gray-400", compact && "truncate")}>
                      Past: {agent.option_history.slice(-2).map(o => o.description).join(" → ")}
                    </div>
                  )}
                  {/* Current */}
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-gray-500">Current:</span>
                    <Badge className={cn("bg-indigo-600 text-white text-xs whitespace-normal text-left", compact && "line-clamp-2")}>
                      {agent.options[0]?.description || "No action"}
                    </Badge>
                  </div>
                  {/* Future options */}
                  {agent.options.length > 1 && (
                    <div className={cn("text-xs text-gray-400", compact && "truncate")}>
                      Next: {agent.options.slice(1, 3).map(o => o.description).join(" → ")}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-gray-400 italic">No action information</p>
              )}
            </div>
          ) : null}

          {/* Status Summary */}
          {agent.status_summary && !compact && (
            <p className="text-xs text-gray-500 italic border-t pt-1">{agent.status_summary}</p>
          )}
        </>
      )}
    </div>
  )
}
