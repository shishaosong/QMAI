import { PanelBottom, PanelRight, type LucideIcon } from "lucide-react"
import { useWikiStore, type ChatDockPosition } from "@/stores/wiki-store"

const DOCK_OPTIONS: Array<{
  value: ChatDockPosition
  label: string
  icon: LucideIcon
}> = [
  { value: "bottom", label: "停靠到底栏", icon: PanelBottom },
  { value: "right", label: "停靠到右侧", icon: PanelRight },
]

export function ChatDockControls() {
  const chatDockPosition = useWikiStore((s) => s.chatDockPosition)
  const setChatDockPosition = useWikiStore((s) => s.setChatDockPosition)

  return (
    <div className="flex shrink-0 items-center gap-1 rounded-md border border-border/70 bg-muted/30 p-0.5">
      {DOCK_OPTIONS.map((option) => {
        const Icon = option.icon
        const active = chatDockPosition === option.value
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => setChatDockPosition(option.value)}
            className={`flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground ${
              active ? "bg-accent text-foreground" : ""
            }`}
            title={option.label}
            aria-label={option.label}
            aria-pressed={active}
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        )
      })}
    </div>
  )
}
