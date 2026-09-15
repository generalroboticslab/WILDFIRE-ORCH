"use client"

import { useEffect, useState } from "react"
import { useParams, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Loader2, Users } from "lucide-react"
import GameView from "@/components/game-view"
import { useToast } from "@/hooks/use-toast"
import { API_BASE_URL } from "@/lib/constants"
import HierarchyTree from "@/components/hierarchy-tree"

export default function LobbyPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const lobbyId = params.id as string
  const playerName = searchParams.get("name") || "Anonymous"
  const { toast } = useToast()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lobby, setLobby] = useState<any>(null)
  const [role, setRole] = useState<string | null>(null)
  const [gameState, setGameState] = useState<"lobby" | "starting" | "started" | "stopped" | "finished">("lobby")
  const [levels, setLevels] = useState<Record<string, any>>({})

  // Fetch levels from API on mount
  useEffect(() => {
    fetch(`${API_BASE_URL}/levels`)
      .then(res => res.json())
      .then(data => setLevels(data.levels || {}))
      .catch(err => console.error("Failed to load levels:", err))
  }, [])

  // Persist playerName and role in localStorage for this lobby
  useEffect(() => {
    const saved = localStorage.getItem(`lobby_${lobbyId}_player`)
    if (saved) {
      const parsed = JSON.parse(saved)
      if (parsed.name === playerName) {
        setRole(parsed.role)
      }
    }
  }, [lobbyId, playerName])

  useEffect(() => {
    if (role) {
      localStorage.setItem(`lobby_${lobbyId}_player`, JSON.stringify({ name: playerName, role }))
    }
  }, [role, lobbyId, playerName])

  // Fetch lobby info
  const refreshLobby = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/lobby/${lobbyId}`)
      if (response.ok) {
        const lobbyData = await response.json()
        setLobby(lobbyData)
        // If player has a role, update local state
        if (lobbyData.players && lobbyData.players[playerName] && lobbyData.players[playerName].role) {
          setRole(lobbyData.players[playerName].role)
        } else {
          setRole(null)
        }
      }
    } catch (err) {
      console.error("Failed to refresh lobby:", err)
    }
  }

  useEffect(() => {
    setLoading(true)
    refreshLobby().finally(() => setLoading(false))
    const interval = setInterval(refreshLobby, 2000)
    return () => clearInterval(interval)
  }, [lobbyId, playerName])

  // Role claim/unclaim logic
  const handleRoleClick = async (roleToClaim: string, claimedBy: string | null) => {
    if (claimedBy === playerName) {
      // Unclaim if clicking your own role
      await fetch(`${API_BASE_URL}/unclaim_role`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lobby_id: lobbyId, player_name: playerName })
      })
      setRole(null)
      toast({ title: "Role Unclaimed", description: `You unclaimed ${roleToClaim}` })
      refreshLobby()
    } else if (!claimedBy) {
      // Claim if unclaimed
      await fetch(`${API_BASE_URL}/claim_role`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lobby_id: lobbyId, player_name: playerName, role: roleToClaim })
      })
      setRole(roleToClaim)
      toast({ title: "Role Claimed", description: `You claimed ${roleToClaim}` })
      refreshLobby()
    } else if (role && role !== roleToClaim) {
      // Switch: unclaim current, claim new
      await fetch(`${API_BASE_URL}/unclaim_role`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lobby_id: lobbyId, player_name: playerName })
      })
      await fetch(`${API_BASE_URL}/claim_role`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lobby_id: lobbyId, player_name: playerName, role: roleToClaim })
      })
      setRole(roleToClaim)
      toast({ title: "Role Switched", description: `You claimed ${roleToClaim}` })
      refreshLobby()
    }
  }

  const startGame = async () => {
    try {
      setGameState("starting")
      
      // Fetch the latest lobby info to get the selected level
      const lobbyRes = await fetch(`${API_BASE_URL}/lobby/${lobbyId}`)
      const lobbyData = await lobbyRes.json()
      const level = lobbyData.level || "Full_Game" // fallback to a default if not set
      const response = await fetch(`${API_BASE_URL}/start_game`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lobby_id: lobbyId
        })
      })
      if (!response.ok) {
        const errData = await response.json()
        throw new Error(errData.detail || "Failed to start game")
      }
      
      // Show loading screen and start polling for observations
      toast({ title: "Game Starting", description: "Initializing Unity environment. Please wait..." })
      
      // Keep gameStarting=true until we get first observations
      // Don't set setGameStarting(false) here
      
    } catch (err: any) {
      setGameState("lobby")
      toast({ title: "Error", description: err.message || "Failed to start game. Please try again.", variant: "destructive" })
    }
  }

  // Poll for observations when game is starting - this determines when game is ready for EVERYONE
  useEffect(() => {
    if (gameState !== "starting" || !role || !lobby) return

    // Use any HUMAN agent's observations to determine if game is ready
    const allRoles = [...(lobby.roles?.agents || []), ...(lobby.roles?.managers || [])]
    if (allRoles.length === 0) return
    
    // Find any human agent to check for game ready state
    let humanAgentRole = null
    let humanAgentId = null
    
    // Look through players to find any human player's role
    for (const [playerName, playerInfo] of Object.entries(lobby.players || {})) {
      if (playerInfo.role && allRoles.includes(playerInfo.role)) {
        humanAgentRole = playerInfo.role
        humanAgentId = allRoles.indexOf(humanAgentRole) + 1
        break
      }
    }
    
    // Fallback to first available agent if no human found
    if (!humanAgentRole) {
      humanAgentRole = allRoles[0]
      humanAgentId = allRoles.indexOf(humanAgentRole) + 1
    }

    const pollForObservations = async () => {
      try {
        console.log(`[OBSERVATIONS DEBUG] Polling human agent (ID: ${humanAgentId}, Name: ${humanAgentRole}) for observations to detect game ready state`)
        console.log(`[OBSERVATIONS DEBUG] Current player role: ${role}, Collaboration mode: ${lobby.collaboration_mode}`)
        const response = await fetch(`${API_BASE_URL}/observations/${lobbyId}/${humanAgentId}`)
        console.log("[OBSERVATIONS DEBUG] Response status:", response.status)
        if (response.ok) {
          const data = await response.json()
          console.log("[OBSERVATIONS DEBUG] Response data:", data)
          console.log("[OBSERVATIONS DEBUG] Game ready check:", !!data.error ? "Still initializing" : "Ready!")
          
          // Check if we got valid observations (not an error) - this means game is ready
          if (data && !data.error) {
            console.log("[OBSERVATIONS DEBUG] Game is ready (observations found), transitioning ALL players to game view")
            setGameState("started")
            return
          } else {
            console.log("[OBSERVATIONS DEBUG] Still waiting, error was:", data.error)
          }
        } else {
          console.log("[OBSERVATIONS DEBUG] HTTP error response:", await response.text())
        }
      } catch (error) {
        console.log("[OBSERVATIONS DEBUG] Error polling observations:", error)
      }
      
      // Continue polling
      setTimeout(pollForObservations, 2000)
    }

    console.log("[OBSERVATIONS DEBUG] Starting to poll for game ready state")
    pollForObservations()
  }, [gameState, role, lobbyId, lobby])

  // When lobby status changes to starting/running/stopped, update game state for all players
  useEffect(() => {
    console.log("[LOBBY STATUS DEBUG] Current lobby status:", lobby?.status)
    if (lobby && lobby.status) {
      if (lobby.status === "starting" || lobby.status === "running") {
        // If not already in game flow, start game initialization for all players
        if (gameState === "lobby") {
          console.log("[LOBBY STATUS DEBUG] Game started, all players entering initialization screen")
          setGameState("starting")
        }
      }
      // Detect when game is stopped externally (by creator or heartbeat timeout)
      if (lobby.status === "stopped" && (gameState === "started" || gameState === "starting")) {
        console.log("[LOBBY STATUS DEBUG] Game stopped, showing stopped screen")
        setGameState("stopped")
      }
      // Detect when game finishes naturally
      if (lobby.status === "finished" && (gameState === "started" || gameState === "starting")) {
        console.log("[LOBBY STATUS DEBUG] Game finished naturally, showing finished screen")
        setGameState("finished")
      }
    }
  }, [lobby, gameState])

  // Heartbeat: tell backend we're still here while the game is running
  useEffect(() => {
    if (gameState !== "started") return

    const sendHeartbeat = () => {
      fetch(`${API_BASE_URL}/heartbeat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lobby_id: lobbyId, player_name: playerName }),
      }).catch(() => {
        console.warn("[HEARTBEAT] Failed to send heartbeat")
      })
    }

    sendHeartbeat()
    const interval = setInterval(sendHeartbeat, 15000)

    const onUnload = () => {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(
          `${API_BASE_URL}/heartbeat`,
          new Blob(
            [JSON.stringify({ lobby_id: lobbyId, player_name: playerName })],
            { type: "application/json" }
          )
        )
      }
    }
    window.addEventListener("beforeunload", onUnload)

    return () => {
      clearInterval(interval)
      window.removeEventListener("beforeunload", onUnload)
    }
  }, [gameState, lobbyId, playerName])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center justify-center py-12 space-y-6">
          <Loader2 className="h-16 w-16 animate-spin text-primary" />
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold">Loading Lobby</h2>
            <p className="text-gray-600">Fetching lobby information...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-red-500">Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p>{error}</p>
            <Button className="mt-4" onClick={() => (window.location.href = "/")}>Return to Home</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // List of all members and their roles
  const members = lobby?.players ? Object.entries(lobby.players) : []
  // Only allow starting if all players (not AI) have a role
  const allPlayersHaveRole = members.every(([name, info]: any) => !info.is_ai && info.role)

  // Map roles to player who claimed them
  const roleClaims: Record<string, string | null> = {}
  members.forEach(([name, info]: any) => {
    if (info.role) roleClaims[info.role] = name
  })

  // Prepare players array for HierarchyTree
  const players = members.map(([name, info]: any) => ({ name, role: info.role }))

  // Game info
  const levelName = lobby?.level ? lobby.level.charAt(0).toUpperCase() + lobby.level.slice(1) : ""
  const communicationMode = lobby?.communication_mode || "team_chat"

  // Role claim handler for HierarchyTree
  const handleTreeRoleClaim = async (roleToClaim: string) => {
    const claimedBy = roleClaims[roleToClaim] || null
    await handleRoleClick(roleToClaim, claimedBy)
  }

  if (gameState === "starting") {
    console.log("[GAME STATE DEBUG] Game starting, rendering starting screen")
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center justify-center py-12 space-y-6">
          <Loader2 className="h-16 w-16 animate-spin text-primary" />
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold">Initializing Wildfire Environment</h2>
            <p className="text-gray-600">Setting up CREW and algorithm service...</p>
            <p className="text-sm text-gray-500">This may take a few minutes...</p>
          </div>
          {lobby && (
            <div className="bg-white p-6 rounded-lg shadow-md max-w-md border">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">Level: {lobby.level}</span>
                  <Badge variant="outline">
                    {Object.keys(lobby.players || {}).length} Players
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Your Role:</span>
                  <Badge>{role || "Unassigned"}</Badge>
                </div>
                <div className="flex items-center justify-between text-sm text-gray-600">
                  <span className="font-medium">Communication:</span>
                  <span>{lobby.communication_mode === "team_chat" ? "Team Chat" : "Hierarchy Only"}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  if (gameState === "started") {
    console.log("[GAME STATE DEBUG] Game started, rendering game view")
    const allRoles = [...(lobby?.roles?.agents || []), ...(lobby?.roles?.managers || [])]
    const agentId = allRoles.indexOf(role) + 1
    const isManager = lobby?.roles?.managers?.includes(role) || false

    return (
      <div className="flex min-h-screen items-center justify-center">
        <GameView
          lobbyId={lobbyId}
          playerName={playerName}
          role={role || ""}
          communicationMode={lobby?.communication_mode || "team_chat"}
          collaborationMode={lobby?.collaboration_mode || "human_control"}
          hierarchy={lobby?.hierarchy || {}}
          agentId={agentId}
          isManager={isManager}
          isCreator={lobby?.creator === playerName}
          onGameStop={() => setGameState("stopped")}
        />
      </div>
    )
  }

  if (gameState === "stopped") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-red-600">Game Stopped</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-gray-700">
              {lobby?.stopped_by === "heartbeat_timeout"
                ? "The game was automatically stopped because all players disconnected."
                : `The game was stopped by ${lobby?.stopped_by || "a player"}.`}
            </p>
            <Button className="w-full" onClick={() => (window.location.href = "/")}>
              Return to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (gameState === "finished") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-green-600 text-2xl">Game Won!</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-gray-700">Congratulations! Your team successfully completed the mission. Great teamwork!</p>
            <Button className="w-full" onClick={() => (window.location.href = "/")}>
              Return to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="flex w-full max-w-5xl bg-white rounded-lg shadow-lg overflow-hidden border">
        {/* Left: Players */}
        <div className="w-1/3 border-r p-6 flex flex-col">
          <h2 className="text-xl font-bold mb-4">Players</h2>
          <ScrollArea className="flex-1 border rounded-md p-2 bg-gray-50">
            <div className="space-y-2">
              {members.map(([name, info]: any, idx: number) => (
                <div key={idx} className="flex items-center justify-between p-2 rounded bg-white border">
                  <span className="font-medium">{name}</span>
                  {name === playerName && <Badge variant="outline">You</Badge>}
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
        {/* Right: Hierarchy and Game Info */}
        <div className="w-2/3 p-6 flex flex-col">
          <h2 className="text-xl font-bold mb-4">Lobby Info</h2>
          <div className="mb-4 p-3 bg-blue-50 rounded-lg flex flex-col md:flex-row md:items-center md:justify-between">
            <div>
              <span className="font-semibold">Level:</span> {levelName}
            </div>
            <div>
              <span className="font-semibold">Communication:</span> {communicationMode === "team_chat" ? "Team Chat" : "Hierarchy Only"}
            </div>
            <div>
              <span className="font-semibold">Lobby ID:</span> {lobbyId}
            </div>
          </div>
          <HierarchyTree
            hierarchy={lobby?.hierarchy || {}}
            agents={lobby?.roles?.agents || []}
            managers={lobby?.roles?.managers || []}
            players={players}
            currentPlayer={playerName}
            onRoleClaim={handleTreeRoleClaim}
            levelAgents={levels[lobby?.level || ""]?.agents}
          />
          <Separator className="my-4" />
          {lobby?.creator === playerName ? (
            <Button className="w-full" onClick={startGame} disabled={!allPlayersHaveRole}>
              Start Game
            </Button>
          ) : (
            <div className="text-center text-gray-600 py-3">
              Waiting for {lobby?.creator} to start the game...
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
