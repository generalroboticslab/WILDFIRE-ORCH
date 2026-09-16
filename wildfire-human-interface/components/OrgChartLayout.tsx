"use client"

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { cn } from "@/lib/utils"

export interface ChartNode {
  id: string
  parentId: string | null
  // Optional forced row (otherwise depth from the root)
  level?: number
}

interface OrgChartLayoutProps {
  nodes: ChartNode[]
  renderNode: (id: string) => React.ReactNode
  className?: string
  // Edge ids ("parent->child") drawn in the accent color, dashed
  highlightedEdges?: Set<string>
}

interface Edge {
  id: string
  parentId: string
  childId: string
}

interface DrawnEdge extends Edge {
  x1: number
  y1: number
  x2: number
  y2: number
}

// Generic layered tree: rows of nodes with curved connectors. Put it inside a container
// with overflow-auto when the team can be bigger than the box.
export default function OrgChartLayout({ nodes, renderNode, className, highlightedEdges }: OrgChartLayoutProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const nodeRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const [drawn, setDrawn] = useState<DrawnEdge[]>([])

  const { rows, edges } = useMemo(() => {
    const byId = new Map(nodes.map((n) => [n.id, n]))
    const levelOf = new Map<string, number>()
    const depth = (n: ChartNode, guard = 0): number => {
      if (n.level !== undefined) return n.level
      if (levelOf.has(n.id)) return levelOf.get(n.id)!
      const parent = n.parentId ? byId.get(n.parentId) : undefined
      const d = parent && guard < 50 ? depth(parent, guard + 1) + 1 : 0
      levelOf.set(n.id, d)
      return d
    }
    const rows: string[][] = []
    nodes.forEach((n) => {
      const d = depth(n)
      if (!rows[d]) rows[d] = []
      rows[d].push(n.id)
    })
    const edges: Edge[] = nodes
      .filter((n) => n.parentId && byId.has(n.parentId))
      .map((n) => ({ id: `${n.parentId}->${n.id}`, parentId: n.parentId as string, childId: n.id }))
    return { rows: rows.filter(Boolean), edges }
  }, [nodes])

  const measure = useCallback(() => {
    const container = containerRef.current
    if (!container) return
    const c = container.getBoundingClientRect()
    const next: DrawnEdge[] = []
    for (const e of edges) {
      const p = nodeRefs.current[e.parentId]
      const k = nodeRefs.current[e.childId]
      if (!p || !k) continue
      const pr = p.getBoundingClientRect()
      const kr = k.getBoundingClientRect()
      next.push({
        ...e,
        x1: pr.left + pr.width / 2 - c.left,
        y1: pr.bottom - c.top,
        x2: kr.left + kr.width / 2 - c.left,
        y2: kr.top - c.top,
      })
    }
    setDrawn(next)
  }, [edges])

  useLayoutEffect(() => {
    measure()
  }, [measure, rows])

  useEffect(() => {
    const container = containerRef.current
    if (!container || typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(() => measure())
    ro.observe(container)
    return () => ro.disconnect()
  }, [measure])

  const setNodeRef = useCallback(
    (id: string) => (el: HTMLDivElement | null) => {
      nodeRefs.current[id] = el
    },
    [],
  )

  return (
    <div ref={containerRef} className={cn("relative inline-flex min-w-full flex-col items-center gap-5 p-3", className)}>
      <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
        {drawn.map((e) => {
          const hl = highlightedEdges?.has(e.id)
          return (
            <path
              key={e.id}
              d={`M ${e.x1} ${e.y1} C ${e.x1} ${e.y1 + 14}, ${e.x2} ${e.y2 - 14}, ${e.x2} ${e.y2}`}
              className={hl ? "stroke-brand" : "stroke-stone-300"}
              strokeWidth={1.5}
              strokeDasharray={hl ? "4 3" : undefined}
              fill="none"
            />
          )
        })}
      </svg>
      {rows.map((row, i) => (
        <div key={i} className="relative flex flex-wrap justify-center gap-2">
          {row.map((id) => (
            <div key={id} ref={setNodeRef(id)}>
              {renderNode(id)}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
