"use client"

import { useEffect } from "react"
import { AlertTriangle } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"

interface AnnouncementPopupProps {
  announcement: string | null
  onDismiss: () => void
}

export function AnnouncementPopup({ announcement, onDismiss }: AnnouncementPopupProps) {
  // Auto-dismiss after 10 seconds
  useEffect(() => {
    if (!announcement) return
    const timer = setTimeout(onDismiss, 10000)
    return () => clearTimeout(timer)
  }, [announcement, onDismiss])

  return (
    <Dialog open={!!announcement} onOpenChange={(open) => { if (!open) onDismiss() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-100">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
            </span>
            Game event
          </DialogTitle>
          <DialogDescription className="pt-2 text-base text-stone-700">{announcement}</DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  )
}
