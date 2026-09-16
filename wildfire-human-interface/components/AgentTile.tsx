"use client"

import { forwardRef } from "react"
import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { agentIdFromName, agentMeta } from "@/lib/agents"

export type TileState = "default" | "available" | "yours" | "taken" | "selected" | "destroyed" | "drop"

interface AgentTileProps extends React.HTMLAttributes<HTMLDivElement> {
  // Raw role name, e.g. "AGENT_12"
  name: string
  type: number
  state?: TileState
  // Overrides the small second line (type label by default)
  sub?: string
  progress?: number | null
  thinking?: boolean
  // Wider tile with a second line of free text (used for managers in the team builder)
  wide?: boolean
}

// The one agent tile used in the lobby, the team builder and the in-game team chart:
// type icon + agent number on the first line, type label (or a state) on the second.
const AgentTile = forwardRef<HTMLDivElement, AgentTileProps>(
  ({ name, type, state = "default", sub, progress = null, thinking = false, wide = false, className, ...rest }, ref) => {
    const meta = agentMeta(type)
    const Icon = meta.icon
    const id = agentIdFromName(name)
    const number = id !== null ? String(id) : name

    const look = {
      default: cn(meta.border, meta.bg),
      available: "border-stone-300 bg-card hover:border-brand",
      yours: "border-brand bg-brand-soft",
      taken: "border-border bg-muted",
      selected: cn("border-brand", meta.bg),
      destroyed: "border-stone-300 bg-muted opacity-60",
      drop: "border-brand bg-brand-soft shadow-[0_0_0_4px_rgba(37,99,235,.18)]",
    }[state]

    const dim = state === "taken" || state === "destroyed"
    const subText = sub ?? (state === "yours" ? "You" : state === "destroyed" ? "Destroyed" : meta.label)
    const subColor =
      state === "yours" ? "text-blue-700" : state === "destroyed" ? "text-red-600 font-semibold" : dim ? "text-stone-400" : "text-muted-foreground"

    return (
      <div
        ref={ref}
        title={`${meta.label} ${number} (${name})`}
        className={cn(
          "relative flex flex-col items-center gap-px rounded-lg border-2 px-1.5 pb-1 pt-[5px] transition-colors select-none",
          wide ? "w-[104px]" : "w-[78px]",
          look,
          className,
        )}
        {...rest}
      >
        {thinking && state !== "destroyed" && (
          <div className="absolute -right-1.5 -top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-card">
            <Loader2 className="h-3 w-3 animate-spin text-brand" />
          </div>
        )}
        {state === "destroyed" && (
          <div className="absolute -right-1.5 -top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-500 text-[8px] font-bold text-white">
            X
          </div>
        )}
        <div className="flex items-center gap-1">
          <Icon className={cn("h-[13px] w-[13px] flex-shrink-0", dim ? "text-stone-400" : meta.text)} />
          <span className={cn("text-[13px] font-semibold leading-4", dim ? "text-stone-400" : "text-foreground", state === "destroyed" && "line-through")}>
            {number}
          </span>
        </div>
        <div className={cn("max-w-full truncate text-[10px] leading-3", subColor)}>{subText}</div>
        {progress !== null && progress !== undefined && state !== "destroyed" && (
          <div className="mt-[3px] h-0.5 w-full rounded-full bg-border">
            <div className="h-0.5 rounded-full bg-green-500 transition-all" style={{ width: `${Math.min(Math.max(progress, 0), 100)}%` }} />
          </div>
        )}
      </div>
    )
  },
)
AgentTile.displayName = "AgentTile"

export default AgentTile
