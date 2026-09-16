"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Crosshair, Eye, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

export interface HoverCoords {
  gridX: number
  gridY: number
  label?: string
}

export interface TargetMarker {
  // Position as fractions of the rendered image
  fx: number
  fy: number
  label: string
}

interface ObservationFrameProps {
  imageUrl: string | null
  waiting: boolean
  imgRef: React.RefObject<HTMLImageElement>
  hoverCoords: HoverCoords | null
  onMouseMove: (e: React.MouseEvent<HTMLImageElement>) => void
  onMouseLeave: () => void
  onClick?: (e: React.MouseEvent<HTMLImageElement>) => void
  marker?: TargetMarker | null
  hint?: string | null
  clickable?: boolean
}

// The framed observation image shared by both game views, with the hover-coordinates chip,
// an optional click target marker and an optional hint chip.
export default function ObservationFrame({
  imageUrl,
  waiting,
  imgRef,
  hoverCoords,
  onMouseMove,
  onMouseLeave,
  onClick,
  marker,
  hint,
  clickable = false,
}: ObservationFrameProps) {
  const frameRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null)

  const measure = useCallback(() => {
    const img = imgRef.current
    const frame = frameRef.current
    if (!img || !frame) {
      setBox(null)
      return
    }
    const r = img.getBoundingClientRect()
    const f = frame.getBoundingClientRect()
    setBox({ left: r.left - f.left, top: r.top - f.top, width: r.width, height: r.height })
  }, [imgRef])

  useEffect(() => {
    measure()
    const frame = frameRef.current
    if (!frame || typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(() => measure())
    ro.observe(frame)
    return () => ro.disconnect()
  }, [measure, imageUrl, waiting])

  return (
    <div ref={frameRef} className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg border bg-muted">
      {waiting ? (
        <div className="space-y-3 text-center">
          <Loader2 className="mx-auto h-10 w-10 animate-spin text-brand" />
          <div>
            <p className="font-semibold text-stone-800">Waiting for the next observation</p>
            <p className="text-sm text-muted-foreground">The simulation is processing the step</p>
          </div>
        </div>
      ) : imageUrl ? (
        <>
          <img
            ref={imgRef}
            src={imageUrl}
            alt="Observation"
            className={cn("max-h-full max-w-full object-contain", clickable && "cursor-crosshair")}
            onLoad={measure}
            onMouseMove={onMouseMove}
            onMouseLeave={onMouseLeave}
            onClick={onClick}
          />
          {marker && box && (
            <div
              className="pointer-events-none absolute z-10 flex items-center gap-1.5"
              style={{ left: box.left + marker.fx * box.width, top: box.top + marker.fy * box.height }}
            >
              <div className="-ml-[11px] -mt-[11px] flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 border-white bg-brand/85 shadow-[0_0_0_3px_rgba(37,99,235,.35)]">
                <Crosshair className="h-3.5 w-3.5 text-white" />
              </div>
              <span className="-mt-[11px] whitespace-nowrap rounded bg-black/75 px-1.5 py-0.5 font-mono text-[10px] leading-[14px] text-white">
                {marker.label}
              </span>
            </div>
          )}
          {hoverCoords && (
            <div className="pointer-events-none absolute left-2 top-2 z-10 rounded bg-black/75 px-2 py-1 font-mono text-xs text-white">
              ({hoverCoords.gridX}, {hoverCoords.gridY}){hoverCoords.label ? ` · ${hoverCoords.label}` : ""}
            </div>
          )}
          {hint && (
            <div className="pointer-events-none absolute bottom-2 left-2 z-10 inline-flex items-center gap-1.5 rounded-md border bg-card px-2 py-1 text-[11px] text-stone-700">
              <Crosshair className="h-3 w-3 text-brand" />
              {hint}
            </div>
          )}
        </>
      ) : (
        <div className="text-center text-stone-400">
          <Eye className="mx-auto mb-2 h-12 w-12" />
          <p className="font-medium">No observation yet</p>
        </div>
      )}
    </div>
  )
}
