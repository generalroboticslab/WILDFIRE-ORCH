"use client"

import { useEffect } from "react"
import { AlertTriangle } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"

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
      <DialogContent className="border-2 border-orange-500 bg-orange-950/95 text-orange-50 max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-orange-300">
            <AlertTriangle className="h-5 w-5 text-orange-400" />
            Game Event
          </DialogTitle>
          <DialogDescription className="text-orange-100 text-base pt-2">
            {announcement}
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  )
}
