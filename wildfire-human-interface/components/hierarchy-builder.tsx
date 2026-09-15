"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Plus, Users, Crown, Flame, Truck, Zap, Plane } from "lucide-react"

export interface ManagerConfig {
  type: "horizontal" | "vertical"
  team_name: string
}

interface LevelAgents {
  firefighters: number
  bulldozers: number
  drones: number
  helicopters: number
}

interface HierarchyBuilderProps {
  agents: string[]  // Base workers from level (AGENT_1, AGENT_2, etc.)
  managers: string[]  // User-created managers (AGENT_4, AGENT_5, etc.)
  hierarchy: Record<string, string[]>  // manager_name -> [worker_names]
  managerConfigs: Record<string, ManagerConfig>  // manager_name -> config
  levelAgents: LevelAgents  // Agent counts from level config
  onManagersChange: (managers: string[]) => void
  onHierarchyChange: (hierarchy: Record<string, string[]>) => void
  onManagerConfigsChange: (configs: Record<string, ManagerConfig>) => void
}

export default function HierarchyBuilder({
  agents,
  managers,
  hierarchy,
  managerConfigs,
  levelAgents,
  onManagersChange,
  onHierarchyChange,
  onManagerConfigsChange,
}: HierarchyBuilderProps) {

  // Get agent type based on ID and level config order
  const getAgentType = (agentName: string): { type: string; icon: JSX.Element } => {
    const id = parseInt(agentName.replace("AGENT_", ""))
    const { firefighters, bulldozers, drones, helicopters } = levelAgents

    if (id <= firefighters) {
      return { type: "Firefighter", icon: <Flame className="h-3 w-3 text-orange-500" /> }
    }
    if (id <= firefighters + bulldozers) {
      return { type: "Bulldozer", icon: <Truck className="h-3 w-3 text-yellow-600" /> }
    }
    if (id <= firefighters + bulldozers + drones) {
      return { type: "Drone", icon: <Zap className="h-3 w-3 text-purple-500" /> }
    }
    if (id <= firefighters + bulldozers + drones + helicopters) {
      return { type: "Helicopter", icon: <Plane className="h-3 w-3 text-blue-500" /> }
    }
    return { type: "Manager", icon: <Crown className="h-3 w-3 text-amber-500" /> }
  }

  const addManager = () => {
    // Auto-generate manager name as AGENT_{next_id}
    const nextId = agents.length + managers.length + 1
    const newManagerName = `AGENT_${nextId}`

    if (!managers.includes(newManagerName) && !agents.includes(newManagerName)) {
      const updatedManagers = [...managers, newManagerName]
      const updatedHierarchy = { ...hierarchy, [newManagerName]: [] }
      const updatedConfigs = {
        ...managerConfigs,
        [newManagerName]: {
          type: "vertical" as const,
          team_name: `Team ${String.fromCharCode(65 + managers.length)}`  // Team A, Team B, etc.
        }
      }

      onManagersChange(updatedManagers)
      onHierarchyChange(updatedHierarchy)
      onManagerConfigsChange(updatedConfigs)
    }
  }

  const updateManagerConfig = (manager: string, updates: Partial<ManagerConfig>) => {
    const currentConfig = managerConfigs[manager] || { type: "vertical", team_name: "" }
    const updatedConfigs = {
      ...managerConfigs,
      [manager]: { ...currentConfig, ...updates }
    }
    onManagerConfigsChange(updatedConfigs)
  }


  const assignChild = (parentName: string, childName: string) => {
    const updatedHierarchy = { ...hierarchy }

    // Remove child from all other parents first
    Object.keys(updatedHierarchy).forEach((key) => {
      updatedHierarchy[key] = updatedHierarchy[key].filter((child) => child !== childName)
    })

    // Add child to new parent (if not already there)
    if (!updatedHierarchy[parentName].includes(childName)) {
      updatedHierarchy[parentName] = [...updatedHierarchy[parentName], childName]
    }

    onHierarchyChange(updatedHierarchy)
  }

  const removeChild = (parentName: string, childName: string) => {
    const updatedHierarchy = { ...hierarchy }
    updatedHierarchy[parentName] = updatedHierarchy[parentName].filter((child) => child !== childName)
    onHierarchyChange(updatedHierarchy)
  }

  const getAvailableChildren = (parentName: string) => {
    const allRoles = [...agents, ...managers]
    const assignedChildren = Object.values(hierarchy).flat()
    const availableRoles = allRoles.filter(
      (role) =>
        role !== parentName && // Can't assign self
        !assignedChildren.includes(role) && // Not already assigned
        !wouldCreateCircularDependency(parentName, role) // Wouldn't create circular dependency
    )
    return availableRoles
  }

  // Check if assigning child to parent would create a circular dependency
  const wouldCreateCircularDependency = (parentName: string, childName: string): boolean => {
    // If the child is a manager, check if it manages the parent (directly or indirectly)
    if (managers.includes(childName)) {
      return hasManagerRelationship(childName, parentName)
    }
    return false
  }

  // Check if manager1 manages manager2 (directly or indirectly)
  const hasManagerRelationship = (manager1: string, manager2: string): boolean => {
    // Direct relationship
    if (hierarchy[manager1]?.includes(manager2)) {
      return true
    }
    
    // Indirect relationship - check if manager1 manages someone who manages manager2
    const children = hierarchy[manager1] || []
    for (const child of children) {
      if (managers.includes(child) && hasManagerRelationship(child, manager2)) {
        return true
      }
    }
    
    return false
  }

  const getUnassignedAgents = () => {
    const assignedChildren = Object.values(hierarchy).flat()
    return agents.filter((agent) => !assignedChildren.includes(agent))
  }

  const renderHierarchyTree = () => {
    const unassignedAgents = getUnassignedAgents()

    return (
      <div className="space-y-4">
        {/* Managers with their children */}
        {managers.map((manager) => {
          const config = managerConfigs[manager] || { type: "vertical", team_name: "" }
          return (
            <Card key={manager} className={`border-l-4 ${config.type === "horizontal" ? "border-l-green-500" : "border-l-blue-500"}`}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Crown className={`h-4 w-4 ${config.type === "horizontal" ? "text-green-600" : "text-blue-600"}`} />
                    <CardTitle className="text-lg">{manager}</CardTitle>
                    <Badge variant="outline">{config.type === "horizontal" ? "Horizontal" : "Vertical"}</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {/* Manager Configuration */}
                  <div className="grid grid-cols-2 gap-3 p-3 bg-gray-50 rounded-lg">
                    <div className="space-y-1">
                      <Label htmlFor={`team-name-${manager}`} className="text-xs font-medium">Team Name</Label>
                      <Input
                        id={`team-name-${manager}`}
                        value={config.team_name}
                        onChange={(e) => updateManagerConfig(manager, { team_name: e.target.value })}
                        placeholder="Enter team name"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-medium">Manager Type</Label>
                      <div className="flex items-center space-x-2 h-8">
                        <Switch
                          id={`manager-type-${manager}`}
                          checked={config.type === "horizontal"}
                          onCheckedChange={(checked) => updateManagerConfig(manager, { type: checked ? "horizontal" : "vertical" })}
                        />
                        <Label htmlFor={`manager-type-${manager}`} className="text-xs">
                          {config.type === "horizontal" ? "Horizontal (parallel tasks)" : "Vertical (phase-based)"}
                        </Label>
                      </div>
                    </div>
                  </div>

                  {/* Current children */}
                  {hierarchy[manager]?.length > 0 && (
                    <div>
                      <p className="text-sm font-medium mb-2">Subordinates:</p>
                      <div className="flex flex-wrap gap-2">
                        {hierarchy[manager].map((child) => {
                          const agentInfo = getAgentType(child)
                          return (
                            <Badge key={child} variant="secondary" className="flex items-center space-x-1">
                              {agentInfo.icon}
                              <span>{child}</span>
                              <span className="text-xs text-gray-500">({agentInfo.type})</span>
                              <button
                                onClick={() => removeChild(manager, child)}
                                className="ml-1 text-red-600 hover:text-red-700"
                              >
                                ×
                              </button>
                            </Badge>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Add new child */}
                  <div className="flex space-x-2">
                    <Select onValueChange={(value) => assignChild(manager, value)}>
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Assign subordinate..." />
                      </SelectTrigger>
                      <SelectContent>
                        {getAvailableChildren(manager).map((role) => {
                          const agentInfo = getAgentType(role)
                          return (
                            <SelectItem key={role} value={role}>
                              <div className="flex items-center space-x-2">
                                {agentInfo.icon}
                                <span>{role}</span>
                                <Badge variant="outline" className="ml-2">
                                  {agentInfo.type}
                                </Badge>
                              </div>
                            </SelectItem>
                          )
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}

        {/* Unassigned agents */}
        {unassignedAgents.length > 0 && (
          <Card className="border-l-4 border-l-gray-400">
            <CardHeader className="pb-2">
              <div className="flex items-center space-x-2">
                <Users className="h-4 w-4 text-gray-600" />
                <CardTitle className="text-lg">Unassigned Agents</CardTitle>
                <Badge variant="outline">{unassignedAgents.length}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {unassignedAgents.map((agent) => {
                  const agentInfo = getAgentType(agent)
                  return (
                    <Badge key={agent} variant="secondary" className="flex items-center space-x-1">
                      {agentInfo.icon}
                      <span>{agent}</span>
                      <span className="text-xs text-gray-500">({agentInfo.type})</span>
                    </Badge>
                  )
                })}
              </div>
              <p className="text-sm text-gray-600 mt-2">
                Assign these agents to a manager above.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Add Manager Section */}
      <Button onClick={addManager} className="w-full flex items-center justify-center space-x-2">
        <Plus className="h-4 w-4" />
        <span>Add Manager (Auto-named as AGENT_{agents.length + managers.length + 1})</span>
      </Button>

      {/* Hierarchy Preview */}
      <div>
        <h4 className="text-lg font-semibold mb-4">Hierarchy Preview</h4>
        {managers.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="text-center py-8">
              <p className="text-gray-500">Add at least one manager to build your hierarchy</p>
            </CardContent>
          </Card>
        ) : (
          renderHierarchyTree()
        )}
      </div>
    </div>
  )
}
