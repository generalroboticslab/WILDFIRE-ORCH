"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Users, ArrowLeft, ArrowRight, Flame, Truck, Zap, Plane, Loader2, Shuffle } from "lucide-react"
import HierarchyBuilder, { ManagerConfig } from "@/components/hierarchy-builder"
import { API_BASE_URL } from "@/lib/constants"

const COLLABORATION_MODES = {
  human_control: {
    name: "Human Control",
    description: "Humans directly control agent actions",
  },
  human_feedback: {
    name: "Human Feedback", 
    description: "AI controls agents but receives human feedback and guidance",
  },
}

interface CreateLobbyDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  playerName: string
  apiKey: string
  // False when the server runs a local model or has its own OpenAI key configured
  requiresApiKey?: boolean
  onSuccess: (lobbyId: string) => void
}

export default function CreateLobbyDialog({ open, onOpenChange, playerName, apiKey, requiresApiKey = true, onSuccess }: CreateLobbyDialogProps) {
  const [step, setStep] = useState(1) // 1: Level Selection, 2: Collaboration Mode, 3: Hierarchy Building
  const [selectedLevel, setSelectedLevel] = useState("")
  const [seed, setSeed] = useState<string>("")
  const [collaborationMode, setCollaborationMode] = useState("human_feedback")
  const [communicationMode, setCommunicationMode] = useState("team_chat")
  const [hierarchy, setHierarchy] = useState<Record<string, string[]>>({})
  const [managers, setManagers] = useState<string[]>([])
  const [managerConfigs, setManagerConfigs] = useState<Record<string, ManagerConfig>>({})
  const [creatingLobby, setCreatingLobby] = useState(false)
  const [lobbyCreated, setLobbyCreated] = useState(false)
  const [levels, setLevels] = useState<any>({})
  const [levelKeys, setLevelKeys] = useState<string[]>([])

  // Fetch levels from backend
  useEffect(() => {
    async function fetchLevels() {
      try {
        const url = `${API_BASE_URL}/levels`
        console.log("Fetching levels from:", url)
        const res = await fetch(url)
        console.log("Response status:", res.status)
        const data = await res.json()
        console.log("Levels data:", data)
        if (data.levels) {
          setLevels(data.levels)
          setLevelKeys(Object.keys(data.levels))
          console.log("Set levels:", Object.keys(data.levels))
        } else {
          console.log("No levels found in response")
        }
      } catch (e) {
        console.error("Error fetching levels:", e)
        setLevels({})
        setLevelKeys([])
      }
    }
    fetchLevels()
  }, [])

  const currentLevel = selectedLevel ? levels[selectedLevel] : null

  const generateAgentNames = (levelKey: string) => {
    const level = levels[levelKey]
    if (!level || !level.agents) return []
    
    // Follow algorithm order: firefighters, bulldozers, drones, helicopters
    const agentOrder = ["firefighters", "bulldozers", "drones", "helicopters"]
    const agentNames: string[] = []
    let agentId = 1
    
    for (const agentType of agentOrder) {
      const count = level.agents[agentType] || 0
      for (let i = 0; i < count; i++) {
        agentNames.push(`AGENT_${agentId}`)
        agentId++
      }
    }
    
    return agentNames
  }

  const getDifficulty = (level: any) => {
    if (!level || !level.agents) return "Easy"
    const totalAgents = Object.values(level.agents).reduce((sum: number, count: any) => sum + count, 0)
    const mapSize = level.map_size || 50
    const maxSteps = level.max_steps || 30
    
    // Calculate difficulty based on total agents, map size, and complexity
    const complexity = totalAgents + (mapSize / 50) + (maxSteps / 30)
    
    if (complexity <= 6) return "Easy"
    if (complexity <= 12) return "Medium"
    return "Hard"
  }

  const getAgentIcon = (type: string) => {
    switch (type) {
      case "firefighters": return <Flame className="h-4 w-4" />
      case "bulldozers": return <Truck className="h-4 w-4" />
      case "drones": return <Zap className="h-4 w-4" />
      case "helicopters": return <Plane className="h-4 w-4" />
      default: return <Users className="h-4 w-4" />
    }
  }

  // Special levels with dynamic mid-game events (scheduled_events)
  const SPECIAL_LEVEL_KEYS = new Set([
    "Scout_Fire_Drone_Lost",
    "Transport_Helicopter_Down",
    "Rescue_Civilians_Surprise",
    "Suppress_Fire_Extinguish_Second_Fire",
    "Suppress_Fire_Contain_Water_Source",
    "Suppress_Fire_Extinguish_Rapid_Growth",
  ])

  const groupLevelsByCategory = (keys: string[]) => {
    const categoryOrder = [
      { prefix: "Demo", name: "Demo Levels" },
      { prefix: "Cut_Trees", name: "Cut Trees" },
      { prefix: "Scout_Fire", name: "Scout Fire" },
      { prefix: "Transport_Firefighters", name: "Transport Firefighters" },
      { prefix: "Rescue_Civilians", name: "Rescue Civilians" },
      { prefix: "Suppress_Fire", name: "Suppress Fire" },
      { prefix: "Scale_Level", name: "Scale Levels" },
      { prefix: "Full_Game", name: "Full Game" },
      { prefix: "VLM", name: "VLM Levels" },
    ]

    const categories: Record<string, string[]> = {}
    const specialLevels: string[] = []

    keys.forEach(key => {
      // Special levels go into their own category
      if (SPECIAL_LEVEL_KEYS.has(key)) {
        specialLevels.push(key)
        return
      }
      const category = categoryOrder.find(c => key.startsWith(c.prefix))
      const categoryName = category?.name || "Other"
      if (!categories[categoryName]) categories[categoryName] = []
      categories[categoryName].push(key)
    })

    // Return in order defined by categoryOrder
    const orderedCategories: { name: string; levels: string[] }[] = []
    categoryOrder.forEach(c => {
      if (categories[c.name] && categories[c.name].length > 0) {
        orderedCategories.push({ name: c.name, levels: categories[c.name] })
      }
    })
    // Add Special Levels category
    if (specialLevels.length > 0) {
      orderedCategories.push({ name: "Special Levels (Dynamic Events)", levels: specialLevels })
    }
    // Add "Other" at the end if it exists
    if (categories["Other"] && categories["Other"].length > 0) {
      orderedCategories.push({ name: "Other", levels: categories["Other"] })
    }

    return orderedCategories
  }

  const handleLevelSelect = (levelKey: string) => {
    setSelectedLevel(levelKey)
    // Reset hierarchy, managers, and configs
    setManagers([])
    setHierarchy({})
    setManagerConfigs({})
    // Initialize hierarchy with agents having no parents
    const agents = generateAgentNames(levelKey)
    const initialHierarchy: Record<string, string[]> = {}
    agents.forEach((agent) => {
      initialHierarchy[agent] = []
    })
    setHierarchy(initialHierarchy)
  }

  const handleCreateLobby = async () => {
    if (!selectedLevel || !playerName || !collaborationMode || managers.length === 0) {
      alert("Please complete all steps before creating the lobby")
      return
    }
    if (requiresApiKey && !apiKey) {
      alert("Please enter your OpenAI API key on the home page before creating a lobby")
      return
    }

    try {
      setCreatingLobby(true)

      // Generate a random lobby ID
      const newLobbyId = Math.random().toString(36).substring(2, 8).toUpperCase()

      const agents = generateAgentNames(selectedLevel)

      // Transform hierarchy to new format with children, type, team_name
      const transformedHierarchy: Record<string, { children: string[]; type: string; team_name: string }> = {}
      for (const manager of managers) {
        const config = managerConfigs[manager] || { type: "vertical", team_name: `Team ${manager}` }
        transformedHierarchy[manager] = {
          children: hierarchy[manager] || [],
          type: config.type,
          team_name: config.team_name
        }
      }

      // Debug: Log what we're sending to backend
      console.log("[CREATE LOBBY DEBUG] Sending to backend:", {
        lobby_id: newLobbyId,
        level: selectedLevel,
        seed: seed ? parseInt(seed) : null,
        agents: agents,
        managers: managers,
        hierarchy: transformedHierarchy,
        communication_mode: communicationMode,
      })

      // Create the lobby
      const response = await fetch(`${API_BASE_URL}/create_lobby`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lobby_id: newLobbyId,
          creator_name: playerName,
          level: selectedLevel,
          seed: seed ? parseInt(seed) : null,
          roles: {
            agents: agents,
            managers: managers,
          },
          hierarchy: transformedHierarchy,
          communication_mode: communicationMode,
          collaboration_mode: collaborationMode,
          // Only sent when the creator supplied one; the server may not need it at all
          ...(apiKey ? { openai_api_key: apiKey } : {}),
        }),
      })

      if (!response.ok) {
        let detail = "Failed to create lobby"
        try {
          const errorData = await response.json()
          if (errorData?.detail) detail = errorData.detail
        } catch {
          // Non-JSON error response — keep the generic message
        }
        throw new Error(detail)
      }

      // Show loading screen while environment is being prepared
      setLobbyCreated(true)
      
      // Simulate environment preparation time (3 seconds)
      setTimeout(() => {
        onSuccess(newLobbyId)
        
        // Reset form
        setStep(1)
        setSelectedLevel("")
        setSeed("")
        setCollaborationMode("human_feedback")
        setCommunicationMode("team_chat")
        setHierarchy({})
        setManagers([])
        setManagerConfigs({})
        setLobbyCreated(false)
      }, 3000)
    } catch (error) {
      console.error("Error creating lobby:", error)
      alert(error instanceof Error ? error.message : "Failed to create lobby. Please try again.")
    } finally {
      setCreatingLobby(false)
    }
  }

  const canProceedToStep2 = selectedLevel !== ""
  const canProceedToStep3 = collaborationMode !== ""
  const canCreateLobby = managers.length > 0 && Object.keys(hierarchy).length > 0

  const handleClose = () => {
    onOpenChange(false)
    // Reset form when closing
    setStep(1)
    setSelectedLevel("")
    setSeed("")
    setCollaborationMode("human_feedback")
    setCommunicationMode("team_chat")
    setHierarchy({})
    setManagers([])
    setManagerConfigs({})
    setLobbyCreated(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl text-center">Create Game Lobby</DialogTitle>

          {/* Progress Indicator */}
          <div className="flex justify-center space-x-4 mt-4">
            {[1, 2, 3].map((stepNum) => (
              <div key={stepNum} className="flex items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                    step >= stepNum ? "bg-primary text-primary-foreground" : "bg-gray-200 text-gray-600"
                  }`}
                >
                  {stepNum}
                </div>
                {stepNum < 3 && <div className={`w-12 h-0.5 mx-2 ${step > stepNum ? "bg-primary" : "bg-gray-200"}`} />}
              </div>
            ))}
          </div>

          <div className="text-center text-sm text-gray-600 mt-2">
            {step === 1 && "Level Selection"}
            {step === 2 && "Collaboration Mode"}
            {step === 3 && "Hierarchy Building"}
          </div>
        </DialogHeader>

        <div className="space-y-6 mt-6">
          {/* Loading Screen */}
          {lobbyCreated && (
            <div className="flex flex-col items-center justify-center py-12 space-y-6">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <div className="text-center space-y-2">
                <h3 className="text-lg font-semibold">Preparing Game Environment</h3>
                <p className="text-sm text-gray-600">Setting up the wildfire simulation...</p>
              </div>
              <div className="bg-blue-50 p-4 rounded-lg max-w-md">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">Level: {currentLevel?.name || selectedLevel}</span>
                  <Badge>
                    {currentLevel?.agents 
                      ? Object.values(currentLevel.agents).reduce((sum: number, count: any) => sum + count, 0)
                      : "N/A"} Agents
                  </Badge>
                </div>
                <p className="text-sm text-gray-600">{currentLevel?.description || "No description available"}</p>
              </div>
            </div>
          )}

          {/* Step 1: Level Selection */}
          {!lobbyCreated && step === 1 && (
            <div className="space-y-4">
              <div className="text-center">
                <h3 className="text-lg font-semibold mb-2">Choose Game Level</h3>
                <p className="text-sm text-gray-600">Select a category to view available levels</p>
              </div>

              <Accordion type="single" collapsible className="w-full">
                {groupLevelsByCategory(levelKeys).map((category) => (
                  <AccordionItem key={category.name} value={category.name}>
                    <AccordionTrigger className="text-left">
                      <div className="flex items-center justify-between w-full pr-4">
                        <span className="font-medium">{category.name}</span>
                        <Badge variant="outline">{category.levels.length} levels</Badge>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-2">
                        {category.levels.map((levelKey) => {
                          const level = levels[levelKey]
                          const difficulty = getDifficulty(level)
                          const totalAgents = level?.agents
                            ? Object.values(level.agents).reduce((sum: number, count: any) => sum + count, 0)
                            : 0

                          return (
                            <div
                              key={levelKey}
                              className={`p-3 border rounded-lg cursor-pointer transition-all hover:shadow-sm ${
                                selectedLevel === levelKey ? "ring-2 ring-primary bg-primary/5" : "hover:bg-gray-50"
                              }`}
                              onClick={() => handleLevelSelect(levelKey)}
                            >
                              <div className="flex justify-between items-center mb-1">
                                <span className="font-medium text-sm">{level?.name || levelKey}</span>
                                <Badge
                                  variant={difficulty === "Easy" ? "secondary" : difficulty === "Medium" ? "default" : "destructive"}
                                  className="text-xs"
                                >
                                  {difficulty}
                                </Badge>
                              </div>
                              <div className="flex items-center justify-between text-xs text-gray-500">
                                <span className="flex items-center">
                                  <Users className="h-3 w-3 mr-1" />
                                  {totalAgents} agents
                                </span>
                                <span>{level?.map_size}x{level?.map_size} • {level?.max_steps} steps</span>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>

              {/* Selected Level Info */}
              {selectedLevel && currentLevel && (
                <div className="bg-blue-50 p-4 rounded-lg">
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-medium">{currentLevel.name || selectedLevel}</span>
                    <Badge>
                      {currentLevel.agents
                        ? Object.values(currentLevel.agents).reduce((sum: number, count: any) => sum + count, 0)
                        : "N/A"} Agents
                    </Badge>
                  </div>
                  <p className="text-sm text-gray-600 mb-2">{currentLevel.description || "No description"}</p>
                  <div className="flex flex-wrap gap-2">
                    {currentLevel.agents && Object.entries(currentLevel.agents).map(([type, count]) => (
                      count > 0 && (
                        <div key={type} className="flex items-center text-sm">
                          {getAgentIcon(type)}
                          <span className="ml-1 capitalize">{type}: {count}</span>
                        </div>
                      )
                    ))}
                  </div>
                </div>
              )}

              {/* Seed Input */}
              <div className="mt-4 space-y-2">
                <label className="text-sm font-medium">Seed (optional)</label>
                <div className="flex items-center space-x-2">
                  <Input
                    type="number"
                    placeholder="Leave empty for random seed"
                    value={seed}
                    onChange={(e) => setSeed(e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSeed(Math.floor(Math.random() * 10000).toString())}
                  >
                    <Shuffle className="h-4 w-4 mr-1" />
                    Random
                  </Button>
                </div>
                <p className="text-xs text-gray-500">
                  Using the same seed will generate the same map layout
                </p>
              </div>
            </div>
          )}

          {/* Step 2: Collaboration Mode */}
          {!lobbyCreated && step === 2 && (
            <div className="space-y-4">
              <div className="text-center">
                <h3 className="text-lg font-semibold mb-2">Collaboration Mode</h3>
                <p className="text-sm text-gray-600">Choose how humans and AI will work together</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Collaboration Mode</label>
                <Select value={collaborationMode} onValueChange={setCollaborationMode}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(COLLABORATION_MODES).map(([key, mode]) => (
                      <SelectItem key={key} value={key}>
                        <div>
                          <div className="font-medium">{mode.name}</div>
                          <div className="text-xs text-gray-500">{mode.description}</div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {currentLevel && (
                <div className="bg-blue-50 p-4 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">Selected Level: {currentLevel.name || selectedLevel}</span>
                    <Badge>
                      {currentLevel.agents 
                        ? Object.values(currentLevel.agents).reduce((sum: number, count: any) => sum + count, 0)
                        : "N/A"} Agents
                    </Badge>
                  </div>
                  <p className="text-sm text-gray-600">{currentLevel.description || "No description available"}</p>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Hierarchy Building */}
          {!lobbyCreated && step === 3 && currentLevel && (
            <div className="space-y-4">
              <div className="text-center">
                <h3 className="text-lg font-semibold mb-2">Build Command Hierarchy</h3>
                <p className="text-sm text-gray-600">
                  Create managers and assign agents/managers as their subordinates
                </p>
              </div>

              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">Level: {currentLevel.name || selectedLevel}</span>
                  <Badge>
                    {currentLevel.agents
                      ? Object.values(currentLevel.agents).reduce((sum: number, count: any) => sum + count, 0)
                      : "N/A"} Agents
                  </Badge>
                </div>
                <p className="text-sm text-gray-600">{currentLevel.description || "No description available"}</p>
              </div>

              <HierarchyBuilder
                agents={generateAgentNames(selectedLevel)}
                managers={managers}
                hierarchy={hierarchy}
                managerConfigs={managerConfigs}
                levelAgents={currentLevel?.agents || { firefighters: 0, bulldozers: 0, drones: 0, helicopters: 0 }}
                onManagersChange={setManagers}
                onHierarchyChange={setHierarchy}
                onManagerConfigsChange={setManagerConfigs}
              />
            </div>
          )}
        </div>

        {!lobbyCreated && (
          <div className="flex justify-between mt-6 pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => setStep(Math.max(1, step - 1))}
              disabled={step === 1}
              className="flex items-center space-x-2"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Previous</span>
            </Button>

            <div className="flex space-x-2">
              {step < 3 ? (
                <Button
                  onClick={() => setStep(step + 1)}
                  disabled={(step === 1 && !canProceedToStep2) || (step === 2 && !canProceedToStep3)}
                  className="flex items-center space-x-2"
                >
                  <span>Next</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              ) : (
                <Button onClick={handleCreateLobby} disabled={!canCreateLobby || creatingLobby}>
                  {creatingLobby ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    "Create Lobby"
                  )}
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
