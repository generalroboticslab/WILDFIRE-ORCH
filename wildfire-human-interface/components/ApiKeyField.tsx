"use client"

import { useState } from "react"
import { Eye, EyeOff } from "lucide-react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

interface ApiKeyFieldProps {
  value: string
  onChange: (value: string) => void
  // compact: label and input on one row (dialog headers); otherwise stacked
  compact?: boolean
  className?: string
}

export default function ApiKeyField({ value, onChange, compact = false, className }: ApiKeyFieldProps) {
  const [show, setShow] = useState(false)

  return (
    <div className={cn(compact ? "flex items-center gap-2" : "flex flex-col gap-2", className)}>
      <label htmlFor="openai-api-key" className={cn("font-medium leading-4 whitespace-nowrap", compact ? "text-xs" : "text-sm")}>
        OpenAI API key
      </label>
      <div className={cn("relative", compact ? "w-64" : "w-full")}>
        <Input
          id="openai-api-key"
          type={show ? "text" : "password"}
          placeholder="sk-..."
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn("pr-9 font-mono", compact && "h-9 text-[13px]")}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? "Hide API key" : "Show API key"}
          className="absolute right-0 top-0 flex h-full w-9 items-center justify-center text-muted-foreground hover:text-foreground"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  )
}
