"use client"

import { useEffect, useMemo, useState } from "react"
import { Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Segmented } from "@/components/ui/segmented"
import AgentTile from "@/components/AgentTile"
import OrgChartLayout, { type ChartNode } from "@/components/OrgChartLayout"
import { AGENT_TYPES, agentIdFromName, agentTypeFromName, countOfType, displayName, type LevelAgents } from "@/lib/agents"
import { cn } from "@/lib/utils"

export interface ManagerConfig {
  type: "horizontal" | "vertical"
  team_name: string
}

export interface TeamState {
  // Manager names in order; the backend numbers managers by this order, after the workers
  managers: string[]
  // manager -> members (workers or sub-managers)
  hierarchy: Record<string, string[]>
  managerConfigs: Record<string, ManagerConfig>
}

interface TeamBuilderProps {
  agents: string[]
  levelAgents: LevelAgents
  team: TeamState
  onChange: (team: TeamState) => void
}

const DROP_PREFIX = "__drop__:"
const ManagerIcon = AGENT_TYPES[-1].icon

function teamLetter(i: number) {
  return String.fromCharCode(65 + (i % 26))
}

// Manager names must continue the worker numbering without gaps (AGENT_{workers+1}, ...)
// because the backend maps every role to an id by its position in agents + managers.
export function managerNameAt(agents: string[], index: number) {
  return `AGENT_${agents.length + index + 1}`
}

export function createRootTeam(agents: string[]): TeamState {
  const root = managerNameAt(agents, 0)
  return {
    managers: [root],
    hierarchy: { [root]: [] },
    managerConfigs: { [root]: { type: "vertical", team_name: "Team A" } },
  }
}

export function parentOf(team: TeamState, role: string): string | null {
  for (const [manager, members] of Object.entries(team.hierarchy)) {
    if (members.includes(role)) return manager
  }
  return null
}

function isDescendant(team: TeamState, ancestor: string, role: string, guard = 0): boolean {
  if (guard > 50) return false
  for (const member of team.hierarchy[ancestor] || []) {
    if (member === role) return true
    if (team.managers.includes(member) && isDescendant(team, member, role, guard + 1)) return true
  }
  return false
}

function withoutMember(hierarchy: Record<string, string[]>, role: string): Record<string, string[]> {
  const next: Record<string, string[]> = {}
  for (const [manager, members] of Object.entries(hierarchy)) next[manager] = members.filter((m) => m !== role)
  return next
}

export function validateTeam(agents: string[], team: TeamState) {
  const assigned = new Set(Object.values(team.hierarchy).flat())
  const unassigned = agents.filter((a) => !assigned.has(a))
  const emptyManagers = team.managers.filter((m) => (team.hierarchy[m] || []).length === 0)
  const roots = team.managers.filter((m) => !assigned.has(m))
  return { unassigned, emptyManagers, roots, ok: unassigned.length === 0 && emptyManagers.length === 0 && roots.length === 1 }
}

