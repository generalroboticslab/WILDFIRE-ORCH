"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams, useSearchParams } from "next/navigation"
import { CheckCircle2, Copy, Loader2, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import EntryShell from "@/components/EntryShell"
import GameView from "@/components/game-view"
import RoleChart from "@/components/RoleChart"
import AgentTile from "@/components/AgentTile"
import { useToast } from "@/hooks/use-toast"
import { API_BASE_URL } from "@/lib/constants"
import { agentMeta, agentTypeFromName, displayName, type LevelAgents } from "@/lib/agents"
import { cn } from "@/lib/utils"

type GameState = "lobby" | "starting" | "started" | "stopped" | "finished"

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
  const [gameState, setGameState] = useState<GameState>("lobby")
  const [levels, setLevels] = useState<Record<string, any>>({})

  useEffect(() => {
    fetch(`${API_BASE_URL}/levels`)
      .then((res) => res.json())
      .then((data) => setLevels(data.levels || {}))
      .catch(() => {})
  }, [])

  // Remember this player's role for the lobby across reloads
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`lobby_${lobbyId}_player`)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed.name === playerName) setRole(parsed.role)
      }
    } catch {
      // ignore
    }
  }, [lobbyId, playerName])

  useEffect(() => {
    if (role) {
      try {
        localStorage.setItem(`lobby_${lobbyId}_player`, JSON.stringify({ name: playerName, role }))
      } catch {
        // ignore
      }
    }
  }, [role, lobbyId, playerName])

  const refreshLobby = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/lobby/${lobbyId}`)
      if (response.status === 404) {
        setError("This lobby doesn't exist or has expired.")
        return
      }
      if (response.ok) {
        const lobbyData = await response.json()
        setLobby(lobbyData)
        if (lobbyData.players && lobbyData.players[playerName] && lobbyData.players[playerName].role) {
          setRole(lobbyData.players[playerName].role)
        } else {
          setRole(null)
        }
      }
    } catch {
      // transient network error; the next poll retries
    }
  }

  useEffect(() => {
    setLoading(true)
    refreshLobby().finally(() => setLoading(false))
    const interval = setInterval(refreshLobby, 2000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lobbyId, playerName])

  const postJson = (path: string, body: any) =>
    fetch(`${API_BASE_URL}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })

  const levelAgents: LevelAgents | undefined = levels[lobby?.level || ""]?.agents
  const managers: string[] = lobby?.roles?.managers || []
  const agents: string[] = lobby?.roles?.agents || []
  const roleLabel = (r: string) => displayName(r, agentTypeFromName(r, levelAgents, managers))

  // Claim / unclaim / switch
  const handleRoleClick = async (roleToClaim: string, claimedBy: string | null) => {
    if (claimedBy === playerName) {
      await postJson("/unclaim_role", { lobby_id: lobbyId, player_name: playerName })
      setRole(null)
      toast({ title: `You left ${roleLabel(roleToClaim)}` })
      refreshLobby()
    } else if (!claimedBy) {
      if (role) await postJson("/unclaim_role", { lobby_id: lobbyId, player_name: playerName })
      await postJson("/claim_role", { lobby_id: lobbyId, player_name: playerName, role: roleToClaim })
      setRole(roleToClaim)
      toast({ title: `You are ${roleLabel(roleToClaim)}` })
      refreshLobby()
    }
  }

  const startGame = async () => {
    try {
      setGameState("starting")
      const response = await postJson("/start_game", { lobby_id: lobbyId })
      if (!response.ok) {
        const errData = await response.json()
        throw new Error(errData.detail || "Could not start the game.")
      }
    } catch (err: any) {
      setGameState("lobby")
      toast({ title: "Could not start the game", description: err.message, variant: "destructive" })
    }
  }

  // While starting, poll any human agent's observations: the first one means the game is ready
  useEffect(() => {
    if (gameState !== "starting" || !role || !lobby) return
    const allRoles = [...(lobby.roles?.agents || []), ...(lobby.roles?.managers || [])]
    if (allRoles.length === 0) return

    let humanAgentRole: string | null = null
    for (const playerInfo of Object.values(lobby.players || {}) as any[]) {
      if (playerInfo.role && allRoles.includes(playerInfo.role)) {
        humanAgentRole = playerInfo.role
        break
      }
    }
    if (!humanAgentRole) humanAgentRole = allRoles[0]
    const humanAgentId = allRoles.indexOf(humanAgentRole) + 1

    let cancelled = false
    const pollForObservations = async () => {
      if (cancelled) return
      try {
        const response = await fetch(`${API_BASE_URL}/observations/${lobbyId}/${humanAgentId}`)
        if (response.ok) {
          const data = await response.json()
          if (data && !data.error) {
            setGameState("started")
            return
          }
        }
      } catch {
        // keep polling
      }
      setTimeout(pollForObservations, 2000)
    }
    pollForObservations()
    return () => {
      cancelled = true
    }
  }, [gameState, role, lobbyId, lobby])

  // Follow the lobby status for every player
  useEffect(() => {
    if (!lobby?.status) return
    if ((lobby.status === "starting" || lobby.status === "running") && gameState === "lobby") setGameState("starting")
    if (lobby.status === "stopped" && (gameState === "started" || gameState === "starting")) setGameState("stopped")
    if (lobby.status === "finished" && (gameState === "started" || gameState === "starting")) setGameState("finished")
  }, [lobby, gameState])

  // Heartbeat while the game is running
  useEffect(() => {
    if (gameState !== "started") return
    const sendHeartbeat = () => {
      postJson("/heartbeat", { lobby_id: lobbyId, player_name: playerName }).catch(() => {})
    }
    sendHeartbeat()
    const interval = setInterval(sendHeartbeat, 15000)
    const onUnload = () => {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(
          `${API_BASE_URL}/heartbeat`,
          new Blob([JSON.stringify({ lobby_id: lobbyId, player_name: playerName })], { type: "application/json" }),
        )
      }
    }
    window.addEventListener("beforeunload", onUnload)
    return () => {
      clearInterval(interval)
      window.removeEventListener("beforeunload", onUnload)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState, lobbyId, playerName])

  const members: [string, any][] = lobby?.players ? Object.entries(lobby.players) : []
  // The backend lists a player only once they claim a role, so show this player straight away
  const humans: [string, any][] = members.filter(([, info]) => !info.is_ai)
  if (!humans.some(([name]) => name === playerName)) humans.unshift([playerName, { role: null }])
  const missingRole = humans.filter(([, info]) => !info.role).map(([name]) => name)
  const allPlayersHaveRole = missingRole.length === 0 && !!role
  const players = useMemo(() => members.map(([name, info]) => ({ name, role: info.role })), [members])
  const roleClaims = useMemo(() => {
    const m: Record<string, string> = {}
    members.forEach(([name, info]) => {
      if (info.role) m[info.role] = name
    })
    return m
  }, [members])

  const levelInfo = levels[lobby?.level || ""]
  const levelName = levelInfo?.name || (lobby?.level ? String(lobby.level).replace(/_/g, " ") : "")
  const modeLabel = lobby?.collaboration_mode === "human_control" ? "Human control" : "Human feedback"
  const isCreator = lobby?.creator === playerName

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(lobbyId)
      toast({ title: "Lobby code copied" })
    } catch {
      toast({ title: "Could not copy", description: `The code is ${lobbyId}`, variant: "destructive" })
    }
  }

  const backHome = () => {
    window.location.href = "/"
  }

  if (loading) {
    return (
      <EntryShell width="max-w-md">
        <div className="flex items-center justify-center gap-3 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading lobby
        </div>
      </EntryShell>
    )
  }

  if (error) {
    return (
      <EntryShell width="max-w-md">
        <h2 className="text-xl font-semibold">Lobby not found</h2>
        <p className="mt-2 text-sm text-stone-700">{error}</p>
        <Button className="mt-6 w-full" onClick={backHome}>
          Back to home
        </Button>
      </EntryShell>
    )
  }

  if (gameState === "starting") {
    const myType = role ? agentTypeFromName(role, levelAgents, managers) : null
    return (
      <EntryShell width="max-w-md">
        <div className="flex flex-col items-center gap-5 py-2 text-center">
          <Loader2 className="h-10 w-10 animate-spin text-brand" />
          <div>
            <h2 className="text-xl font-semibold">Starting the simulation</h2>
            <p className="mt-1 text-sm text-muted-foreground">Loading the Unity environment usually takes 1–2 minutes.</p>
          </div>
          <div className="flex w-full items-center justify-between gap-4 rounded-lg border bg-background px-4 py-3 text-left">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{levelName}</div>
              <div className="text-xs text-muted-foreground">
                {humans.length} player{humans.length === 1 ? "" : "s"} · {modeLabel}
              </div>
            </div>
            {role && myType !== null && <AgentTile name={role} type={myType} state="yours" />}
          </div>
        </div>
      </EntryShell>
    )
  }

  if (gameState === "started") {
    const allRoles = [...agents, ...managers]
    const agentId = allRoles.indexOf(role || "") + 1
    const isManager = managers.includes(role || "")
    return (
      <GameView
        lobbyId={lobbyId}
        playerName={playerName}
        role={role || ""}
        communicationMode={lobby?.communication_mode || "team_chat"}
        collaborationMode={lobby?.collaboration_mode || "human_control"}
        hierarchy={lobby?.hierarchy || {}}
        agentId={agentId}
        isManager={isManager}
        isCreator={isCreator}
        levelAgents={levelAgents}
        managers={managers}
        onGameStop={() => setGameState("stopped")}
      />
    )
  }

  if (gameState === "stopped" || gameState === "finished") {
    const finished = gameState === "finished"
    return (
      <EntryShell width="max-w-md">
        <div className="flex items-start gap-3">
          {finished && <CheckCircle2 className="mt-0.5 h-6 w-6 flex-shrink-0 text-green-600" />}
          <div>
            <h2 className="text-xl font-semibold">{finished ? "Mission complete" : "Game stopped"}</h2>
            <p className="mt-1.5 text-sm text-stone-700">
              {finished
                ? "Your team completed the mission."
                : lobby?.stopped_by === "heartbeat_timeout"
                  ? "The game stopped because every player disconnected."
                  : `${lobby?.stopped_by || "A player"} stopped the game.`}
            </p>
          </div>
        </div>
        <Button className="mt-6 w-full" onClick={backHome}>
          Back to home
        </Button>
      </EntryShell>
    )
  }

  // Waiting room
  return (
    <EntryShell width="max-w-[1040px]">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-[22px] font-semibold leading-7">{levelName}</h1>
            <Badge variant="secondary" className="font-medium">
              {modeLabel}
            </Badge>
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            {agents.length + managers.length} agents
            {levelInfo?.map_size ? ` · ${levelInfo.map_size}×${levelInfo.map_size} map` : ""}
            {levelInfo?.max_steps ? ` · ${levelInfo.max_steps} steps` : ""}
          </div>
        </div>
        <div className="flex flex-col items-start gap-1 sm:items-end">
          <span className="text-xs text-muted-foreground">Lobby code</span>
          <div className="flex items-center gap-2.5">
            <span className="font-mono text-2xl font-medium tracking-[.12em]">{lobbyId}</span>
            <Button type="button" variant="outline" size="sm" onClick={copyCode}>
              <Copy className="h-4 w-4" /> Copy
            </Button>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-[300px_minmax(0,1fr)]">
        <div className="flex flex-col gap-2">
          <div className="text-sm font-semibold">Players</div>
          <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
            {humans.map(([name, info], i) => {
              const r: string | undefined = info.role
              const meta = r ? agentMeta(agentTypeFromName(r, levelAgents, managers)) : null
              const Icon = meta?.icon
              return (
                <div key={name} className={cn("flex items-center justify-between gap-2 px-3 py-2.5", i < humans.length - 1 && "border-b")}>
                  <div className="flex min-w-0 items-center gap-2">
                    <User className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                    <span className="truncate text-sm font-medium">{name}</span>
                    {name === playerName && (
                      <Badge className="border-blue-200 bg-brand-soft text-blue-700 hover:bg-brand-soft" variant="outline">
                        You
                      </Badge>
                    )}
                  </div>
                  {r && meta && Icon ? (
                    <Badge variant="outline" className="gap-1 whitespace-nowrap font-semibold">
                      <Icon className={cn("h-3 w-3", meta.text)} />
                      {roleLabel(r)}
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">choosing a role…</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <div className="text-sm font-semibold">Pick your role</div>
            <span className="text-xs text-muted-foreground">Click a tile to claim it</span>
          </div>
          <div className="max-h-[300px] overflow-auto rounded-lg border bg-card shadow-sm">
            <RoleChart
              hierarchy={lobby?.hierarchy || {}}
              agents={agents}
              managers={managers}
              players={players}
              currentPlayer={playerName}
              levelAgents={levelAgents}
              onRoleClaim={(r) => handleRoleClick(r, roleClaims[r] || null)}
            />
          </div>
        </div>
      </div>

      <div className="mb-5 mt-6 h-px bg-border" />

      <div className="flex items-center justify-between gap-4">
        <span className="text-xs text-muted-foreground">
          {!allPlayersHaveRole
            ? `Waiting for ${missingRole.join(", ")} to pick a role`
            : isCreator
              ? ""
              : `Waiting for ${lobby?.creator} to start the game`}
        </span>
        {isCreator ? (
          <Button onClick={startGame} disabled={!allPlayersHaveRole}>
            Start game
          </Button>
        ) : (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>
    </EntryShell>
  )
}
