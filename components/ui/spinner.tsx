import { cn } from "@/lib/utils"

interface SpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: "sm" | "md" | "lg"
}

function Spinner({ className, size = "md", ...props }: SpinnerProps) {
  const sizeClass = size === "sm" ? "h-4 w-4 border-2" : size === "lg" ? "h-8 w-8 border-[3px]" : "h-5 w-5 border-2"
  return (
    <div
      role="status"
      aria-label="Loading"
      className={cn("inline-block animate-spin rounded-full border-primary border-t-transparent", sizeClass, className)}
      {...props}
    />
  )
}
export { Spinner }
