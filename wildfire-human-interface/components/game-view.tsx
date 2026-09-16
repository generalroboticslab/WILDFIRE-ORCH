"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Segmented } from "@/components/ui/segmented"
import { useToast } from "@/hooks/use-toast"
import { Loader2, Send, MessageSquare, CheckCircle2, Bot } from "lucide-react"
import { API_BASE_URL } from "@/lib/constants"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import TeamOrgChart from "@/components/TeamOrgChart"
import TeamTreeView from "@/components/TeamTreeView"
import AgentDetailCard from "@/components/AgentDetailCard"
import { AnnouncementPopup } from "@/components/AnnouncementPopup"
import GameTopBar from "@/components/game/GameTopBar"
import ObservationFrame, { type HoverCoords, type TargetMarker } from "@/components/game/ObservationFrame"
import ChatBubble from "@/components/game/ChatBubble"
import {
  agentIdFromName,
  agentMeta,
  displayName,
  friendlyText,
  rawText,
  typeLookupFromLevel,
  typeLookupFromObservation,
  type LevelAgents,
} from "@/lib/agents"
import { cn } from "@/lib/utils"

interface GameViewProps {
  lobbyId: string
  playerName: string
  role: string
  communicationMode: string
  collaborationMode: string
  // manager -> {children, type, team_name} (lobby format) or manager -> children (legacy)
  hierarchy: Record<string, any>
  agentId: number
  isManager: boolean
  isCreator: boolean
  levelAgents?: LevelAgents
  managers?: string[]
  onGameStop?: () => void
}

interface Message {
  id?: string
  sender: string
  sender_role?: string
  content?: string
  message?: string
  timestamp: string
  recipients?: string[]
}

interface GameState {
  turn: number
  phase: string
  players: Record<
    string,
    {
      role: string
      has_acted: boolean
    }
  >
  observations: Record<
    string,
    {
      image_url: string
      data: any
    }
  >
  messages: Message[]
  timer_ends_at?: string
  chats: any[]
}

interface ChatMessage {
  id: string
  role: "human" | "agent"
  content: string
  timestamp: string
  agentId?: number
  type?: "question_answer" | "slow_feedback_preview" | "fast_feedback_queued" | "fast_feedback_report" | "human_message" | "tldr"
}

interface ActivityEvent {
  seq: number
  event_type: string
  agent_name: string
  agent_id?: number
  timestep: number
  detail: string
  timestamp: string
}

// Action definitions based on agent type
const ACTION_DEFINITIONS: Record<number, Record<number, { name: string; needsCoords: boolean }>> = {
  0: {
    // Firefighter
    0: { name: "Do nothing", needsCoords: false },
    1: { name: "Move to location", needsCoords: true },
    2: { name: "Cut tree", needsCoords: false },
    3: { name: "Pick up civilian", needsCoords: false },
    4: { name: "Drop off civilian", needsCoords: false },
    5: { name: "Spray water", needsCoords: true },
    6: { name: "Refill water", needsCoords: false },
  },
  1: {
    // Bulldozer
    0: { name: "Do nothing", needsCoords: false },
    1: { name: "Move to location", needsCoords: true },
    2: { name: "Move while cutting trees", needsCoords: true },
  },
  2: {
    // Drone
    0: { name: "Do nothing", needsCoords: false },
    1: { name: "Move to location", needsCoords: true },
  },
  3: {
    // Helicopter
    0: { name: "Do nothing", needsCoords: false },
    1: { name: "Move to location", needsCoords: true },
    2: { name: "Pick up firefighters", needsCoords: false },
    3: { name: "Drop off firefighters", needsCoords: false },
    4: { name: "Refill water", needsCoords: false },
    5: { name: "Deploy water", needsCoords: false },
  },
}

const ManagerCrown = agentMeta(-1).icon

const SYSTEM_LABELS: Record<string, string> = {
  tldr: "Summary",
  fast_feedback_queued: "Feedback queued",
  fast_feedback_report: "Feedback report",
  slow_feedback_preview: "Preview",
}

const PHASES: Record<string, { label: string; dot: string }> = {
  status: { label: "Status phase", dot: "bg-blue-500" },
  action: { label: "Action phase", dot: "bg-amber-500" },
  env_step: { label: "Executing", dot: "bg-green-500" },
}