export default function TeamBuilder({ agents, levelAgents, team, onChange }: TeamBuilderProps) {
  const root = team.managers[0]
  const [selected, setSelected] = useState<string | null>(root ?? null)
  const [dragging, setDragging] = useState<string | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const [pending, setPending] = useState<string | null>(null)

  useEffect(() => {
    if (!selected || !team.managers.includes(selected)) setSelected(root ?? null)
  }, [team.managers, selected, root])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPending(null)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const { unassigned } = useMemo(() => validateTeam(agents, team), [agents, team])
  const typeOf = (role: string) => agentTypeFromName(role, levelAgents, team.managers)
  const label = (role: string) => displayName(role, typeOf(role))

  // ---- operations ----
  const canDrop = (role: string | null, target: string): boolean => {
    if (!role || !team.managers.includes(target)) return false
    if (role === target || role === root) return false
    if (team.managers.includes(role) && isDescendant(team, role, target)) return false
    return parentOf(team, role) !== target
  }

  const assign = (role: string, target: string) => {
    if (!canDrop(role, target)) return
    const hierarchy = withoutMember(team.hierarchy, role)
    hierarchy[target] = [...(hierarchy[target] || []), role]
    onChange({ ...team, hierarchy })
  }

  const unassign = (agent: string) => {
    if (team.managers.includes(agent)) return
    onChange({ ...team, hierarchy: withoutMember(team.hierarchy, agent) })
  }

  const addManager = () => {
    const name = managerNameAt(agents, team.managers.length)
    const hierarchy = { ...team.hierarchy, [name]: [] }
    if (root) hierarchy[root] = [...(hierarchy[root] || []), name]
    onChange({
      managers: [...team.managers, name],
      hierarchy,
      managerConfigs: { ...team.managerConfigs, [name]: { type: "vertical", team_name: `Team ${teamLetter(team.managers.length)}` } },
    })
    setSelected(name)
  }

  const removeManager = (manager: string) => {
    if (manager === root) return
    const parent = parentOf(team, manager)
    const members = team.hierarchy[manager] || []
    let hierarchy: Record<string, string[]> = {}
    for (const [m, list] of Object.entries(team.hierarchy)) {
      if (m === manager) continue
      hierarchy[m] = m === parent ? list.flatMap((x) => (x === manager ? members : [x])) : list
    }
    const managers = team.managers.filter((m) => m !== manager)
    const configs: Record<string, ManagerConfig> = { ...team.managerConfigs }
    delete configs[manager]
    // Renumber so manager names stay contiguous by position
    const rename = new Map(managers.map((m, i) => [m, managerNameAt(agents, i)]))
    const r = (x: string) => rename.get(x) ?? x
    const renumbered: Record<string, string[]> = {}
    for (const [m, list] of Object.entries(hierarchy)) renumbered[r(m)] = list.map(r)
    const renumberedConfigs: Record<string, ManagerConfig> = {}
    for (const [m, c] of Object.entries(configs)) renumberedConfigs[r(m)] = c
    onChange({ managers: managers.map(r), hierarchy: renumbered, managerConfigs: renumberedConfigs })
    setSelected(parent ? r(parent) : null)
  }

  const updateConfig = (manager: string, patch: Partial<ManagerConfig>) => {
    const current = team.managerConfigs[manager] || { type: "vertical", team_name: "" }
    onChange({ ...team, managerConfigs: { ...team.managerConfigs, [manager]: { ...current, ...patch } } })
  }

  // ---- drag and drop ----
  const onDragStart = (role: string) => (e: React.DragEvent) => {
    e.dataTransfer.setData("text/plain", role)
    e.dataTransfer.effectAllowed = "move"
    setDragging(role)
    setPending(null)
  }
  const onDragEnd = () => {
    setDragging(null)
    setHover(null)
  }
  const dropProps = (target: string) => ({
    onDragOver: (e: React.DragEvent) => {
      if (canDrop(dragging, target)) {
        e.preventDefault()
        e.dataTransfer.dropEffect = "move"
        if (hover !== target) setHover(target)
      }
    },
    onDragLeave: () => {
      if (hover === target) setHover(null)
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      const role = dragging || e.dataTransfer.getData("text/plain")
      assign(role, target)
      onDragEnd()
    },
  })
  const clickManager = (manager: string) => {
    if (pending) {
      assign(pending, manager)
      setPending(null)
    } else {
      setSelected(manager)
    }
  }

  // ---- chart ----
  const nodes = useMemo<ChartNode[]>(() => {
    const list: ChartNode[] = []
    for (const m of team.managers) list.push({ id: m, parentId: parentOf(team, m) })
    for (const m of team.managers) {
      const members = team.hierarchy[m] || []
      for (const member of members) if (!team.managers.includes(member)) list.push({ id: member, parentId: m })
      if (members.length === 0) list.push({ id: DROP_PREFIX + m, parentId: m })
    }
    return list
  }, [team])

  const highlightedEdges = useMemo(() => {
    const s = new Set<string>()
    for (const n of nodes) if (n.id.startsWith(DROP_PREFIX) && n.parentId) s.add(`${n.parentId}->${n.id}`)
    return s
  }, [nodes])

  const selectedMeta = selected ? team.managerConfigs[selected] : undefined
  const selectedParent = selected ? parentOf(team, selected) : null
  const memberCount = selected ? (team.hierarchy[selected] || []).length : 0

  return (
    <div className="flex flex-col gap-3">
      {/* Unassigned tray */}
      <div
        className={cn("flex flex-wrap items-center gap-2 rounded-lg bg-muted px-3 py-2.5", dragging && !team.managers.includes(dragging) && "ring-1 ring-brand/40")}
        onDragOver={(e) => {
          if (dragging && !team.managers.includes(dragging) && parentOf(team, dragging)) e.preventDefault()
        }}
        onDrop={(e) => {
          e.preventDefault()
          const role = dragging || e.dataTransfer.getData("text/plain")
          if (role) unassign(role)
          onDragEnd()
        }}
      >
        <span className="text-xs font-medium text-stone-700">Unassigned</span>
        {unassigned.length === 0 && <span className="text-xs text-muted-foreground">none</span>}
        {unassigned.map((agent) => {
          const meta = AGENT_TYPES[typeOf(agent) as 0 | 1 | 2 | 3] || AGENT_TYPES[0]
          const Icon = meta.icon
          const isPending = pending === agent
          return (
            <button
              key={agent}
              type="button"
              draggable
              onDragStart={onDragStart(agent)}
              onDragEnd={onDragEnd}
              onClick={() => setPending(isPending ? null : agent)}
              title={agent}
              className={cn(
                "inline-flex h-[30px] cursor-grab items-center gap-1.5 rounded-md border bg-card px-2.5 text-xs font-medium shadow-sm active:cursor-grabbing",
                isPending && "border-brand ring-2 ring-brand/30",
                dragging === agent && "opacity-40",
              )}
            >
              <Icon className={cn("h-3 w-3", meta.text)} />
              {label(agent)}
            </button>
          )
        })}
        <span className="ml-1.5 text-[11px] text-muted-foreground">
          {pending ? `Now click the manager for ${label(pending)}` : "Drag agents or managers onto a manager · click an agent, then a manager, also works"}
        </span>
        <div className="ml-auto">
          <Button type="button" variant="outline" size="sm" onClick={addManager}>
            <Plus className="h-4 w-4" /> Add manager
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_280px]">
        {/* Chart */}
        <div className="h-[340px] overflow-auto rounded-lg border bg-card shadow-sm">
          <OrgChartLayout
            nodes={nodes}
            highlightedEdges={highlightedEdges}
            renderNode={(id) => {
              if (id.startsWith(DROP_PREFIX)) {
                const manager = id.slice(DROP_PREFIX.length)
                return (
                  <div
                    {...dropProps(manager)}
                    onClick={() => clickManager(manager)}
                    className={cn(
                      "flex h-[46px] w-[150px] cursor-pointer items-center justify-center rounded-lg border border-dashed border-brand bg-brand/5 text-xs text-blue-700",
                      hover === manager && "bg-brand-soft",
                    )}
                  >
                    Drop agents here
                  </div>
                )
              }
              if (team.managers.includes(id)) {
                const config = team.managerConfigs[id]
                const isRoot = id === root
                return (
                  <AgentTile
                    name={id}
                    type={-1}
                    wide
                    sub={`${config?.team_name || "Team"} · ${config?.type === "horizontal" ? "Horizontal" : "Vertical"}`}
                    state={hover === id ? "drop" : selected === id ? "selected" : "default"}
                    draggable={!isRoot}
                    onDragStart={isRoot ? undefined : onDragStart(id)}
                    onDragEnd={onDragEnd}
                    onClick={() => clickManager(id)}
                    className={cn("cursor-pointer", !isRoot && "cursor-grab active:cursor-grabbing", dragging === id && "opacity-40", pending && "hover:border-brand")}
                    {...dropProps(id)}
                  />
                )
              }
              return (
                <div className="relative">
                  <AgentTile
                    name={id}
                    type={typeOf(id)}
                    draggable
                    onDragStart={onDragStart(id)}
                    onDragEnd={onDragEnd}
                    className={cn("cursor-grab active:cursor-grabbing", dragging === id && "opacity-40")}
                  />
                  <button
                    type="button"
                    aria-label={`Unassign ${label(id)}`}
                    onClick={() => unassign(id)}
                    className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full border bg-card text-stone-500 hover:text-foreground"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </div>
              )
            }}
          />
        </div>

        {/* Selected manager */}
        <div className="rounded-lg border bg-card shadow-sm">
          {selected && selectedMeta ? (
            <>
              <div className="flex items-center gap-2 border-b px-3 py-2.5">
                <ManagerIcon className="h-[15px] w-[15px] text-blue-600" />
                <span className="text-sm font-semibold">{label(selected)}</span>
                <span className="ml-auto text-[11px] text-muted-foreground">
                  {memberCount} member{memberCount === 1 ? "" : "s"}
                </span>
              </div>
              <div className="flex flex-col gap-3.5 p-3">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="team-name" className="text-xs font-medium">
                    Team name
                  </label>
                  <Input
                    id="team-name"
                    className="h-9 text-[13px]"
                    value={selectedMeta.team_name}
                    onChange={(e) => updateConfig(selected, { team_name: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium">How it runs the team</span>
                  <Segmented
                    aria-label="Manager type"
                    value={selectedMeta.type}
                    onChange={(v) => updateConfig(selected, { type: v })}
                    options={[
                      { value: "vertical", label: "Vertical" },
                      { value: "horizontal", label: "Horizontal" },
                    ]}
                  />
                  <span className="text-[11px] leading-[14px] text-muted-foreground">
                    {selectedMeta.type === "horizontal"
                      ? "Hands out tasks in parallel. Vertical runs one phase at a time."
                      : "Runs one phase at a time. Horizontal hands out tasks in parallel."}
                  </span>
                </div>
                <div className="flex items-center gap-2.5 border-t pt-3">
                  {selected === root ? (
                    <span className="text-[11px] leading-[14px] text-muted-foreground">Root manager. Every other manager reports to it.</span>
                  ) : (
                    <>
                      <Button type="button" variant="outline" size="sm" className="h-7 px-2.5 text-xs text-red-600" onClick={() => removeManager(selected)}>
                        Remove manager
                      </Button>
                      {selectedParent && <span className="text-[11px] leading-[14px] text-muted-foreground">Its team moves to {label(selectedParent)}</span>}
                    </>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="p-3 text-xs text-muted-foreground">Click a manager to edit it.</div>
          )}
        </div>
      </div>
    </div>
  )
}

// Used by the create dialog for the summary line of the selected level
export function compositionText(level: LevelAgents | undefined): string {
  if (!level) return ""
  return [0, 1, 2, 3]
    .map((t) => {
      const meta = AGENT_TYPES[t as 0 | 1 | 2 | 3]
      const n = countOfType(level, t as 0 | 1 | 2 | 3)
      return n ? `${n} ${n === 1 ? meta.label.toLowerCase() : meta.plural}` : ""
    })
    .filter(Boolean)
    .join(", ")
}

export function roleId(role: string) {
  return agentIdFromName(role)
}
