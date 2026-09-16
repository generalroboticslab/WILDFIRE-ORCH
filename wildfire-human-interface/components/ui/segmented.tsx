"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

interface SegmentedOption<T extends string> {
  value: T
  label: React.ReactNode
}

interface SegmentedProps<T extends string> {
  value: T
  onChange: (value: T) => void
  options: SegmentedOption<T>[]
  size?: "sm" | "md"
  className?: string
  "aria-label"?: string
}

// A small pill switch: muted track, white active segment.
export function Segmented<T extends string>({ value, onChange, options, size = "sm", className, ...rest }: SegmentedProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={rest["aria-label"]}
      className={cn("inline-flex items-center gap-0.5 rounded-md border bg-muted p-0.5", className)}
    >
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              "inline-flex items-center justify-center rounded font-medium transition-colors whitespace-nowrap",
              size === "sm" ? "h-6 px-2.5 text-xs" : "h-8 px-3 text-sm",
              active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
