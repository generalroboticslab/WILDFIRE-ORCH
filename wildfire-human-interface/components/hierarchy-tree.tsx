"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { ChevronDown, ChevronRight, Crown, Users, UserCheck, UserX, Flame, Truck, Zap, Plane } from "lucide-react"
import { cn } from "@/lib/utils"

interface Player {
  name: string
  role?: string
}

interface HierarchyConfig {
  children: string[]
  type: string
  team_name: string
}

interface LevelAgents {
  firefighters: number
  bulldozers: number
  drones: number
  helicopters: number
}

interface HierarchyTreeProps {
  hierarchy: Record<string, HierarchyConfig>
  agents: string[]
  managers: string[]
  players: Player[]
  currentPlayer: string
  onRoleClaim: (role: string) => void
  levelAgents?: LevelAgents
}

interface TreeNodeProps {
  role: string
  children: string[]
  hierarchy: Record<string, HierarchyConfig>
  agents: string[]
  managers: string[]
  players: Player[]
  currentPlayer: string
  onRoleClaim: (role: string) => void
  level: number
  levelAgents?: LevelAgents
}

// Helper to get children from hierarchy (handles new format)
function getChildren(hierarchy: Record<string, HierarchyConfig>, key: string): string[] {
  const config = hierarchy[key]
  return config?.children || []
}

function getAgentType(agentName: string, levelAgents?: LevelAgents): { type: string; icon: React.ReactNode } {
  if (!levelAgents) return { type: "Agent", icon: <Users className="h-3 w-3" /> }
  const id = parseInt(agentName.replace("AGENT_", ""))
  if (isNaN(id)) return { type: "Manager", icon: <Crown className="h-3 w-3 text-amber-500" /> }
  const { firefighters, bulldozers, drones, helicopters } = levelAgents
  if (id <= firefighters) return { type: "Firefighter", icon: <Flame className="h-3 w-3 text-orange-500" /> }
  if (id <= firefighters + bulldozers) return { type: "Bulldozer", icon: <Truck className="h-3 w-3 text-yellow-600" /> }
  if (id <= firefighters + bulldozers + drones) return { type: "Drone", icon: <Zap className="h-3 w-3 text-purple-500" /> }
  if (id <= firefighters + bulldozers + drones + helicopters) return { type: "Helicopter", icon: <Plane className="h-3 w-3 text-blue-500" /> }
  return { type: "Manager", icon: <Crown className="h-3 w-3 text-amber-500" /> }
}

function TreeNode({
  role,
  children,
  hierarchy,
  agents,
  managers,
  players,
  currentPlayer,
  onRoleClaim,
  level,
  levelAgents,
}: TreeNodeProps) {
  const [isExpanded, setIsExpanded] = useState(true)

  const isAgent = agents.includes(role)
  const isManager = managers.includes(role)
  const player = players.find((p) => p.role === role)
  const isClaimedByMe = player?.name === currentPlayer
  const isClaimedByOther = player && player.name !== currentPlayer
  const isAvailable = !player

  const getStatusColor = () => {
    if (isClaimedByMe) return "bg-green-100 border-green-500 text-green-800"
    if (isClaimedByOther) return "bg-red-100 border-red-500 text-red-800"
    return "bg-blue-50 border-blue-200 text-blue-800 hover:bg-blue-100"
  }

  const getStatusIcon = () => {
    if (isClaimedByMe) return <UserCheck className="h-4 w-4" />
    if (isClaimedByOther) return <UserX className="h-4 w-4" />
    if (isAgent) return <Users className="h-4 w-4" />
    return <Crown className="h-4 w-4" />
  }

  const handleClick = () => {
    if (isAvailable || isClaimedByMe) {
      onRoleClaim(role)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center space-x-2" style={{ marginLeft: `${level * 24}px` }}>
        {children.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setIsExpanded(!isExpanded)} className="p-1 h-6 w-6">
            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
        )}

        <Button
          variant="outline"
          onClick={handleClick}
          disabled={isClaimedByOther}
          className={cn(
            "flex items-center space-x-2 h-10 transition-all",
            getStatusColor(),
            isAvailable || isClaimedByMe ? "cursor-pointer" : "cursor-not-allowed",
          )}
        >
          {getStatusIcon()}
          <span className="font-medium">{role}</span>
          {(() => {
            const agentInfo = isAgent ? getAgentType(role, levelAgents) : { type: "Manager", icon: <Crown className="h-3 w-3 text-amber-500" /> }
            return (
              <Badge variant={isAgent ? "secondary" : "default"} className="text-xs flex items-center gap-1">
                {agentInfo.icon}
                {agentInfo.type}
              </Badge>
            )
          })()}
          {player && (
            <Badge variant="outline" className="text-xs">
              {player.name}
            </Badge>
          )}
        </Button>
      </div>

      {isExpanded && children.length > 0 && (
        <div className="space-y-1">
          {children.map((child) => (
            <TreeNode
              key={child}
              role={child}
              children={getChildren(hierarchy, child)}
              hierarchy={hierarchy}
              agents={agents}
              managers={managers}
              players={players}
              currentPlayer={currentPlayer}
              onRoleClaim={onRoleClaim}
              level={level + 1}
              levelAgents={levelAgents}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function HierarchyTree({
  hierarchy,
  agents,
  managers,
  players,
  currentPlayer,
  onRoleClaim,
  levelAgents,
}: HierarchyTreeProps) {
  // Find root managers (managers who are not children of other managers)
  const allChildren = Object.values(hierarchy).flatMap(config => config.children || [])
  const rootManagers = managers.filter((manager) => !allChildren.includes(manager))

  // Find independent agents (agents not assigned to any manager)
  const independentAgents = agents.filter((agent) => !allChildren.includes(agent))

  return (
    <div className="space-y-6">
      {/* Legend */}
      <Card className="bg-gray-50">
        <CardContent className="p-4">
          <h4 className="font-semibold mb-3">Role Status Legend</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 bg-blue-50 border border-blue-200 rounded"></div>
              <span>Available</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 bg-green-100 border border-green-500 rounded"></div>
              <span>Your Role</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 bg-red-100 border border-red-500 rounded"></div>
              <span>Taken</span>
            </div>
            <div className="flex items-center space-x-2">
              <Crown className="h-4 w-4" />
              <span>Manager</span>
              <Users className="h-4 w-4 ml-2" />
              <span>Agent</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Hierarchy Tree */}
      <div className="space-y-4">
        <h4 className="font-semibold text-lg">Command Hierarchy</h4>

        {/* Root managers and their trees */}
        {rootManagers.map((manager) => (
          <TreeNode
            key={manager}
            role={manager}
            children={getChildren(hierarchy, manager)}
            hierarchy={hierarchy}
            agents={agents}
            managers={managers}
            players={players}
            currentPlayer={currentPlayer}
            onRoleClaim={onRoleClaim}
            level={0}
            levelAgents={levelAgents}
          />
        ))}

        {/* Independent agents */}
        {independentAgents.length > 0 && (
          <div className="space-y-2">
            <h5 className="font-medium text-gray-700">Independent Agents</h5>
            <div className="space-y-1">
              {independentAgents.map((agent) => (
                <TreeNode
                  key={agent}
                  role={agent}
                  children={[]}
                  hierarchy={hierarchy}
                  agents={agents}
                  managers={managers}
                  players={players}
                  currentPlayer={currentPlayer}
                  onRoleClaim={onRoleClaim}
                  level={0}
                  levelAgents={levelAgents}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
