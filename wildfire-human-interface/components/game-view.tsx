"use client"

import { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { Loader2, Send, Clock, MessageSquare, Eye, PlayCircle, ChevronRight, ChevronDown, StopCircle, Activity, Bot, User, Crown, Flame, Truck, Camera, Plane, Timer } from "lucide-react"
import { API_BASE_URL } from "@/lib/constants"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import TeamOrgChart from "@/components/TeamOrgChart"
import TeamTreeView from "@/components/TeamTreeView"
import AgentDetailCard from "@/components/AgentDetailCard"
import { AnnouncementPopup } from "@/components/AnnouncementPopup"

interface GameViewProps {
  lobbyId: string
  playerName: string
  role: string
  communicationMode: string
  collaborationMode: string
  hierarchy: Record<string, string[]>
  agentId: number
  isManager: boolean
  isCreator: boolean
  onGameStop?: () => void
}

interface Message {
  id: string
  sender: string
  sender_role: string
  content: string
  timestamp: string
  recipients: string[]
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
    0: { name: "Do Nothing", needsCoords: false },
    1: { name: "Move to Location", needsCoords: true },
    2: { name: "Cut Tree", needsCoords: false },
    3: { name: "Pick up Civilian", needsCoords: false },
    4: { name: "Drop off Civilian", needsCoords: false },
    5: { name: "Spray Water", needsCoords: true },
    6: { name: "Refill Water", needsCoords: false },
  },
  1: {
    // Bulldozer
    0: { name: "Do Nothing", needsCoords: false },
    1: { name: "Move to Location", needsCoords: true },
    2: { name: "Move while Cutting Trees", needsCoords: true },
  },
  2: {
    // Drone
    0: { name: "Do Nothing", needsCoords: false },
    1: { name: "Move to Location", needsCoords: true },
  },
  3: {
    // Helicopter
    0: { name: "Do Nothing", needsCoords: false },
    1: { name: "Move to Location", needsCoords: true },
    2: { name: "Pick up Firefighters", needsCoords: false },
    3: { name: "Drop off Firefighters", needsCoords: false },
    4: { name: "Refill Water", needsCoords: false },
    5: { name: "Deploy Water", needsCoords: false },
  },
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
  const [feedback, setFeedback] = useState("")
  const [currentTimestep, setCurrentTimestep] = useState<number>(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const pollingInterval = useRef<NodeJS.Timeout | null>(null)
  const gameStartTimeRef = useRef<number>(Date.now())
  const [elapsedTime, setElapsedTime] = useState<string>("0:00")
  const [chats, setChats] = useState<any[]>([])
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null)

  const [teamViewMode, setTeamViewMode] = useState<'orgchart' | 'tree'>('orgchart')
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

  // Hover-to-see-coordinates state
  const [hoverCoords, setHoverCoords] = useState<{ gridX: number; gridY: number; label?: string } | null>(null)
  const imgRef = useRef<HTMLImageElement>(null)

  // Determine available recipients based on hierarchy and communication mode
  useEffect(() => {
    let connections: string[] = []
    if (communicationMode === "team_chat") {
      connections = ["team_chat"]
    } else {
      if (!isManager) {
        let agentManager = null
        for (const [manager, children] of Object.entries(hierarchy)) {
          if (children.includes(role)) {
            agentManager = manager
            break
          }
        }
        if (agentManager) {
          connections.push(`team_${agentManager}`)
          const teamMembers = hierarchy[agentManager] || []
          connections.push(...teamMembers)
          connections.push(agentManager)
        }
      } else {
        connections.push(`subteam_${role}`)
        const subteamMembers = hierarchy[role] || []
        connections.push(...subteamMembers)
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

  // Fetch observations from the new API
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

        if (data.error && (data.error.includes("initializing") || data.error.includes("Waiting for observations"))) {
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

        setGameState((prev) => ({
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
        } as GameState))

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
              name: id.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()),
              participants: data.participants || [],
              messages: data.messages || []
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
          message: message,
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
            name: id.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()),
            participants: data.participants || [],
            messages: data.messages || []
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
        title: "Error",
        description: "Failed to send message. Please try again.",
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
          title: "Invalid Action",
          description: "Selected action is not valid for this agent type.",
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

      const result = await response.json()

      setGameState((prev) => ({
        ...prev,
        players: {
          ...prev?.players,
          [playerName]: {
            ...prev?.players?.[playerName],
            has_acted: true,
            role: role,
          },
        },
      } as GameState))

      setSelectedActionType(0)
      setActionParam1(0)
      setActionParam2(0)

      toast({
        title: "Action Submitted",
        description: result.message || "Your action has been submitted for this turn.",
      })
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to submit action. Please try again.",
        variant: "destructive",
      })
    }
  }

  const handleSubmitFeedback = async () => {
    if (!feedback.trim()) {
      toast({
        title: "Empty Feedback",
        description: "Please enter some feedback before submitting.",
        variant: "destructive",
      })
      return
    }

    try {
      const response = await fetch(`${API_BASE_URL}/submit_feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lobby_id: lobbyId,
          player_name: playerName,
          agent_id: agentId,
          feedback: feedback,
          timestep: currentTimestep,
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to submit feedback")
      }

      setFeedback("")
      toast({
        title: "Feedback Accepted",
        description: `Your feedback will take effect at timestep ${currentTimestep + 2}.`,
      })
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to submit feedback. Please try again.",
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
      toast({ title: "Game Stopped", description: "The game has been stopped." })
      setShowStopConfirm(false)
      onGameStop?.()
    } catch {
      toast({ title: "Error", description: "Failed to stop game.", variant: "destructive" })
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
        const res = await fetch(
          `${API_BASE_URL}/events?lobby_id=${lobbyId}&since_seq=${latestEventSeq}`
        )
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
          setThinkingAgentIds(prev => {
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
          const announcements = newEvents.filter(e => e.event_type === "announcement" || e.event_type === "agent_destroyed")
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
          if (newMessages.filter(m => m.type !== "tldr" && m.type !== "fast_feedback_queued").length > 0) {
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
      setElapsedTime(`${minutes}:${seconds.toString().padStart(2, '0')}`)
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
    const inputCopy = chatInput
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
        title: "Error",
        description: "Failed to send message. Please try again.",
        variant: "destructive",
      })
    }
  }

  const hasActed = gameState?.players[playerName]?.has_acted || false
  const observation = gameState?.observations[agentId] || { image_url: null, data: {} }

  // --- Hover-to-see-coordinates ---
  const pixelToGridCoords = (
    px: number, py: number,
    metadata: any
  ): { gridX: number; gridY: number; label?: string } | null => {
    if (metadata.type === "worker") {
      const mm = metadata.minimap
      if (mm?.bounds && px >= mm.pixel_x && px < mm.pixel_x + mm.pixel_width
          && py >= mm.pixel_y && py < mm.pixel_y + mm.pixel_height) {
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
      if (acc?.bounds && px >= acc.pixel_x && px < acc.pixel_x + acc.pixel_width
          && py >= acc.pixel_y && py < acc.pixel_y + acc.pixel_height) {
        const relX = (px - acc.pixel_x) / acc.pixel_width
        const relY = (py - acc.pixel_y) / acc.pixel_height
        return {
          gridX: Math.round(acc.bounds.grid_min_x + relX * (acc.bounds.grid_max_x - acc.bounds.grid_min_x)),
          gridY: Math.round(acc.bounds.grid_min_y + relY * (acc.bounds.grid_max_y - acc.bounds.grid_min_y)),
          label: "Accumulative",
        }
      }

      const cg = metadata.children_grid
      if (cg && px >= cg.pixel_x && px < cg.pixel_x + cg.pixel_width
          && py >= cg.pixel_y && py < cg.pixel_y + cg.pixel_height) {
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
              label: `Agent ${worker.id}`,
            }
          }
        }
      }
    }
    return null
  }

  const handleImageMouseMove = (e: React.MouseEvent<HTMLImageElement>) => {
    const img = imgRef.current
    const metadata = observation.data?.image_coord_metadata
    if (!img || !metadata) { setHoverCoords(null); return }

    const rect = img.getBoundingClientRect()
    const natW = metadata.total_width
    const natH = metadata.total_height
    const scale = Math.min(rect.width / natW, rect.height / natH)
    const offX = (rect.width - natW * scale) / 2
    const offY = (rect.height - natH * scale) / 2

    const imgPx = (e.clientX - rect.left - offX) / scale
    const imgPy = (e.clientY - rect.top - offY) / scale

    if (imgPx < 0 || imgPx >= natW || imgPy < 0 || imgPy >= natH) {
      setHoverCoords(null); return
    }
    setHoverCoords(pixelToGridCoords(imgPx, imgPy, metadata))
  }

  const handleImageMouseLeave = () => setHoverCoords(null)

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

  // Filter chat messages by selected agent (show tldr to all, others only for selected agent)
  const filteredChatMessages = selectedAgentId !== null
    ? chatMessages.filter(msg => msg.agentId === selectedAgentId)
    : chatMessages

  // Icon map for agent types (used in chat header)
  const AGENT_TYPE_ICONS: Record<number, typeof Flame> = {
    [-1]: Crown,
    0: Flame,
    1: Truck,
    2: Camera,
    3: Plane,
  }

  // Announcement popup for game events
  const announcementPopup = (
    <AnnouncementPopup
      announcement={activeAnnouncement}
      onDismiss={() => setActiveAnnouncement(null)}
    />
  )

  // Shared stop game confirmation dialog (creator only)
  const stopGameDialog = isCreator ? (
    <Dialog open={showStopConfirm} onOpenChange={setShowStopConfirm}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Stop Game?</DialogTitle>
          <DialogDescription>
            This will immediately terminate the game for all players and kill the simulation. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowStopConfirm(false)} disabled={isStopping}>Cancel</Button>
          <Button variant="destructive" onClick={handleStopGame} disabled={isStopping}>
            {isStopping && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Yes, Stop Game
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ) : null

  // ============================================================
  // HORIZONTAL LAYOUT for human_feedback mode with manager agent
  // ============================================================
  if (collaborationMode === 'human_feedback' && (observation.data?.type === -1 || observation.data?.type === undefined)) {
    const agentCount = getAgentCount()

    return (
      <div className="h-screen flex flex-col p-3 overflow-hidden">
        {/* Top Bar - Mission + Timestep + Player */}
        <div className="flex items-center gap-3 mb-2">
          <div className="flex-1 flex items-center gap-1 px-2 py-1">
            <span className="font-medium text-gray-700 flex-shrink-0 text-sm">Mission:</span>
            <span className="text-gray-600 text-xs truncate" title={observation.data?.task_description}>
              {observation.data?.task_description || "No mission"}
            </span>
          </div>
          {/* Keep the badges and stop button div that follows */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <Badge variant="outline" className="text-sm font-bold px-3 py-1">
              <Clock className="h-4 w-4 mr-1" />
              T: {currentTimestep}
            </Badge>
            <Badge variant="outline" className="text-sm px-3 py-1">
              <Timer className="h-4 w-4 mr-1" />
              {elapsedTime}
            </Badge>
            <Badge className="text-xs">{playerName}</Badge>
            {isCreator && (
              <Button variant="destructive" size="sm" className="h-7 px-2 text-xs"
                onClick={() => setShowStopConfirm(true)}>
                <StopCircle className="h-3 w-3 mr-1" /> Stop Game
              </Button>
            )}
          </div>
        </div>

        {observation.data?.reward_target && observation.data.reward_target.target > 0 && (
          <div className="mb-2 px-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-gray-500 flex-shrink-0">{observation.data.reward_target.label}</span>
              <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                <div
                  className="bg-green-500 h-1.5 rounded-full transition-all"
                  style={{ width: `${Math.min(((observation.data.rewards?.[observation.data.reward_target.index] || 0) / observation.data.reward_target.target) * 100, 100)}%` }}
                />
              </div>
              <span className="text-[10px] text-gray-500 flex-shrink-0">
                {observation.data.rewards?.[observation.data.reward_target.index] || 0}/{observation.data.reward_target.target}
              </span>
            </div>
          </div>
        )}

        {/* Main Content - Horizontal Split */}
        <div className="flex-1 flex gap-3 min-h-0">
          {/* Left: Observation Image + Activity Feed (55%) */}
          <div className="w-[55%] flex flex-col gap-2 min-h-0">
            <div className="flex-1 flex items-center justify-center bg-gray-100 rounded-lg border overflow-hidden min-h-0 relative">
              {waitingForNextTimestep ? (
                <div className="text-center space-y-3">
                  <Loader2 className="h-10 w-10 animate-spin mx-auto text-blue-600" />
                  <div>
                    <p className="text-blue-700 font-semibold">Waiting for next observation</p>
                    <p className="text-blue-600 text-sm">Processing next timestep...</p>
                  </div>
                </div>
              ) : observation.image_url ? (
                <>
                  <img
                    ref={imgRef}
                    src={observation.image_url}
                    alt="Observation"
                    className="max-h-full max-w-full object-contain"
                    onMouseMove={handleImageMouseMove}
                    onMouseLeave={handleImageMouseLeave}
                  />
                  {hoverCoords && (
                    <div className="absolute top-2 left-2 bg-black/75 text-white text-xs px-2 py-1 rounded pointer-events-none font-mono z-10">
                      ({hoverCoords.gridX}, {hoverCoords.gridY}){hoverCoords.label ? ` - ${hoverCoords.label}` : ''}
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center text-gray-400">
                  <Eye className="h-12 w-12 mx-auto mb-2" />
                  <p className="font-medium">No observation available</p>
                </div>
              )}
            </div>

          </div>

          {/* Right: Team + Chat + Activity (45%) */}
          <div className="w-[45%] flex flex-col gap-2 min-h-0">
            {/* Team Header with View Toggle + Phase Banner */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-sm font-medium text-gray-600">
                Team ({agentCount} agents)
              </span>
              {/* Phase status banner */}
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ml-1 ${
                currentPhase === "status"
                  ? "bg-blue-50 text-blue-700 border-blue-200"
                  : currentPhase === "action"
                  ? "bg-orange-50 text-orange-700 border-orange-200"
                  : currentPhase === "env_step"
                  ? "bg-green-50 text-green-700 border-green-200"
                  : "bg-gray-50 text-gray-500 border-gray-200"
              }`}>
                {currentPhase === "status"
                  ? "STATUS PHASE"
                  : currentPhase === "action"
                  ? "ACTION PHASE"
                  : currentPhase === "env_step"
                  ? "EXECUTING"
                  : "IDLE"}
              </span>
              <div className="ml-auto flex gap-1">
                <Button
                  variant={teamViewMode === 'orgchart' ? 'default' : 'outline'}
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => setTeamViewMode('orgchart')}
                  title="Org chart view"
                >
                  Graph
                </Button>
                <Button
                  variant={teamViewMode === 'tree' ? 'default' : 'outline'}
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => setTeamViewMode('tree')}
                  title="Tree list view"
                >
                  List
                </Button>
              </div>
            </div>

            {/* Team View Content */}
            <div className="h-[40%] overflow-auto min-h-0 border rounded-lg bg-white flex">
              <div className={`overflow-auto ${teamViewMode === 'tree' && selectedAgentId !== null ? 'w-1/2 border-r' : 'w-full'}`}>
                {teamViewMode === 'orgchart' ? (
                  <TeamOrgChart
                    rootAgent={observation.data}
                    childrenData={observation.data?.children_data || {}}
                    rootAgentId={agentId}
                    selectedAgentId={selectedAgentId}
                    onAgentSelect={setSelectedAgentId}
                    thinkingAgentIds={thinkingAgentIds}
                    destroyedAgentIds={destroyedAgentIds}
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
                    disableHover={true}
                  />
                )}
              </div>
              {teamViewMode === 'tree' && selectedAgentId !== null && (() => {
                const selectedData = getSelectedAgentData()
                return selectedData ? (
                  <div className="w-1/2 p-2 overflow-y-auto">
                    <AgentDetailCard agent={selectedData} />
                  </div>
                ) : null
              })()}
            </div>

            {/* Chat Panel */}
            <div className="flex-1 flex flex-col min-h-0 border rounded-lg bg-white overflow-hidden">
              {/* Chat header */}
              <div className="flex items-center gap-2 px-3 py-2 border-b flex-shrink-0 bg-gray-50">
                <MessageSquare className="h-4 w-4 text-gray-500 flex-shrink-0" />
                {selectedAgentId !== null ? (() => {
                  if (selectedAgentId === agentId) {
                    return (
                      <span className="text-xs font-semibold text-gray-600">
                        Chat — <span className="font-bold">{role} (you)</span>
                      </span>
                    )
                  }
                  const ad = observation.data?.children_data?.[String(selectedAgentId)]
                  const agentType: number = ad?.type ?? 0
                  const AgentIcon = AGENT_TYPE_ICONS[agentType] ?? Flame
                  const agentLabel = ad
                    ? (ad.name || (agentType === -1 ? "Manager" : agentType === 0 ? "Firefighter" : agentType === 1 ? "Bulldozer" : agentType === 2 ? "Drone" : "Helicopter"))
                    : `Agent`
                  return (
                    <span className="text-xs font-semibold text-gray-600 flex items-center gap-1">
                      Chat —
                      <AgentIcon className="h-3 w-3 flex-shrink-0" />
                      <span className="font-bold">{agentLabel}</span>
                      {selectedAgentId !== null && destroyedAgentIds.has(selectedAgentId) && (
                        <span className="text-[10px] font-bold text-red-600 bg-red-100 px-1.5 py-0.5 rounded ml-1">DESTROYED</span>
                      )}
                    </span>
                  )
                })() : (
                  <span className="text-xs font-semibold text-gray-600">
                    Chat — select an agent above
                  </span>
                )}
              </div>

              {/* Message log */}
              <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-0">
                {filteredChatMessages.length === 0 ? (
                  <div className="text-center text-gray-400 py-6">
                    <MessageSquare className="h-7 w-7 mx-auto mb-1 opacity-40" />
                    <p className="text-xs">Select an agent and send a message</p>
                  </div>
                ) : (
                  filteredChatMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex gap-1.5 ${msg.role === "human" ? "justify-end" : "justify-start"}`}
                    >
                      {msg.role === "agent" && (
                        <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <Bot className="h-3 w-3 text-blue-600" />
                        </div>
                      )}
                      <div className={`max-w-[78%] rounded-lg px-2.5 py-1.5 text-xs leading-relaxed ${
                        msg.role === "human"
                          ? "bg-blue-600 text-white"
                          : msg.type === "question_answer"
                          ? "bg-purple-50 border border-purple-200 text-gray-800"
                          : msg.type === "slow_feedback_preview"
                          ? "bg-amber-50 border border-amber-200 text-gray-800"
                          : msg.type === "fast_feedback_queued" || msg.type === "fast_feedback_report"
                          ? "bg-orange-50 border border-orange-200 text-gray-800"
                          : msg.type === "tldr"
                          ? "bg-teal-50 border border-teal-200 text-gray-800"
                          : "bg-gray-100 text-gray-800"
                      }`}>
                        <p>{msg.content}</p>
                        <div className="text-[10px] opacity-50 mt-0.5 text-right">
                          {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </div>
                      {msg.role === "human" && (
                        <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <User className="h-3 w-3 text-white" />
                        </div>
                      )}
                    </div>
                  ))
                )}
                {isWaitingForReply && (
                  <div className="flex gap-1.5 justify-start">
                    <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Bot className="h-3 w-3 text-blue-600" />
                    </div>
                    <div className="bg-gray-100 rounded-lg px-3 py-2 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Chat input */}
              <div className="flex gap-1.5 p-2 border-t flex-shrink-0">
                <Input
                  placeholder={selectedAgentId !== null && destroyedAgentIds.has(selectedAgentId) ? "This agent has been destroyed" : selectedAgentId !== null ? "Message agent..." : "Select an agent first"}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault()
                      handleSendChat()
                    }
                  }}
                  disabled={selectedAgentId === null || destroyedAgentIds.has(selectedAgentId ?? -1)}
                  className="h-8 text-xs"
                />
                <Button
                  size="icon"
                  onClick={handleSendChat}
                  disabled={!chatInput.trim() || selectedAgentId === null || destroyedAgentIds.has(selectedAgentId ?? -1)}
                  className="h-8 w-8 flex-shrink-0"
                >
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
  // ORIGINAL LAYOUT for human_control mode or non-manager agents
  // ============================================================
  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">CREW-Wildfire</h1>
        <Badge variant="outline" className="text-base px-4 py-2 font-semibold">
          Playing as: {playerName}
        </Badge>
      </div>

      {observation.data?.task_description && (
        <div className="mb-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-semibold text-blue-700">Mission Objective</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-gray-800 leading-relaxed">{observation.data.task_description}</p>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        {/* Game Status */}
        <div className="lg:col-span-2 mb-2">
          <Card>
            <CardHeader className="pb-4">
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <CardTitle className="text-xl font-semibold">Game: {lobbyId}</CardTitle>
                  <Badge variant="outline" className="capitalize font-medium">
                    {gameState?.phase || "Input Phase"}
                  </Badge>
                </div>
                {isCreator && (
                  <Button variant="destructive" size="sm" onClick={() => setShowStopConfirm(true)}>
                    <StopCircle className="h-4 w-4 mr-2" /> Stop Game
                  </Button>
                )}
              </div>
            </CardHeader>
          </Card>
        </div>

        {/* Left Column - Observation */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex justify-between items-center">
                <CardTitle className="text-lg flex items-center">
                  <Eye className="h-5 w-5 mr-2" />
                  Observation
                </CardTitle>
                <Badge>{role}</Badge>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              {waitingForNextTimestep ? (
                <div className="h-[300px] bg-blue-50 rounded-lg flex items-center justify-center mb-6 border-2 border-blue-200">
                  <div className="text-center space-y-3">
                    <Loader2 className="h-10 w-10 animate-spin mx-auto text-blue-600" />
                    <div>
                      <p className="text-blue-700 font-semibold text-lg">Waiting for next observation</p>
                      <p className="text-blue-600 text-sm mt-1">All actions submitted, processing next timestep...</p>
                    </div>
                  </div>
                </div>
              ) : observation.image_url ? (
                <div className="mb-6 relative">
                  <img
                    ref={imgRef}
                    src={observation.image_url}
                    alt={`Observation for ${role}`}
                    className="w-full rounded-lg border shadow-sm"
                    onMouseMove={handleImageMouseMove}
                    onMouseLeave={handleImageMouseLeave}
                  />
                  {hoverCoords && (
                    <div className="absolute top-2 left-2 bg-black/75 text-white text-xs px-2 py-1 rounded pointer-events-none font-mono z-10">
                      ({hoverCoords.gridX}, {hoverCoords.gridY}){hoverCoords.label ? ` - ${hoverCoords.label}` : ''}
                    </div>
                  )}
                </div>
              ) : (
                <div className="h-[300px] bg-gray-50 rounded-lg flex items-center justify-center mb-6 border-2 border-dashed border-gray-300">
                  <div className="text-center">
                    <Eye className="h-8 w-8 mx-auto text-gray-400 mb-2" />
                    <p className="text-gray-500 font-medium">No observation image available</p>
                  </div>
                </div>
              )}

              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  <h3 className="text-lg font-semibold">Agent Status</h3>
                  <Badge variant="secondary" className="font-medium">{role}</Badge>
                </div>

                {!waitingForNextTimestep && (
                  <div className="grid gap-3">
                    <Card className="p-4 bg-gray-50">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-semibold text-gray-700">Agent Type</span>
                        <Badge variant="secondary" className="font-medium">
                          {observation.data?.type === -1 ? "Manager"
                            : observation.data?.type === 0 ? "Firefighter"
                            : observation.data?.type === 1 ? "Bulldozer"
                            : observation.data?.type === 2 ? "Drone"
                            : observation.data?.type === 3 ? "Helicopter"
                            : "Unknown"}
                        </Badge>
                      </div>
                    </Card>

                    {observation.data?.type !== -1 && observation.data?.last_position && (
                      <Card className="p-4 bg-gray-50">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-semibold text-gray-700">Current Position</span>
                          <Badge variant="outline" className="font-medium">
                            ({observation.data.last_position[0]}, {observation.data.last_position[1]})
                          </Badge>
                        </div>
                      </Card>
                    )}
                  </div>
                )}
              </div>

              {/* Action Input for human_control mode */}
              <div className="mt-6 pt-6 border-t">
                {hasActed ? (
                  <div className="text-center py-8 space-y-3">
                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                      <PlayCircle className="h-8 w-8 text-green-600" />
                    </div>
                    <div>
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 font-medium px-4 py-2">
                        Action Submitted
                      </Badge>
                      <p className="text-sm text-gray-600 mt-2">
                        Waiting for other players to submit their actions...
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 mb-4">
                      <h3 className="text-lg font-semibold">Action Input</h3>
                      <PlayCircle className="h-5 w-5 text-gray-500" />
                    </div>

                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="action-type" className="text-sm font-semibold">Action Type</Label>
                        <Select
                          value={selectedActionType.toString()}
                          onValueChange={(value) => setSelectedActionType(Number.parseInt(value))}
                        >
                          <SelectTrigger className="h-11">
                            <SelectValue placeholder="Select action type" />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(ACTION_DEFINITIONS[observation.data?.type ?? 0] || {}).map(
                              ([type, def]) => (
                                <SelectItem key={type} value={type} className="py-3">
                                  <div className="font-medium">{def.name}</div>
                                </SelectItem>
                              ),
                            )}
                          </SelectContent>
                        </Select>
                      </div>

                      {ACTION_DEFINITIONS[observation.data?.type ?? 0]?.[selectedActionType]?.needsCoords && (
                        <div className="space-y-2">
                          <Label className="text-sm font-semibold">Target Coordinates</Label>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <Label htmlFor="param1" className="text-xs text-gray-600">X Coordinate</Label>
                              <Input
                                id="param1"
                                type="number"
                                value={actionParam1}
                                onChange={(e) => setActionParam1(Number.parseInt(e.target.value) || 0)}
                                placeholder="X"
                                className="h-11"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label htmlFor="param2" className="text-xs text-gray-600">Y Coordinate</Label>
                              <Input
                                id="param2"
                                type="number"
                                value={actionParam2}
                                onChange={(e) => setActionParam2(Number.parseInt(e.target.value) || 0)}
                                placeholder="Y"
                                className="h-11"
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      <Button className="w-full h-12 text-base font-semibold" onClick={handleSubmitAction}>
                        <PlayCircle className="h-5 w-5 mr-2" />
                        Submit Action
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Communication */}
        <div>
          <Card className="h-full flex flex-col min-h-[200px]">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center">
                <MessageSquare className="h-5 w-5 mr-2" />
                Communication
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-grow flex flex-col p-6">
              <div className="mb-4">
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Available Chats</h4>
                <div className="flex flex-col space-y-2">
                  {chats.map((chat) => (
                    <Button
                      key={chat.id}
                      variant={chat.id === selectedChatId ? "default" : "outline"}
                      className="w-full justify-start text-left font-medium h-11"
                      onClick={() => setSelectedChatId(chat.id)}
                    >
                      <MessageSquare className="h-4 w-4 mr-2 flex-shrink-0" />
                      <span className="truncate">{chat.name}</span>
                    </Button>
                  ))}
                </div>
              </div>

              <div className="flex-grow flex flex-col">
                <div className="flex items-center gap-2 mb-3">
                  <h4 className="text-sm font-semibold text-gray-700">Messages</h4>
                  {selectedChat && (
                    <Badge variant="outline" className="text-xs">
                      {selectedChat.participants.length} participants
                    </Badge>
                  )}
                </div>

                <ScrollArea className="flex-grow border rounded-lg p-4 mb-4 bg-gray-50">
                  <div className="space-y-4">
                    {filteredMessages.length > 0 ? (
                      filteredMessages.map((msg: Message) => (
                        <div
                          key={msg.id}
                          className={`p-3 rounded-lg shadow-sm ${
                            msg.sender === playerName
                              ? "bg-primary/10 ml-8 border border-primary/20"
                              : "bg-white mr-8 border"
                          }`}
                        >
                          <div className="flex justify-between items-start text-xs text-gray-500 mb-2">
                            <span className="font-semibold">
                              {msg.sender}
                              <span className="font-normal text-gray-400 ml-1">({msg.sender_role})</span>
                            </span>
                            <span>{new Date(msg.timestamp).toLocaleTimeString()}</span>
                          </div>
                          <p className="text-sm leading-relaxed">{msg.content}</p>
                        </div>
                      ))
                    ) : (
                      <div className="text-center text-gray-500 py-8">
                        <MessageSquare className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                        <p className="font-medium">No messages yet</p>
                        <p className="text-xs mt-1">Start the conversation!</p>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                </ScrollArea>

                <div className="space-y-2">
                  <div className="flex space-x-2">
                    <Input
                      placeholder="Type your message..."
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault()
                          handleSendMessage()
                        }
                      }}
                      className="h-11"
                    />
                    <Button
                      size="icon"
                      onClick={handleSendMessage}
                      disabled={!message.trim() || !selectedChatId}
                      className="h-11 w-11"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="text-xs text-gray-500 px-1">
                    {selectedChat ? (
                      <span>
                        <strong>Participants:</strong> {selectedChat.participants.join(", ")}
                      </span>
                    ) : (
                      "Select a chat to view messages"
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      {stopGameDialog}
        {announcementPopup}
    </div>
  )
}
