"use client"

import { Bot } from "lucide-react"
import { cn } from "@/lib/utils"

interface ChatBubbleProps {
  who: "human" | "agent" | "system"
  text: string
  time?: string
  // Sender line inside an agent bubble (e.g. "Manager 16")
  name?: string
  // Small uppercase label for system bubbles (e.g. "Summary")
  label?: string
  // Human bubbles: this player's own messages are blue, other people's are neutral
  mine?: boolean
}

function formatTime(iso?: string) {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

export default function ChatBubble({ who, text, time, name, label, mine = true }: ChatBubbleProps) {
  const stamp = <div className={cn("mt-1 text-right font-mono text-[10px] leading-3", who === "human" && mine ? "opacity-70" : "text-muted-foreground")}>{formatTime(time)}</div>

  if (who === "human") {
    return (
      <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
        <div
          className={cn(
            "max-w-[78%] rounded-[10px] px-2.5 py-1.5 text-xs leading-[18px]",
            mine ? "bg-brand text-white" : "border bg-card text-foreground",
          )}
        >
          {!mine && name && <div className="mb-0.5 text-[11px] font-semibold leading-[14px] text-stone-600">{name}</div>}
          <p className="whitespace-pre-wrap break-words">{text}</p>
          {stamp}
        </div>
      </div>
    )
  }

  if (who === "system") {
    return (
      <div className="flex justify-start">
        <div className="max-w-[86%] rounded-[10px] border bg-muted px-2.5 py-1.5 text-xs leading-[18px] text-stone-700">
          {label && <div className="mb-0.5 text-[10px] font-semibold uppercase leading-3 tracking-[.06em] text-muted-foreground">{label}</div>}
          <p className="whitespace-pre-wrap break-words">{text}</p>
          {stamp}
        </div>
      </div>
    )
  }

  return (
    <div className="flex justify-start gap-1.5">
      <div className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-brand-soft">
        <Bot className="h-3 w-3 text-brand" />
      </div>
      <div className="max-w-[80%] rounded-[10px] border bg-card px-2.5 py-1.5 text-xs leading-[18px] text-foreground">
        {name && <div className="mb-0.5 text-[11px] font-semibold leading-[14px] text-stone-600">{name}</div>}
        <p className="whitespace-pre-wrap break-words">{text}</p>
        {stamp}
      </div>
    </div>
  )
}
