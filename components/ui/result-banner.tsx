import { CheckCircle2, XCircle, AlertTriangle, Info } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { cn } from "@/lib/utils"

type ResultVariant = "success" | "error" | "warning" | "info"

interface ResultBannerProps {
  variant: ResultVariant
  title?: string
  message: string
  className?: string
  onDismiss?: () => void
}

const ICONS = { success: CheckCircle2, error: XCircle, warning: AlertTriangle, info: Info }
const VARIANT_MAP = { success: "success" as const, error: "destructive" as const, warning: "warning" as const, info: "info" as const }

export function ResultBanner({ variant, title, message, className, onDismiss }: ResultBannerProps) {
  const Icon = ICONS[variant]
  return (
    <Alert variant={VARIANT_MAP[variant]} className={cn("relative", className)}>
      <Icon className="h-4 w-4" />
      <div>
        {title && <AlertTitle>{title}</AlertTitle>}
        <AlertDescription>{message}</AlertDescription>
      </div>
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label="Dismiss" className="absolute right-3 top-3 rounded-md p-1 text-current opacity-60 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <XCircle className="h-4 w-4" />
        </button>
      )}
    </Alert>
  )
}
