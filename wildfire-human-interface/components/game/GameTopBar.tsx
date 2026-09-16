"use client"

import { useState } from "react"
import { ChevronDown, ChevronUp, Clock, StopCircle, Timer, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface GameTopBarProps {
  mission: string
  step: number
  elapsed: string
  playerName: string
  isCreator: boolean
  onStop: () => void
  progress?: { label: string; value: number; target: number } | null
}

function Chip({ children, className, mono = true }: { children: React.ReactNode; className?: string; mono?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-md border bg-card px-2.5 text-xs font-medium",
        mono && "font-mono tabular",
        className,
      )}
    >
      {children}
    </span>
  )
}

// Shared header for both game views: mission (expandable), step, elapsed time, player, stop.
export default function GameTopBar({ mission, step, elapsed, playerName, isCreator, onStop, progress }: GameTopBarProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="flex flex-shrink-0 flex-col gap-1.5">
      <div className="flex h-9 items-center gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2 px-1">
          <span className="flex-shrink-0 text-xs font-semibold text-muted-foreground">Mission</span>
          <span className={cn("min-w-0 text-[13px] leading-[18px] text-stone-700", !expanded && "truncate")}>
            {expanded ? "" : mission || "No mission"}
          </span>
          {mission && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              aria-label={expanded ? "Collapse mission" : "Show full mission"}
              className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md border bg-card text-stone-600 hover:bg-muted"
            >
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <Chip>
            <Clock className="h-[13px] w-[13px] text-muted-foreground" />
            Step {step}
          </Chip>
          <Chip>
            <Timer className="h-[13px] w-[13px] text-muted-foreground" />
            {elapsed}
          </Chip>
          <Chip mono={false} className="border-primary bg-primary text-primary-foreground">
            <User className="h-[13px] w-[13px]" />
            {playerName}
          </Chip>
          {isCreator && (
            <Button type="button" variant="outline" size="sm" className="h-7 px-2.5 text-xs text-red-600" onClick={onStop}>
              <StopCircle className="h-3.5 w-3.5" /> Stop game
            </Button>
          )}
        </div>
      </div>
      {expanded && mission && (
        <div className="rounded-md border bg-card px-3 py-2 text-[13px] leading-[19px] text-stone-700">{mission}</div>
      )}
      {progress && progress.target > 0 && (
        <div className="flex h-5 items-center gap-2.5 px-1">
          <span className="flex-shrink-0 text-[11px] text-muted-foreground">{progress.label}</span>
          <div className="h-1.5 flex-1 rounded-full bg-border">
            <div
              className="h-1.5 rounded-full bg-green-500 transition-all"
              style={{ width: `${Math.min((progress.value / progress.target) * 100, 100)}%` }}
            />
          </div>
          <span className="flex-shrink-0 font-mono text-[11px] tabular text-muted-foreground">
            {progress.value}/{progress.target}
          </span>
        </div>
      )}
    </div>
  )
}
