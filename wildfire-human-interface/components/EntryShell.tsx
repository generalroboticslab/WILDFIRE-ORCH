import { Flame } from "lucide-react"
import Backdrop from "@/components/Backdrop"
import { cn } from "@/lib/utils"

interface EntryShellProps {
  children: React.ReactNode
  // Tailwind max-width class for the panel
  width?: string
  className?: string
}

// Shared frame for every screen outside the game: backdrop, wordmark, one frosted panel.
export default function EntryShell({ children, width = "max-w-2xl", className }: EntryShellProps) {
  return (
    <main className="relative min-h-screen">
      <Backdrop />
      <div className="absolute left-6 top-6 flex items-center gap-2 text-[13px] font-semibold tracking-wide text-stone-700 sm:left-8 sm:top-7">
        <Flame className="h-4 w-4 text-red-500" />
        CREW-Wildfire
      </div>
      <div className="flex min-h-screen items-center justify-center px-4 py-20">
        <div
          className={cn(
            "w-full rounded-xl border bg-white/85 p-6 shadow-[0_1px_2px_rgba(0,0,0,.05),0_8px_24px_rgba(28,25,23,.06)] backdrop-blur-md sm:p-8",
            width,
            className,
          )}
        >
          {children}
        </div>
      </div>
    </main>
  )
}
