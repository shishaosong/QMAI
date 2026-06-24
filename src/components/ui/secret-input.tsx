import * as React from "react"
import { Eye, EyeOff } from "lucide-react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

type SecretInputProps = Omit<React.ComponentProps<typeof Input>, "type"> & {
  revealLabel?: string
  concealLabel?: string
}

function SecretInput({
  className,
  disabled,
  revealLabel = "显示密钥",
  concealLabel = "隐藏密钥",
  ...props
}: SecretInputProps) {
  const [visible, setVisible] = React.useState(false)
  const label = visible ? concealLabel : revealLabel

  return (
    <div className="relative">
      <Input
        {...props}
        disabled={disabled}
        type={visible ? "text" : "password"}
        className={cn("pr-10 font-mono", className)}
      />
      <button
        type="button"
        disabled={disabled}
        aria-label={label}
        aria-pressed={visible}
        title={label}
        onClick={() => setVisible((current) => !current)}
        className="absolute right-1 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
      >
        {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </button>
    </div>
  )
}

export { SecretInput }
