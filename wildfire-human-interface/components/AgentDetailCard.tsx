"use client"

import { cn } from "@/lib/utils"
import { agentMeta, displayName, friendlyText } from "@/lib/agents"

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
}

interface AgentDetailCardProps {
  agent: AgentData
  compact?: boolean
  typeOf?: (id: number) => number | null
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border bg-muted px-2.5 py-2">
      <div className="mb-1 text-[10px] font-semibold uppercase leading-3 tracking-[.06em] text-muted-foreground">{label}</div>
      {children}
    </div>
  )
}

export default function AgentDetailCard({ agent, compact = false, typeOf }: AgentDetailCardProps) {
  const meta = agentMeta(agent.type)
  const Icon = meta.icon
  const isManager = agent.type === -1
  const friendly = (t: string) => (typeOf ? friendlyText(t, typeOf) : t)

  return (
    <div className={cn("space-y-2", compact ? "text-xs" : "text-sm")}>
      <div className="flex items-center gap-2">
        <Icon className={cn("flex-shrink-0", meta.text, compact ? "h-4 w-4" : "h-5 w-5")} />
        <span className="truncate font-semibold">{displayName(agent.name, agent.type)}</span>
        {agent.percent_complete !== undefined && agent.percent_complete !== null && agent.alive !== false && (
          <span className="ml-auto font-mono text-xs tabular text-muted-foreground">{Math.round(agent.percent_complete)}%</span>
        )}
      </div>

      {agent.alive === false && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-center text-xs font-semibold text-red-700">Destroyed · no longer operational</div>
      )}

      {agent.alive !== false && (
        <>
          {agent.mission && (
            <Section label="Mission">
              <p className={cn("text-xs leading-relaxed text-stone-700", compact && "line-clamp-2")}>{friendly(agent.mission)}</p>
              {agent.percent_complete !== undefined && agent.percent_complete !== null && (
                <div className="mt-1.5 h-1 w-full rounded-full bg-border">
                  <div className="h-1 rounded-full bg-green-500 transition-all" style={{ width: `${Math.min(agent.percent_complete, 100)}%` }} />
                </div>
              )}
            </Section>
          )}

          {isManager && agent.current_phase ? (
            <Section label="Phases">
              <div className="space-y-1">
                {agent.phase_history && agent.phase_history.length > 0 && (
                  <div className={cn("text-xs text-stone-400", compact && "truncate")}>Past: {agent.phase_history.slice(-2).map(friendly).join(" → ")}</div>
                )}
                <div className="text-xs text-stone-800">
                  <span className="text-muted-foreground">Now: </span>
                  <span className={cn("font-medium", compact && "line-clamp-2")}>{friendly(agent.current_phase)}</span>
                </div>
                {agent.future_phases && agent.future_phases.length > 0 && (
                  <div className={cn("text-xs text-stone-400", compact && "truncate")}>Next: {agent.future_phases.slice(0, 2).map(friendly).join(" → ")}</div>
                )}
              </div>
            </Section>
          ) : !isManager ? (
            <Section label="Actions">
              {agent.options && agent.options.length > 0 ? (
                <div className="space-y-1">
                  {agent.option_history && agent.option_history.length > 0 && (
                    <div className={cn("text-xs text-stone-400", compact && "truncate")}>
                      Past: {agent.option_history.slice(-2).map((o) => friendly(o.description)).join(" → ")}
                    </div>
                  )}
                  <div className="text-xs text-stone-800">
                    <span className="text-muted-foreground">Now: </span>
                    <span className={cn("font-medium", compact && "line-clamp-2")}>{friendly(agent.options[0]?.description || "No action")}</span>
                  </div>
                  {agent.options.length > 1 && (
                    <div className={cn("text-xs text-stone-400", compact && "truncate")}>
                      Next: {agent.options.slice(1, 3).map((o) => friendly(o.description)).join(" → ")}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs italic text-stone-400">No action information</p>
              )}
            </Section>
          ) : null}

          {agent.status_summary && !compact && <p className="border-t pt-1.5 text-xs italic text-muted-foreground">{friendly(agent.status_summary)}</p>}
        </>
      )}
    </div>
  )
}