export default function GameView({
  lobbyId,
  playerName,
  role,
  communicationMode,
  collaborationMode,
  hierarchy,
  agentId,
  isManager,
  isCreator,
  levelAgents,
  managers,
  onGameStop,
}: GameViewProps) {
  const { toast } = useToast()
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [message, setMessage] = useState("")
  const [selectedActionType, setSelectedActionType] = useState<number>(0)
  const [actionParam1, setActionParam1] = useState<number>(0)
  const [actionParam2, setActionParam2] = useState<number>(0)
  const [selectedRecipient, setSelectedRecipient] = useState<string | null>(null)
  const [availableRecipients, setAvailableRecipients] = useState<string[]>([])
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null)
  const [waitingForNextTimestep, setWaitingForNextTimestep] = useState<boolean>(false)
  const [currentTimestep, setCurrentTimestep] = useState<number>(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const pollingInterval = useRef<NodeJS.Timeout | null>(null)
  const gameStartTimeRef = useRef<number>(Date.now())
  const [elapsedTime, setElapsedTime] = useState<string>("0:00")
  const [chats, setChats] = useState<any[]>([])
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null)

  const [teamViewMode, setTeamViewMode] = useState<"orgchart" | "tree">("orgchart")
  const [showStopConfirm, setShowStopConfirm] = useState(false)
  const [isStopping, setIsStopping] = useState(false)

  // Chat and activity feed state (human_feedback mode)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [isWaitingForReply, setIsWaitingForReply] = useState(false)
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null)
  const [thinkingAgentIds, setThinkingAgentIds] = useState<Set<number>>(new Set())
  const [destroyedAgentIds, setDestroyedAgentIds] = useState<Set<number>>(new Set())
  const [chatInput, setChatInput] = useState("")
  const [activityFeed, setActivityFeed] = useState<ActivityEvent[]>([])
  const [latestEventSeq, setLatestEventSeq] = useState(0)
  const [currentPhase, setCurrentPhase] = useState<string>("idle")
  const [chatTimestamp, setChatTimestamp] = useState<string>("")
  const [activeAnnouncement, setActiveAnnouncement] = useState<string | null>(null)
  const pendingAnnouncements = useRef<string[]>([])
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Hover-to-see-coordinates and click-to-target
  const [hoverCoords, setHoverCoords] = useState<HoverCoords | null>(null)
  const [marker, setMarker] = useState<TargetMarker | null>(null)
  const [lastAction, setLastAction] = useState<string | null>(null)
  const imgRef = useRef<HTMLImageElement>(null)

  // Determine available recipients based on hierarchy and communication mode
  useEffect(() => {
    let connections: string[] = []
    const childrenOf = (manager: string): string[] => {
      const cfg = hierarchy[manager]
      return Array.isArray(cfg) ? cfg : cfg?.children || []
    }
    if (communicationMode === "team_chat") {
      connections = ["team_chat"]
    } else {
      if (!isManager) {
        let agentManager = null
        for (const manager of Object.keys(hierarchy)) {
          if (childrenOf(manager).includes(role)) {
            agentManager = manager
            break
          }
        }
        if (agentManager) {
          connections.push(`team_${agentManager}`)
          connections.push(...childrenOf(agentManager))
          connections.push(agentManager)
        }
      } else {
        connections.push(`subteam_${role}`)
        connections.push(...childrenOf(role))
      }
    }
    setAvailableRecipients(connections)
    setSelectedRecipient((prev) => {
      if (!prev || !connections.includes(prev)) {
        return connections[0] || null
      }
      return prev
    })
  }, [role, communicationMode, collaborationMode, hierarchy, isManager])

  // Fetch observations
  useEffect(() => {
    const fetchObservations = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/observations/${lobbyId}/${agentId}`)

        if (!response.ok) {
          if (response.status === 404) {
            return
          }
          throw new Error("Failed to fetch observations")
        }

        const data = await response.json()

        if (
          data.error &&
          (data.error.includes("initializing") || data.error.includes("Waiting for observations") || data.error.includes("not found in observations"))
        ) {
          setWaitingForNextTimestep(true)
          return
        }

        if (data.error) {
          throw new Error(data.error)
        }

        setWaitingForNextTimestep(false)

        let image_url = data.image_url || null
        if (data.minimap_image_base64) {
          image_url = `data:image/png;base64,${data.minimap_image_base64}`
        }

        if (data.timestep !== undefined) {
          setCurrentTimestep(data.timestep)
        }

        setGameState(
          (prev) =>
            ({
              ...prev,
              turn: prev?.turn || 1,
              phase: prev?.phase || "Input Phase",
              players: data.players || prev?.players || {},
              observations: {
                [agentId]: {
                  image_url: image_url,
                  data: data,
                },
              },
              messages: prev?.messages || [],
              chats: prev?.chats || [],
            }) as GameState,
        )

        // Detect destroyed agents from observation data
        if (data.children_data) {
          const newDestroyed = new Set<number>()
          for (const [id, agentData] of Object.entries(data.children_data)) {
            if ((agentData as any).alive === false) {
              newDestroyed.add(Number(id))
            }
          }
          setDestroyedAgentIds(newDestroyed)
        }

        // Flush queued announcements now that observations are fresh
        if (pendingAnnouncements.current.length > 0) {
          setActiveAnnouncement(pendingAnnouncements.current[pendingAnnouncements.current.length - 1])
          pendingAnnouncements.current = []
        }

        try {
          const chatResponse = await fetch(`${API_BASE_URL}/chats/${lobbyId}/${playerName}`)
          if (chatResponse.ok) {
            const chatData = await chatResponse.json()
            const newChats = Object.entries(chatData.chats || {}).map(([id, data]: [string, any]) => ({
              id,
              participants: data.participants || [],
              messages: data.messages || [],
            }))
            setChats(newChats)

            if (!selectedChatId && newChats.length > 0) {
              const teamChat = newChats.find((c: any) => c.id === "team_chat")
              setSelectedChatId(teamChat ? teamChat.id : newChats[0].id)
            }
          }
        } catch (chatErr) {
          console.error("Error fetching chats:", chatErr)
        }
      } catch (err: any) {
        console.error("Error fetching observations:", err)
      }
    }

    fetchObservations()
    pollingInterval.current = setInterval(fetchObservations, 500)

    return () => {
      if (pollingInterval.current) {
        clearInterval(pollingInterval.current)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lobbyId, playerName, role, toast, agentId])

  useEffect(() => {
    if (timeRemaining === null) return

    const timerInterval = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev === null || prev <= 0) {
          clearInterval(timerInterval)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timerInterval)
  }, [timeRemaining])

  // The target marker refers to the previous step's map: drop it when a new step arrives
  useEffect(() => {
    setMarker(null)
  }, [currentTimestep])

  const prevMessagesRef = useRef<Message[]>([])
  useEffect(() => {
    const selectedChat = chats.find((c) => c.id === selectedChatId)
    if (selectedChat && prevMessagesRef.current.length !== (selectedChat.messages?.length || 0)) {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: "smooth" })
      }
      prevMessagesRef.current = selectedChat?.messages || []
    }
  }, [chats, selectedChatId])

  const selectedChat: any = chats.find((c) => c.id === selectedChatId)
  const filteredMessages: Message[] = selectedChat?.messages || []

  const handleSendMessage = async () => {
    if (!message.trim() || !selectedChatId) return

    try {
      const response = await fetch(`${API_BASE_URL}/send_message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lobby_id: lobbyId,
          player_name: playerName,
          chat_id: selectedChatId,
          message: rawText(message),
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to send message")
      }

      setMessage("")

      try {
        const chatResponse = await fetch(`${API_BASE_URL}/chats/${lobbyId}/${playerName}`)
        if (chatResponse.ok) {
          const chatData = await chatResponse.json()
          const newChats = Object.entries(chatData.chats || {}).map(([id, data]: [string, any]) => ({
            id,
            participants: data.participants || [],
            messages: data.messages || [],
          }))
          setChats(newChats)

          if (!selectedChatId && newChats.length > 0) {
            setSelectedChatId(newChats[0].id)
          }
        }
      } catch (error) {
        console.error("Failed to refresh chat data:", error)
      }
    } catch (err) {
      toast({
        title: "Message not sent",
        description: "Please try again.",
        variant: "destructive",
      })
    }
  }

  const handleSubmitAction = async () => {
    if (isManager) return

    try {
      const observation = gameState?.observations[agentId]
      const agentType = observation?.data?.type ?? 0
      const lastPosition = observation?.data?.last_position || [0, 0]

      const actionDef = ACTION_DEFINITIONS[agentType]?.[selectedActionType]
      if (!actionDef) {
        toast({
          title: "Invalid action",
          description: "That action is not available for this agent.",
          variant: "destructive",
        })
        return
      }

      let finalAction: number[]
      if (actionDef.needsCoords) {
        finalAction = [selectedActionType, actionParam1, actionParam2]
      } else {
        finalAction = [selectedActionType, lastPosition[0], lastPosition[1]]
      }

      const response = await fetch(`${API_BASE_URL}/submit_action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lobby_id: lobbyId,
          player_name: playerName,
          agent_id: agentId,
          action: finalAction,
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to submit action")
      }

      await response.json()

      setGameState(
        (prev) =>
          ({
            ...prev,
            players: {
              ...prev?.players,
              [playerName]: {
                ...prev?.players?.[playerName],
                has_acted: true,
                role: role,
              },
            },
          }) as GameState,
      )

      setLastAction(actionDef.needsCoords ? `${actionDef.name} → (${actionParam1}, ${actionParam2})` : actionDef.name)
    } catch (err) {
      toast({
        title: "Action not submitted",
        description: "Please try again.",
        variant: "destructive",
      })
    }
  }

  const handleStopGame = async () => {
    setIsStopping(true)
    try {
      const res = await fetch(`${API_BASE_URL}/stop_game`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lobby_id: lobbyId, player_name: playerName }),
      })
      if (!res.ok) throw new Error("Failed to stop game")
      toast({ title: "Game stopped" })
      setShowStopConfirm(false)
      onGameStop?.()
    } catch {
      toast({ title: "Could not stop the game", variant: "destructive" })
    } finally {
      setIsStopping(false)
    }
  }

  // Determine if the game is active for polling
  const isGameActive = !!(gameState && !waitingForNextTimestep)

  // Poll activity events every 500ms (all collaboration modes — needed for announcements)
  useEffect(() => {
    if (!isGameActive) return
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/events?lobby_id=${lobbyId}&since_seq=${latestEventSeq}`)
        if (!res.ok) return
        const data = await res.json()
        const newEvents: ActivityEvent[] = (data.events || []).map((e: any) => ({
          seq: e.seq,
          event_type: e.event_type,
          agent_name: e.agent_name,
          agent_id: e.agent_id,
          timestep: e.timestep,
          detail: e.detail,
          timestamp: e.timestamp,
        }))
        if (newEvents.length > 0) {
          setActivityFeed((prev) => {
            const combined = [...prev, ...newEvents]
            return combined.slice(-20)
          })
          setLatestEventSeq(data.latest_seq ?? latestEventSeq)
          setThinkingAgentIds((prev) => {
            const next = new Set(prev)
            for (const event of newEvents) {
              const eventAgentId = (event as ActivityEvent).agent_id
              if (eventAgentId === undefined) continue
              if (event.event_type === "status_started" || event.event_type === "action_started") {
                next.add(eventAgentId)
              } else if (["decision_made", "options_written", "plan_written", "phase_transition"].includes(event.event_type)) {
                next.delete(eventAgentId)
              }
              if (event.event_type === "agent_destroyed") {
                next.delete(eventAgentId)
              }
            }
            return next
          })
          // Queue announcements — display when next observation poll arrives
          const announcements = newEvents.filter((e) => e.event_type === "announcement" || e.event_type === "agent_destroyed")
          if (announcements.length > 0) {
            pendingAnnouncements.current.push(announcements[announcements.length - 1].detail)
          }
        }
        // Update phase from events if available, or from last event
        if (data.current_phase) {
          setCurrentPhase(data.current_phase)
        }
      } catch {
        // Silently ignore polling errors
      }
    }, 500)
    return () => clearInterval(interval)
  }, [lobbyId, latestEventSeq, isGameActive])

  // Poll phase status every 1000ms (human_feedback + manager)
  useEffect(() => {
    if (collaborationMode !== "human_feedback" || !isGameActive) return
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/phase_status?lobby_id=${lobbyId}`)
        if (!res.ok) return
        const data = await res.json()
        if (data.current_phase) {
          setCurrentPhase(data.current_phase)
        }
      } catch {
        // Silently ignore
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [lobbyId, isGameActive, collaborationMode])

  // Poll chat responses every 1000ms (human_feedback + manager)
  useEffect(() => {
    if (collaborationMode !== "human_feedback" || !isGameActive) return
    const interval = setInterval(async () => {
      try {
        const params = chatTimestamp
          ? `?lobby_id=${lobbyId}&since_timestamp=${encodeURIComponent(chatTimestamp)}`
          : `?lobby_id=${lobbyId}`
        const res = await fetch(`${API_BASE_URL}/get_chat${params}`)
        if (!res.ok) return
        const data = await res.json()
        const responses: any[] = data.responses || []
        if (responses.length > 0) {
          const newMessages: ChatMessage[] = responses.map((r: any) => ({
            id: `reply_${r.in_reply_to}_${r.timestamp}`,
            role: "agent",
            content: r.content,
            timestamp: r.timestamp,
            agentId: r.target_agent_id,
            type: r.type,
          }))
          setChatMessages((prev) => {
            const existingIds = new Set(prev.map((m: ChatMessage) => m.id))
            const unique = newMessages.filter((m) => !existingIds.has(m.id))
            return unique.length > 0 ? [...prev, ...unique] : prev
          })
          if (newMessages.filter((m) => m.type !== "tldr" && m.type !== "fast_feedback_queued").length > 0) {
            setIsWaitingForReply(false)
          }
          const latest = responses[responses.length - 1]
          if (latest?.timestamp) {
            setChatTimestamp(latest.timestamp)
          }
          setTimeout(() => {
            chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
          }, 50)
        }
      } catch {
        // Silently ignore
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [lobbyId, chatTimestamp, isGameActive, collaborationMode])

  // Auto-scroll chat to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [chatMessages])

  // Elapsed time counter
  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - gameStartTimeRef.current) / 1000)
      const minutes = Math.floor(elapsed / 60)
      const seconds = elapsed % 60
      setElapsedTime(`${minutes}:${seconds.toString().padStart(2, "0")}`)
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  const handleSendChat = async () => {
    if (!chatInput.trim() || selectedAgentId === null) return
    if (destroyedAgentIds.has(selectedAgentId)) return
    const messageId = crypto.randomUUID()
    const newMsg: ChatMessage = {
      id: messageId,
      role: "human",
      content: chatInput,
      timestamp: new Date().toISOString(),
      agentId: selectedAgentId,
      type: "human_message",
    }
    setChatMessages((prev) => [...prev, newMsg])
    setIsWaitingForReply(true)
    const inputCopy = rawText(chatInput)
    setChatInput("")
    try {
      await fetch(`${API_BASE_URL}/send_chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lobby_id: lobbyId,
          player_name: playerName,
          target_agent_id: selectedAgentId,
          content: inputCopy,
          message_id: messageId,
        }),
      })
    } catch {
      toast({
        title: "Message not sent",
        description: "Please try again.",
        variant: "destructive",
      })
    }
  }

  const hasActed = gameState?.players[playerName]?.has_acted || false
  const observation = gameState?.observations[agentId] || { image_url: null, data: {} }

  // ---- Friendly names ----
  const typeOfFromObs = useMemo(() => typeLookupFromObservation(observation.data, observation.data?.children_data), [observation.data])
  const typeOfFromLevel = useMemo(() => typeLookupFromLevel(levelAgents, managers), [levelAgents, managers])
  const typeOf = (id: number): number | null => typeOfFromObs(id) ?? typeOfFromLevel(id)
  const label = (name: string) => {
    const id = agentIdFromName(name)
    return id === null ? name : displayName(name, typeOf(id))
  }
  const friendly = (text: string) => friendlyText(text, typeOf)
  const teamNameOf = (manager: string): string | null => {
    const cfg = hierarchy[manager]
    return cfg && !Array.isArray(cfg) && cfg.team_name ? cfg.team_name : null
  }
  const chatTitle = (id: string) => {
    if (id === "team_chat") return "Team chat"
    const m = /^(?:sub)?team_(AGENT_\d+)$/.exec(id)
    if (m) return teamNameOf(m[1]) || `Team of ${label(m[1])}`
    return id.replace(/_/g, " ")
  }
  const senderLine = (msg: Message) => {
    if (agentIdFromName(msg.sender) !== null) return label(msg.sender)
    const roleName = msg.sender_role && agentIdFromName(msg.sender_role) !== null ? label(msg.sender_role) : null
    return roleName ? `${msg.sender} · ${roleName}` : msg.sender
  }
  const myManager = useMemo(() => {
    for (const [manager, cfg] of Object.entries(hierarchy)) {
      const children: string[] = Array.isArray(cfg) ? cfg : cfg?.children || []
      if (children.includes(role)) return manager
    }
    return null
  }, [hierarchy, role])

  // --- Hover-to-see-coordinates / click-to-target ---
  const pixelToGridCoords = (px: number, py: number, metadata: any): HoverCoords | null => {
    if (metadata.type === "worker") {
      const mm = metadata.minimap
      if (mm?.bounds && px >= mm.pixel_x && px < mm.pixel_x + mm.pixel_width && py >= mm.pixel_y && py < mm.pixel_y + mm.pixel_height) {
        const relX = (px - mm.pixel_x) / mm.pixel_width
        const relY = (py - mm.pixel_y) / mm.pixel_height
        return {
          gridX: Math.round(mm.bounds.grid_min_x + relX * (mm.bounds.grid_max_x - mm.bounds.grid_min_x)),
          gridY: Math.round(mm.bounds.grid_min_y + relY * (mm.bounds.grid_max_y - mm.bounds.grid_min_y)),
          label: "Minimap",
        }
      }
      return null // POV region — no grid coords
    }

    if (metadata.type === "manager") {
      const acc = metadata.accumulative
      if (acc?.bounds && px >= acc.pixel_x && px < acc.pixel_x + acc.pixel_width && py >= acc.pixel_y && py < acc.pixel_y + acc.pixel_height) {
        const relX = (px - acc.pixel_x) / acc.pixel_width
        const relY = (py - acc.pixel_y) / acc.pixel_height
        return {
          gridX: Math.round(acc.bounds.grid_min_x + relX * (acc.bounds.grid_max_x - acc.bounds.grid_min_x)),
          gridY: Math.round(acc.bounds.grid_min_y + relY * (acc.bounds.grid_max_y - acc.bounds.grid_min_y)),
          label: "Overview",
        }
      }

      const cg = metadata.children_grid
      if (cg && px >= cg.pixel_x && px < cg.pixel_x + cg.pixel_width && py >= cg.pixel_y && py < cg.pixel_y + cg.pixel_height) {
        const relX = px - cg.pixel_x
        const relY = py - cg.pixel_y
        const col = Math.floor(relX / cg.child_width)
        const row = Math.floor(relY / cg.child_height)
        const childIdx = row * cg.grid_cols + col

        if (childIdx < (cg.workers?.length ?? 0)) {
          const worker = cg.workers[childIdx]
          const cellRelX = relX - col * cg.child_width
          const cellRelY = relY - row * cg.child_height

          if (cellRelX < cg.minimap_width && worker.minimap_bounds) {
            const normX = cellRelX / cg.minimap_width
            const normY = cellRelY / cg.child_height
            const b = worker.minimap_bounds
            return {
              gridX: Math.round(b.grid_min_x + normX * (b.grid_max_x - b.grid_min_x)),
              gridY: Math.round(b.grid_min_y + normY * (b.grid_max_y - b.grid_min_y)),
              label: displayName(`AGENT_${worker.id}`, typeOf(worker.id)),
            }
          }
        }
      }
    }
    return null
  }

  // Natural-image pixel under the cursor plus its position as a fraction of the rendered image
  const imagePointFromEvent = (e: React.MouseEvent<HTMLImageElement>) => {
    const img = imgRef.current
    const metadata = observation.data?.image_coord_metadata
    if (!img || !metadata) return null
    const rect = img.getBoundingClientRect()
    const natW = metadata.total_width
    const natH = metadata.total_height
    const scale = Math.min(rect.width / natW, rect.height / natH)
    const offX = (rect.width - natW * scale) / 2
    const offY = (rect.height - natH * scale) / 2
    const imgPx = (e.clientX - rect.left - offX) / scale
    const imgPy = (e.clientY - rect.top - offY) / scale
    if (imgPx < 0 || imgPx >= natW || imgPy < 0 || imgPy >= natH) return null
    return {
      imgPx,
      imgPy,
      metadata,
      fx: (e.clientX - rect.left) / rect.width,
      fy: (e.clientY - rect.top) / rect.height,
    }
  }

  const handleImageMouseMove = (e: React.MouseEvent<HTMLImageElement>) => {
    const p = imagePointFromEvent(e)
    setHoverCoords(p ? pixelToGridCoords(p.imgPx, p.imgPy, p.metadata) : null)
  }

  const handleImageMouseLeave = () => setHoverCoords(null)

  const agentType: number = observation.data?.type ?? 0
  const currentActionDef = ACTION_DEFINITIONS[agentType]?.[selectedActionType]
  const canTarget = !isManager && collaborationMode === "human_control" && !hasActed && !!currentActionDef?.needsCoords

  const handleImageClick = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!canTarget) return
    const p = imagePointFromEvent(e)
    if (!p) return
    const coords = pixelToGridCoords(p.imgPx, p.imgPy, p.metadata)
    if (!coords) return
    setActionParam1(coords.gridX)
    setActionParam2(coords.gridY)
    setMarker({ fx: p.fx, fy: p.fy, label: `target (${coords.gridX}, ${coords.gridY})` })
  }

  // Count total agents in team hierarchy
  const getAgentCount = () => {
    const childrenData = observation.data?.children_data || {}
    let count = 0

    const countAgents = (data: Record<string, any>) => {
      for (const [, agentData] of Object.entries(data)) {
        count++
        if (agentData.type === -1 && agentData.children_data) {
          countAgents(agentData.children_data)
        }
      }
    }

    countAgents(childrenData)
    return count
  }

  // Get data for the selected agent (used in list mode sidebar)
  const getSelectedAgentData = () => {
    if (selectedAgentId === agentId) return observation.data
    const flatData = observation.data?.children_data || {}
    const findAgent = (data: Record<string, any>): any => {
      for (const [id, agentData] of Object.entries(data)) {
        if (Number(id) === selectedAgentId) return agentData
        if (agentData.children_data) {
          const found = findAgent(agentData.children_data)
          if (found) return found
        }
      }
      return null
    }
    return findAgent(flatData)
  }

  // Filter chat messages by selected agent
  const filteredChatMessages = selectedAgentId !== null ? chatMessages.filter((msg) => msg.agentId === selectedAgentId) : chatMessages

  const missionText = observation.data?.task_description ? friendly(observation.data.task_description) : ""
  const progress =
    observation.data?.reward_target && observation.data.reward_target.target > 0
      ? {
          label: observation.data.reward_target.label,
          value: observation.data.rewards?.[observation.data.reward_target.index] || 0,
          target: observation.data.reward_target.target,
        }
      : null

  const topBar = (
    <GameTopBar
      mission={missionText}
      step={currentTimestep}
      elapsed={elapsedTime}
      playerName={playerName}
      isCreator={isCreator}
      onStop={() => setShowStopConfirm(true)}
      progress={progress}
    />
  )

  // Announcement popup for game events
  const announcementPopup = <AnnouncementPopup announcement={activeAnnouncement ? friendly(activeAnnouncement) : null} onDismiss={() => setActiveAnnouncement(null)} />

  // Shared stop game confirmation dialog (creator only)
  const stopGameDialog = isCreator ? (
    <Dialog open={showStopConfirm} onOpenChange={setShowStopConfirm}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Stop the game?</DialogTitle>
          <DialogDescription>This ends the game for every player and shuts the simulation down. It cannot be undone.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowStopConfirm(false)} disabled={isStopping}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleStopGame} disabled={isStopping}>
            {isStopping && <Loader2 className="h-4 w-4 animate-spin" />}
            Stop game
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ) : null

  const card = "rounded-lg border bg-card shadow-sm"

  // ============================================================
  // MANAGER VIEW (human_feedback mode, manager agent)
  // ============================================================
  if (collaborationMode === "human_feedback" && (observation.data?.type === -1 || observation.data?.type === undefined)) {
    const agentCount = getAgentCount()
    const phase = PHASES[currentPhase] || { label: "Idle", dot: "bg-stone-400" }
    const selectedData = selectedAgentId !== null ? (selectedAgentId === agentId ? observation.data : observation.data?.children_data?.[String(selectedAgentId)]) : null
    const selectedType: number | null = selectedData?.type ?? (selectedAgentId !== null ? typeOf(selectedAgentId) : null)
    const SelectedIcon = agentMeta(selectedType).icon
    const selectedLabel = selectedAgentId !== null ? displayName(`AGENT_${selectedAgentId}`, selectedType) : null
    const selectedTeam = selectedAgentId !== null ? teamNameOf(`AGENT_${selectedAgentId}`) : null
    const selectedDestroyed = selectedAgentId !== null && destroyedAgentIds.has(selectedAgentId)

    return (
      <div className="flex h-screen flex-col gap-2 overflow-hidden p-3">
        {topBar}

        <div className="flex min-h-0 flex-1 gap-3">
          {/* Left: observation (55%) */}
          <div className="flex min-h-0 w-[55%] flex-col">
            <ObservationFrame
              imageUrl={observation.image_url}
              waiting={waitingForNextTimestep}
              imgRef={imgRef}
              hoverCoords={hoverCoords}
              onMouseMove={handleImageMouseMove}
              onMouseLeave={handleImageMouseLeave}
            />
          </div>

          {/* Right: team + chat (45%) */}
          <div className="flex min-h-0 w-[45%] flex-col gap-2">
            <div className="flex h-7 flex-shrink-0 items-center gap-2.5">
              <span className="text-[13px] font-semibold">Team</span>
              <span className="text-[13px] text-muted-foreground">
                {agentCount} agent{agentCount === 1 ? "" : "s"}
              </span>
              <span className="ml-1 inline-flex items-center gap-1.5 text-xs text-stone-700">
                <span className={cn("h-2 w-2 rounded-full", phase.dot)} />
                {phase.label}
              </span>
              <div className="ml-auto">
                <Segmented
                  aria-label="Team view"
                  value={teamViewMode}
                  onChange={setTeamViewMode}
                  options={[
                    { value: "orgchart", label: "Graph" },
                    { value: "tree", label: "List" },
                  ]}
                />
              </div>
            </div>

            <div className={cn("flex h-[40%] min-h-0 flex-shrink-0 overflow-hidden", card)}>
              <div className={cn("overflow-auto", teamViewMode === "tree" && selectedAgentId !== null ? "w-1/2 border-r" : "w-full")}>
                {teamViewMode === "orgchart" ? (
                  <TeamOrgChart
                    rootAgent={observation.data}
                    childrenData={observation.data?.children_data || {}}
                    rootAgentId={agentId}
                    selectedAgentId={selectedAgentId}
                    onAgentSelect={setSelectedAgentId}
                    thinkingAgentIds={thinkingAgentIds}
                    destroyedAgentIds={destroyedAgentIds}
                    typeOf={typeOf}
                  />
                ) : (
                  <TeamTreeView
                    rootAgent={observation.data}
                    childrenData={observation.data?.children_data || {}}
                    rootAgentId={agentId}
                    selectedAgentId={selectedAgentId}
                    onAgentSelect={setSelectedAgentId}
                    thinkingAgentIds={thinkingAgentIds}
                    destroyedAgentIds={destroyedAgentIds}
                    disableHover
                    typeOf={typeOf}
                  />
                )}
              </div>
              {teamViewMode === "tree" && selectedAgentId !== null && selectedData && (
                <div className="w-1/2 overflow-y-auto p-2">
                  <AgentDetailCard agent={selectedData} typeOf={typeOf} />
                </div>
              )}
            </div>

            {/* Chat */}
            <div className={cn("flex min-h-0 flex-1 flex-col overflow-hidden", card)}>
              <div className="flex flex-shrink-0 items-center gap-2 border-b bg-background px-3 py-2">
                {selectedAgentId !== null && selectedLabel ? (
                  <>
                    <SelectedIcon className={cn("h-3.5 w-3.5", agentMeta(selectedType).text)} />
                    <span className="text-[13px] font-semibold">{selectedLabel}</span>
                    {selectedAgentId === agentId ? (
                      <Badge className="border-blue-200 bg-brand-soft text-blue-700 hover:bg-brand-soft" variant="outline">
                        You
                      </Badge>
                    ) : (
                      selectedTeam && <span className="text-xs text-muted-foreground">{selectedTeam}</span>
                    )}
                    {selectedDestroyed && <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-600">Destroyed</span>}
                  </>
                ) : (
                  <>
                    <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-[13px] text-muted-foreground">Select an agent above to chat</span>
                  </>
                )}
              </div>

              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2.5">
                {filteredChatMessages.length === 0 ? (
                  <div className="py-6 text-center text-stone-400">
                    <MessageSquare className="mx-auto mb-1 h-7 w-7 opacity-40" />
                    <p className="text-xs">Ask a question or give feedback</p>
                  </div>
                ) : (
                  filteredChatMessages.map((msg) =>
                    msg.role === "human" ? (
                      <ChatBubble key={msg.id} who="human" text={friendly(msg.content)} time={msg.timestamp} />
                    ) : msg.type && SYSTEM_LABELS[msg.type] ? (
                      <ChatBubble key={msg.id} who="system" label={SYSTEM_LABELS[msg.type]} text={friendly(msg.content)} time={msg.timestamp} />
                    ) : (
                      <ChatBubble key={msg.id} who="agent" text={friendly(msg.content)} time={msg.timestamp} />
                    ),
                  )
                )}
                {isWaitingForReply && (
                  <div className="flex justify-start gap-1.5">
                    <div className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-brand-soft">
                      <Bot className="h-3 w-3 text-brand" />
                    </div>
                    <div className="flex items-center gap-1 rounded-[10px] border bg-card px-3 py-2">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-stone-400" style={{ animationDelay: "0ms" }} />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-stone-400" style={{ animationDelay: "150ms" }} />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-stone-400" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              <div className="flex flex-shrink-0 gap-1.5 border-t p-2">
                <Input
                  placeholder={
                    selectedAgentId === null ? "Select an agent first" : selectedDestroyed ? "This agent has been destroyed" : `Message ${selectedLabel}…`
                  }
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault()
                      handleSendChat()
                    }
                  }}
                  disabled={selectedAgentId === null || selectedDestroyed}
                  className="h-9 text-[13px]"
                />
                <Button size="icon" onClick={handleSendChat} disabled={!chatInput.trim() || selectedAgentId === null || selectedDestroyed} className="h-9 w-9 flex-shrink-0">
                  <Send className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        </div>
        {stopGameDialog}
        {announcementPopup}
      </div>
    )
  }

  // ============================================================
  // WORKER VIEW (human_control, or a human on a worker role)
  // ============================================================
  const meta = agentMeta(observation.data?.type ?? typeOf(agentId))
  const AgentIcon = meta.icon
  const myLabel = displayName(role || `AGENT_${agentId}`, observation.data?.type ?? typeOf(agentId))
  const alive = observation.data?.alive !== false
  const position: number[] | null = observation.data?.last_position || null
  const extra: number[] | null = Array.isArray(observation.data?.extra_variables) ? observation.data.extra_variables : null
  const showsWater = (agentType === 0 || agentType === 3) && extra && extra.length > 1 && /water/i.test(observation.data?.task_description || "")
  const carrying =
    extra && extra.length > 0
      ? agentType === 0
        ? extra[0]
          ? "Civilian"
          : "Nothing"
        : agentType === 3
          ? extra[0]
            ? `${Math.round(extra[0])}/5 firefighters`
            : "Nothing"
          : null
      : null
  const teamMates = gameState?.players ? Object.entries(gameState.players).filter(([name]) => name !== playerName) : []
  const waitingOn = teamMates.filter(([, info]) => !info.has_acted).map(([name]) => name)
  const aiRun = collaborationMode !== "human_control"

  return (
    <div className="flex h-screen flex-col gap-2 overflow-hidden p-3">
      {topBar}

      <div className="flex min-h-0 flex-1 gap-3">
        {/* Left: observation (58%) */}
        <div className="flex min-h-0 w-[58%] flex-col">
          <ObservationFrame
            imageUrl={observation.image_url}
            waiting={waitingForNextTimestep}
            imgRef={imgRef}
            hoverCoords={hoverCoords}
            onMouseMove={handleImageMouseMove}
            onMouseLeave={handleImageMouseLeave}
            onClick={handleImageClick}
            clickable={canTarget}
            marker={marker}
            hint={canTarget ? "Click the minimap to set a target" : null}
          />
        </div>

        {/* Right: agent, action, chat (42%) */}
        <div className="flex min-h-0 w-[42%] flex-col gap-2">
          {/* Your agent */}
          <div className={cn("flex-shrink-0", card)}>
            <div className="flex items-center gap-2 border-b px-3 py-2.5">
              <AgentIcon className={cn("h-4 w-4", meta.text)} />
              <span className="text-sm font-semibold">{myLabel}</span>
              <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-stone-700">
                <span className={cn("h-2 w-2 rounded-full", alive ? "bg-green-500" : "bg-red-500")} />
                {alive ? "Alive" : "Destroyed"}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-3 px-3 py-2.5">
              <div className="flex flex-col gap-0.5">
                <span className="text-[11px] leading-[14px] text-muted-foreground">Position</span>
                <span className="font-mono text-[13px] tabular leading-[18px]">{position ? `(${position[0]}, ${position[1]})` : "—"}</span>
              </div>
              {showsWater ? (
                <div className="flex flex-col gap-0.5">
                  <span className="text-[11px] leading-[14px] text-muted-foreground">Water</span>
                  <span className="font-mono text-[13px] tabular leading-[18px]">{Math.round(extra![1])}/5</span>
                </div>
              ) : carrying !== null ? (
                <div className="flex flex-col gap-0.5">
                  <span className="text-[11px] leading-[14px] text-muted-foreground">Carrying</span>
                  <span className="text-[13px] leading-[18px]">{carrying}</span>
                </div>
              ) : (
                <div />
              )}
              <div className="flex flex-col gap-0.5">
                <span className="text-[11px] leading-[14px] text-muted-foreground">Team</span>
                <span className="inline-flex items-center gap-1 truncate text-[13px] leading-[18px]">
                  {myManager ? (
                    <>
                      <ManagerCrown className="h-3 w-3 text-blue-600" />
                      {teamNameOf(myManager) ? `${teamNameOf(myManager)} · ` : ""}
                      {label(myManager)}
                    </>
                  ) : (
                    "—"
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Action */}
          <div className={cn("flex-shrink-0", card)}>
            {aiRun ? (
              <div className="flex flex-col gap-1.5 px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-brand" />
                  <span className="text-[13px] font-semibold">This agent is run by the AI</span>
                </div>
                {observation.data?.options?.[0]?.description && (
                  <p className="text-xs text-stone-700">Now: {friendly(observation.data.options[0].description)}</p>
                )}
              </div>
            ) : hasActed ? (
              <>
                <div className="flex items-baseline justify-between gap-2 px-3 pb-2 pt-2.5">
                  <span className="text-[13px] font-semibold">Action</span>
                  <span className="text-xs text-muted-foreground">Step {currentTimestep}</span>
                </div>
                <div className="flex items-center gap-2.5 px-3 pb-2.5">
                  <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-green-200 bg-green-50">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  </div>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-sm font-semibold">Submitted</span>
                    {lastAction && <span className="truncate font-mono text-xs tabular text-stone-700">{lastAction}</span>}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 rounded-b-lg border-t bg-background px-3 py-2.5">
                  {waitingOn.length > 0 ? (
                    <>
                      <span className="text-xs text-stone-700">Waiting for</span>
                      {waitingOn.map((name) => (
                        <Badge key={name} variant="outline" className="gap-1 font-semibold">
                          <Loader2 className="h-2.5 w-2.5 animate-spin text-muted-foreground" />
                          {name}
                        </Badge>
                      ))}
                    </>
                  ) : (
                    <span className="text-xs text-stone-700">Everyone has acted. Running the step…</span>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="px-3 pb-2 pt-2.5 text-[13px] font-semibold">Action</div>
                <div className="flex flex-wrap gap-1.5 px-3">
                  {Object.entries(ACTION_DEFINITIONS[agentType] || {}).map(([type, def]) => {
                    const active = Number(type) === selectedActionType
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setSelectedActionType(Number(type))}
                        className={cn(
                          "inline-flex h-[30px] items-center rounded-md border px-2.5 text-[13px] font-medium transition-colors",
                          active ? "border-brand bg-brand text-white" : "bg-card hover:bg-muted",
                        )}
                      >
                        {def.name}
                      </button>
                    )
                  })}
                </div>
                {currentActionDef?.needsCoords && (
                  <div className="flex items-center gap-2 px-3 pt-2.5">
                    <span className="text-xs font-medium">Target</span>
                    <span className="text-[11px] text-muted-foreground">X</span>
                    <Input
                      type="number"
                      aria-label="Target X"
                      value={actionParam1}
                      onChange={(e) => setActionParam1(Number.parseInt(e.target.value) || 0)}
                      className="h-8 w-[76px] font-mono text-[13px]"
                    />
                    <span className="text-[11px] text-muted-foreground">Y</span>
                    <Input
                      type="number"
                      aria-label="Target Y"
                      value={actionParam2}
                      onChange={(e) => setActionParam2(Number.parseInt(e.target.value) || 0)}
                      className="h-8 w-[76px] font-mono text-[13px]"
                    />
                  </div>
                )}
                <div className="px-3 pb-3 pt-2.5">
                  <Button className="w-full" onClick={handleSubmitAction} disabled={!alive || waitingForNextTimestep}>
                    Submit action
                  </Button>
                </div>
              </>
            )}
          </div>

          {/* Chat */}
          <div className={cn("flex min-h-0 flex-1 flex-col overflow-hidden", card)}>
            <div className="flex flex-shrink-0 items-center gap-2 border-b bg-background px-2.5 py-2">
              <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
              {chats.length > 0 ? (
                <Segmented
                  aria-label="Chat"
                  value={selectedChatId || chats[0].id}
                  onChange={setSelectedChatId}
                  options={chats.map((c) => ({ value: c.id, label: chatTitle(c.id) }))}
                />
              ) : (
                <span className="text-[13px] text-muted-foreground">Chat</span>
              )}
              {selectedChat && (
                <span className="ml-auto truncate text-[11px] text-muted-foreground" title={selectedChat.participants.map(label).join(", ")}>
                  {selectedChat.participants.length} in this chat
                </span>
              )}
            </div>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2.5">
              {filteredMessages.length > 0 ? (
                filteredMessages.map((msg: Message, i: number) => {
                  const mine = msg.sender === playerName
                  const fromAgent = agentIdFromName(msg.sender) !== null
                  // The backend sends team-chat messages as {sender, message, timestamp}
                  const text = friendly(msg.content ?? (msg as any).message ?? "")
                  const key = msg.id ?? `${msg.timestamp}-${i}`
                  return fromAgent ? (
                    <ChatBubble key={key} who="agent" name={senderLine(msg)} text={text} time={msg.timestamp} />
                  ) : (
                    <ChatBubble key={key} who="human" mine={mine} name={senderLine(msg)} text={text} time={msg.timestamp} />
                  )
                })
              ) : (
                <div className="py-6 text-center text-stone-400">
                  <MessageSquare className="mx-auto mb-1 h-7 w-7 opacity-40" />
                  <p className="text-xs">No messages yet</p>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="flex flex-shrink-0 gap-1.5 border-t p-2">
              <Input
                placeholder={selectedChat ? `Message ${chatTitle(selectedChat.id)}…` : "Select a chat"}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    handleSendMessage()
                  }
                }}
                disabled={!selectedChatId}
                className="h-9 text-[13px]"
              />
              <Button size="icon" onClick={handleSendMessage} disabled={!message.trim() || !selectedChatId} className="h-9 w-9 flex-shrink-0">
                <Send className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </div>
      {stopGameDialog}
      {announcementPopup}
    </div>
  )
}

