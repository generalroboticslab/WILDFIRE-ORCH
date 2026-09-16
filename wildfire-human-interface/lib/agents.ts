import { Crown, Flame, Truck, Camera, Plane, Users, type LucideIcon } from "lucide-react"

// Single source of truth for everything agent-type related: labels, icons, colors, naming.
//
// Agent ids are shared across types and come from the algorithm: workers are numbered
// firefighters first, then bulldozers, drones, helicopters (AGENT_1..N), and managers
// continue the sequence in list order. The interface shows "<Type> <id>" (e.g. "Drone 12"
// for AGENT_12) so a name typed in chat or feedback maps to exactly one agent.

export type AgentType = -1 | 0 | 1 | 2 | 3

export interface AgentTypeMeta {
  type: AgentType
  key: "manager" | "firefighter" | "bulldozer" | "drone" | "helicopter"
  label: string
  plural: "managers" | "firefighters" | "bulldozers" | "drones" | "helicopters"
  icon: LucideIcon
  text: string
  bg: string
  border: string
  hex: string
}

export const AGENT_TYPES: Record<AgentType, AgentTypeMeta> = {
  [-1]: { type: -1, key: "manager", label: "Manager", plural: "managers", icon: Crown, text: "text-blue-600", bg: "bg-blue-50", border: "border-blue-300", hex: "#2563eb" },
  0: { type: 0, key: "firefighter", label: "Firefighter", plural: "firefighters", icon: Flame, text: "text-red-500", bg: "bg-red-50", border: "border-red-300", hex: "#ef4444" },
  1: { type: 1, key: "bulldozer", label: "Bulldozer", plural: "bulldozers", icon: Truck, text: "text-amber-600", bg: "bg-amber-50", border: "border-amber-300", hex: "#d97706" },
  2: { type: 2, key: "drone", label: "Drone", plural: "drones", icon: Camera, text: "text-violet-500", bg: "bg-violet-50", border: "border-violet-300", hex: "#8b5cf6" },
  3: { type: 3, key: "helicopter", label: "Helicopter", plural: "helicopters", icon: Plane, text: "text-sky-500", bg: "bg-sky-50", border: "border-sky-300", hex: "#0ea5e9" },
}

export const UNKNOWN_TYPE: AgentTypeMeta = {
  type: 0,
  key: "firefighter",
  label: "Agent",
  plural: "firefighters",
  icon: Users,
  text: "text-stone-500",
  bg: "bg-stone-50",
  border: "border-stone-300",
  hex: "#78716c",
}

// Worker types in the order the algorithm numbers them.
export const WORKER_TYPE_ORDER: AgentType[] = [0, 1, 2, 3]

export interface LevelAgents {
  firefighters: number
  bulldozers: number
  drones: number
  helicopters: number
}

export const EMPTY_LEVEL_AGENTS: LevelAgents = { firefighters: 0, bulldozers: 0, drones: 0, helicopters: 0 }

export function agentMeta(type: number | null | undefined): AgentTypeMeta {
  if (type === -1 || type === 0 || type === 1 || type === 2 || type === 3) return AGENT_TYPES[type]
  return UNKNOWN_TYPE
}

// "AGENT_12" -> 12 (also accepts "AG_12" and a bare number)
export function agentIdFromName(name: string | null | undefined): number | null {
  if (!name) return null
  const m = /^(?:AGENT_|AG_)?(\d+)$/i.exec(name.trim())
  return m ? parseInt(m[1], 10) : null
}

export function totalWorkers(level: LevelAgents | null | undefined): number {
  if (!level) return 0
  return (level.firefighters || 0) + (level.bulldozers || 0) + (level.drones || 0) + (level.helicopters || 0)
}

// Worker names in algorithm order: AGENT_1..AGENT_N
export function workerNames(level: LevelAgents | null | undefined): string[] {
  const n = totalWorkers(level)
  return Array.from({ length: n }, (_, i) => `AGENT_${i + 1}`)
}

// How many workers of a type the level has (0 for managers)
export function countOfType(level: LevelAgents | null | undefined, type: AgentType): number {
  if (!level || type === -1) return 0
  return level[AGENT_TYPES[type].plural as keyof LevelAgents] || 0
}

// Type of a worker id from the level composition; null when the id is past the workers.
export function workerTypeFromId(id: number, level: LevelAgents | null | undefined): AgentType | null {
  if (!level || id < 1) return null
  let upper = 0
  for (const type of WORKER_TYPE_ORDER) {
    upper += countOfType(level, type)
    if (id <= upper) return type
  }
  return null
}

// Type for any role name given the level and (optionally) the manager list.
export function agentTypeFromName(name: string, level: LevelAgents | null | undefined, managers?: string[]): AgentType {
  if (managers && managers.includes(name)) return -1
  const id = agentIdFromName(name)
  if (id === null) return -1
  return workerTypeFromId(id, level) ?? -1
}

// "AGENT_12" + type 2 -> "Drone 12". Unknown names pass through unchanged.
export function displayName(name: string | null | undefined, type: number | null | undefined): string {
  if (!name) return "Unknown"
  const id = agentIdFromName(name)
  if (id === null) return name
  return `${agentMeta(type).label} ${id}`
}

export function displayNameFromLevel(name: string, level: LevelAgents | null | undefined, managers?: string[]): string {
  return displayName(name, agentTypeFromName(name, level, managers))
}

// Rewrites "AGENT_12" mentions in text the AI wrote into "Drone 12" for display.
export function friendlyText(text: string, typeOf: (id: number) => number | null | undefined): string {
  if (!text) return text
  return text.replace(/\b(?:AGENT|Agent|agent)[_ ](\d+)\b/g, (_m, num: string) => {
    const id = parseInt(num, 10)
    return `${agentMeta(typeOf(id)).label} ${id}`
  })
}

// Rewrites "Drone 12" in text a human typed back into "AGENT_12" before it reaches the AI.
export function rawText(text: string): string {
  if (!text) return text
  return text.replace(/\b(Manager|Firefighter|Bulldozer|Drone|Helicopter)\s+(\d+)\b/gi, (_m, _label, num: string) => `AGENT_${num}`)
}

// Builds a lookup from the observation payload a manager receives (root + children_data).
export function typeLookupFromObservation(root: any, childrenData: Record<string, any> | null | undefined): (id: number) => number | null {
  const map = new Map<number, number>()
  const rootId = agentIdFromName(root?.name)
  if (rootId !== null && typeof root?.type === "number") map.set(rootId, root.type)
  const walk = (data: Record<string, any> | null | undefined) => {
    if (!data) return
    for (const [id, agent] of Object.entries(data)) {
      const n = Number(id)
      if (!Number.isNaN(n) && typeof agent?.type === "number") map.set(n, agent.type)
      if (agent?.children_data) walk(agent.children_data)
    }
  }
  walk(childrenData)
  return (id: number) => (map.has(id) ? (map.get(id) as number) : null)
}

// Builds a lookup from lobby data (level composition + manager list).
export function typeLookupFromLevel(level: LevelAgents | null | undefined, managers?: string[]): (id: number) => number | null {
  const managerIds = new Set((managers || []).map(agentIdFromName).filter((x): x is number => x !== null))
  return (id: number) => (managerIds.has(id) ? -1 : workerTypeFromId(id, level))
}
