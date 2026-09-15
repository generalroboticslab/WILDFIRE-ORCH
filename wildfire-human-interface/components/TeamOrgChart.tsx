"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import OrgChartNode from "@/components/OrgChartNode"
import AgentDetailCard from "@/components/AgentDetailCard"

interface AgentData {
  type: number
  name?: string
  alive?: boolean
  mission?: string
  status_summary?: string
  percent_complete?: number
  current_phase?: string
  phase_history?: string[]
  future_phases?: string[]
  options?: Array<{ description: string }>
  option_history?: Array<{ description: string }>
  children_ids?: number[]
  children_names?: string[]
}

interface TeamOrgChartProps {
  rootAgent: AgentData
  childrenData: Record<string, AgentData>
  rootAgentId?: number
  selectedAgentId?: number | null
  onAgentSelect?: (id: number) => void
  thinkingAgentIds?: Set<number>
  destroyedAgentIds?: Set<number>
}

interface TreeNode {
  id: string
  agent: AgentData
  children: TreeNode[]
  level: number
  parentId: string | null
}

interface Edge {
  id: string
  parentId: string
  childId: string
}

export default function TeamOrgChart({ rootAgent, childrenData, rootAgentId, selectedAgentId, onAgentSelect, thinkingAgentIds, destroyedAgentIds }: TeamOrgChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const nodeRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const [edges, setEdges] = useState<Array<{ id: string; x1: number; y1: number; x2: number; y2: number }>>([])

  // Build tree structure from flat childrenData
  const buildTree = useCallback((agent: AgentData, id: string, level: number, parentId: string | null): TreeNode => {
    const children: TreeNode[] = []

    if (agent.type === -1 && agent.children_ids) {
      agent.children_ids.forEach((childId, idx) => {
        const childData = childrenData[String(childId)]
        if (childData) {
          const childName = agent.children_names?.[idx] || `AGENT_${childId}`
          children.push(buildTree(
            { ...childData, name: childName },
            String(childId),
            level + 1,
            id
          ))
        }
      })
    }

    return { id, agent, children, level, parentId }
  }, [childrenData])

  // Get tree and collect edges
  const tree = buildTree(rootAgent, "root", 0, null)

  // Collect all edges from tree
  const collectEdges = useCallback((node: TreeNode): Edge[] => {
    const edges: Edge[] = []
    node.children.forEach(child => {
      edges.push({ id: `${node.id}-${child.id}`, parentId: node.id, childId: child.id })
      edges.push(...collectEdges(child))
    })
    return edges
  }, [])

  const treeEdges = collectEdges(tree)

  // Group nodes by level for rendering
  const getLevelNodes = useCallback((node: TreeNode, levels: TreeNode[][] = []): TreeNode[][] => {
    if (!levels[node.level]) {
      levels[node.level] = []
    }
    levels[node.level].push(node)
    node.children.forEach(child => getLevelNodes(child, levels))
    return levels
  }, [])

  const levelNodes = getLevelNodes(tree)

  // Calculate edge positions after render
  useEffect(() => {
    const calculateEdges = () => {
      if (!containerRef.current) return

      const containerRect = containerRef.current.getBoundingClientRect()
      const newEdges: Array<{ id: string; x1: number; y1: number; x2: number; y2: number }> = []

      treeEdges.forEach(edge => {
        const parentEl = nodeRefs.current[edge.parentId]
        const childEl = nodeRefs.current[edge.childId]

        if (parentEl && childEl) {
          const parentRect = parentEl.getBoundingClientRect()
          const childRect = childEl.getBoundingClientRect()

          // Parent bottom center
          const x1 = parentRect.left + parentRect.width / 2 - containerRect.left
          const y1 = parentRect.bottom - containerRect.top

          // Child top center
          const x2 = childRect.left + childRect.width / 2 - containerRect.left
          const y2 = childRect.top - containerRect.top

          newEdges.push({ id: edge.id, x1, y1, x2, y2 })
        }
      })

      setEdges(newEdges)
    }

    // Calculate after a short delay to ensure DOM is ready
    const timer = setTimeout(calculateEdges, 100)
    return () => clearTimeout(timer)
  }, [treeEdges, levelNodes])

  // Set node ref
  const setNodeRef = useCallback((id: string) => (el: HTMLDivElement | null) => {
    nodeRefs.current[id] = el
  }, [])

  return (
    <div ref={containerRef} className="relative min-h-full overflow-auto p-2">
      {/* SVG layer for edges */}
      <svg className="absolute inset-0 pointer-events-none overflow-visible" style={{ width: '100%', height: '100%' }}>
        {edges.map(edge => (
          <path
            key={edge.id}
            d={`M ${edge.x1} ${edge.y1} C ${edge.x1} ${edge.y1 + 20}, ${edge.x2} ${edge.y2 - 20}, ${edge.x2} ${edge.y2}`}
            className="stroke-gray-300 fill-none"
            strokeWidth={2}
          />
        ))}
      </svg>

      {/* Nodes layer - render by level */}
      <div className="relative flex flex-col items-center gap-5">
        {levelNodes.map((nodes, levelIdx) => (
          <div key={levelIdx} className="flex justify-center gap-2 flex-wrap">
            {nodes.map(node => (
              <HoverCard key={node.id} openDelay={200} closeDelay={100}>
                <HoverCardTrigger asChild>
                  <div
                    ref={setNodeRef(node.id)}
                    onClick={() => {
                      const numId = node.id === "root" ? rootAgentId : Number(node.id)
                      if (numId != null) onAgentSelect?.(numId)
                    }}
                    className={`cursor-pointer transition-all ${
                      selectedAgentId != null && (node.id === "root" ? rootAgentId === selectedAgentId : Number(node.id) === selectedAgentId)
                        ? 'ring-2 ring-blue-500 rounded-lg'
                        : ''
                    }`}
                  >
                    {(() => {
                      const numId = node.id === "root" ? rootAgentId : Number(node.id)
                      const nodeId = Number(node.id)
                      const isNodeDestroyed = destroyedAgentIds?.has(nodeId) || node.agent.alive === false
                      const isThinking = !isNodeDestroyed && (thinkingAgentIds?.has(numId ?? -999) || false)
                      return <OrgChartNode agent={node.agent} isThinking={isThinking} isDestroyed={isNodeDestroyed} />
                    })()}
                  </div>
                </HoverCardTrigger>
                <HoverCardContent side="right" className="w-80 pointer-events-none">
                  <AgentDetailCard agent={node.agent} compact />
                </HoverCardContent>
              </HoverCard>
            ))}
          </div>
        ))}
      </div>

      {/* Empty state */}
      {levelNodes.length === 0 && (
        <div className="text-center text-gray-400 py-8">
          No team hierarchy data
        </div>
      )}
    </div>
  )
}
