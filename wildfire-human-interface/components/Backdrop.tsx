import Image from "next/image"
import bg from "@/app/assets/wildfire-bg.jpg"

// Blurred, faded wildfire render behind the entry screens (home, lobby, waiting, end).
export default function Backdrop() {
  return (
    <div aria-hidden className="fixed inset-0 -z-10 overflow-hidden bg-background">
      <Image
        src={bg}
        alt=""
        fill
        priority
        sizes="100vw"
        className="scale-105 object-cover blur-md saturate-[.8]"
      />
      <div className="absolute inset-0 bg-stone-50/75" />
    </div>
  )
}
