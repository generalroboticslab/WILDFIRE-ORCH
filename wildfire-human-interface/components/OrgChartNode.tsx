"use client"

import { forwardRef } from "react"
import { Crown, Flame, Truck, Camera, Plane, Users, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface AgentData {
  type: number
  name?: string
  alive?: boolean
  current_phase?: string
  options?: Array<{ description: string }>
  percent_complete?: number
  mission?: string
}

interface OrgChartNodeProps {
  agent: AgentData
  className?: string
  isThinking?: boolean
  isDestroyed?: boolean
}

const TYPE_CONFIG: Record<number, { name: string; icon: typeof Flame; borderColor: string; bgColor: string; iconColor: string }> = {
  [-1]: { name: "Manager", icon: Crown, borderColor: "border-blue-400", bgColor: "bg-blue-50", iconColor: "text-blue-600" },
  0: { name: "Firefighter", icon: Flame, borderColor: "border-red-400", bgColor: "bg-red-50", iconColor: "text-red-500" },
  1: { name: "Bulldozer", icon: Truck, borderColor: "border-yellow-400", bgColor: "bg-yellow-50", iconColor: "text-yellow-600" },
  2: { name: "Drone", icon: Camera, borderColor: "border-purple-400", bgColor: "bg-purple-50", iconColor: "text-purple-500" },
  3: { name: "Helicopter", icon: Plane, borderColor: "border-cyan-400", bgColor: "bg-cyan-50", iconColor: "text-cyan-500" },
}

const OrgChartNode = forwardRef<HTMLDivElement, OrgChartNodeProps>(({ agent, className, isThinking, isDestroyed }, ref) => {
  const config = TYPE_CONFIG[agent.type] ?? { name: "Unknown", icon: Users, borderColor: "border-gray-400", bgColor: "bg-gray-50", iconColor: "text-gray-500" }
  const TypeIcon = config.icon

  // Get short name (e.g., "AGENT_2" -> "AG_2")
  const shortName = agent.name?.replace("AGENT_", "AG_") || "???"

  return (
    <div
      ref={ref}
      className={cn(
        "relative px-2.5 py-1.5 rounded-lg border-2 shadow-sm cursor-pointer transition-all hover:shadow-md hover:scale-105",
        isDestroyed ? "border-gray-300 bg-gray-100 opacity-50" : cn(config.borderColor, config.bgColor),
        className
      )}
    >
      {isThinking && !isDestroyed && (
        <div className="absolute -top-1 -right-1">
          <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
        </div>
      )}
      {isDestroyed && (
        <div className="absolute -top-1 -right-1 bg-red-500 rounded-full w-3.5 h-3.5 flex items-center justify-center">
          <span className="text-white text-[8px] font-bold">X</span>
        </div>
      )}
      <div className="flex items-center gap-1.5 justify-center">
        <TypeIcon className={cn("h-3.5 w-3.5 flex-shrink-0", isDestroyed ? "text-gray-400" : config.iconColor)} />
        <span className={cn("text-xs font-semibold", isDestroyed ? "text-gray-400 line-through" : "text-gray-800")}>{shortName}</span>
      </div>
      <div className={cn("text-[10px] text-center truncate max-w-[70px]", isDestroyed ? "text-red-400 font-semibold" : "text-gray-500")}>
        {isDestroyed ? "DESTROYED" : config.name}
      </div>
      {!isDestroyed && agent.percent_complete !== undefined && agent.percent_complete !== null && (
        <div className="w-full bg-gray-200 rounded-full h-0.5 mt-1">
          <div
            className="bg-green-500 h-0.5 rounded-full transition-all"
            style={{ width: `${Math.min(agent.percent_complete, 100)}%` }}
          />
        </div>
      )}
    </div>
  )
})

OrgChartNode.displayName = "OrgChartNode"

export default OrgChartNode
