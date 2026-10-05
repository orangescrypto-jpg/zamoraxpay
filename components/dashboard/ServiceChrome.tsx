"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  ArrowRight,
  BadgePercent,
  Banknote,
  Cable,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  CreditCard,
  Globe2,
  Lightbulb,
  Phone,
  Radio,
  Smartphone,
  Users,
  Zap,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { ServiceFinder } from "@/components/dashboard/ServiceFinder"

interface ServiceMeta {
  match: string
  title: string
  description: string
  icon: LucideIcon
  eyebrow: string
  steps: string[]
}

const SERVICES: ServiceMeta[] = [
  {
    match: "/airtime-to-cash",
    title: "Airtime to Cash",
    description: "Convert eligible airtime into wallet value through a simple guided flow.",
    icon: CircleDollarSign,
    eyebrow: "Convert airtime",
    steps: ["Enter details", "Confirm", "Receive value"],
  },
  {
    match: "/international-topup",
    title: "International Top-up",
    description: "Send airtime or data to supported international destinations from one place.",
    icon: Globe2,
    eyebrow: "Global top-up",
    steps: ["Choose country", "Enter number", "Confirm"],
  },
  {
    match: "/bulk-data",
    title: "Bulk Data",
    description: "Send data to multiple recipients with a cleaner, faster bulk-purchase workflow.",
    icon: Users,
    eyebrow: "For groups & teams",
    steps: ["Choose group", "Select plan", "Send"],
  },
  {
    match: "/bulk-airtime",
    title: "Bulk Airtime",
    description: "Top up multiple numbers at once while keeping the total and recipient list clear.",
    icon: Users,
    eyebrow: "For groups & teams",
    steps: ["Choose group", "Set amount", "Send"],
  },
  {
    match: "/scheduled-bills",
    title: "Scheduled Bills",
    description: "Manage your existing scheduled bill payments from one focused workspace.",
    icon: ClipboardList,
    eyebrow: "Stay on schedule",
    steps: ["Review", "Edit", "Manage"],
  },
  {
    match: "/electricity",
    title: "Electricity",
    description: "Pay your electricity bill with a clear meter, amount and confirmation flow.",
    icon: Lightbulb,
    eyebrow: "Bills & utilities",
    steps: ["Meter", "Amount", "Confirm"],
  },
  {
    match: "/cable",
    title: "Cable TV",
    description: "Renew your TV subscription with a simple provider and package selection.",
    icon: Cable,
    eyebrow: "Entertainment",
    steps: ["Provider", "Package", "Confirm"],
  },
  {
    match: "/exam-pin",
    title: "Exam PIN",
    description: "Purchase supported examination PINs with a straightforward quantity and price flow.",
    icon: BadgePercent,
    eyebrow: "Education",
    steps: ["Exam body", "Quantity", "Confirm"],
  },
  {
    match: "/epin",
    title: "ePIN",
    description: "Purchase supported ePIN products without unnecessary steps or page switching.",
    icon: CreditCard,
    eyebrow: "Digital products",
    steps: ["Select", "Review", "Purchase"],
  },
  {
    match: "/betting",
    title: "Betting Wallet",
    description: "Fund a supported betting account using a focused and easy-to-review form.",
    icon: Banknote,
    eyebrow: "Wallet funding",
    steps: ["Platform", "Account", "Confirm"],
  },
  {
    match: "/data",
    title: "Data",
    description: "Choose a network, enter a recipient and pick the data plan that fits your needs.",
    icon: Smartphone,
    eyebrow: "Mobile data",
    steps: ["Network", "Plan", "Confirm"],
  },
  {
    match: "/airtime",
    title: "Airtime",
    description: "Buy airtime quickly with a clean recipient, amount and confirmation flow.",
    icon: Phone,
    eyebrow: "Mobile airtime",
    steps: ["Network", "Amount", "Confirm"],
  },
]

const QUICK_LINKS = [
  { href: "/dashboard/services/airtime", label: "Airtime", icon: Phone },
  { href: "/dashboard/services/data", label: "Data", icon: Smartphone },
  { href: "/dashboard/services/electricity", label: "Electricity", icon: Lightbulb },
  { href: "/dashboard/services/cable", label: "Cable", icon: Cable },
]

function getService(pathname: string): ServiceMeta | null {
  return SERVICES.find((service) => pathname.includes(service.match)) ?? null
}

export function ServiceChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const service = pathname ? getService(pathname) : null

  if (!service) return <>{children}</>

  const Icon = service.icon

  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 bg-gradient-to-b from-primary/[0.07] via-primary/[0.025] to-transparent" />
      <div className="container max-w-5xl py-5 sm:py-8">
        <div className="mb-5 flex items-center gap-1.5 overflow-x-auto whitespace-nowrap text-xs text-muted-foreground">
          <Link href="/dashboard" className="shrink-0 transition-colors hover:text-primary">Dashboard</Link>
          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
          <span className="shrink-0 text-secondary">Services</span>
          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
          <span className="shrink-0">{service.title}</span>
        </div>

        <section className="mb-5 overflow-hidden rounded-2xl border border-border/80 bg-card/95 shadow-sm backdrop-blur-sm">
          <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div className="flex min-w-0 items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/10">
                <Icon className="h-6 w-6" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-primary">{service.eyebrow}</p>
                <h1 className="font-heading text-xl font-bold tracking-tight text-secondary sm:text-2xl">{service.title}</h1>
                <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">{service.description}</p>
              </div>
            </div>

            <div className="grid shrink-0 grid-cols-3 gap-1.5 rounded-xl bg-muted/70 p-1.5 sm:min-w-[280px]">
              {service.steps.map((step, index) => (
                <div key={step} className="flex min-w-0 items-center gap-1.5 rounded-lg bg-card px-2.5 py-2 text-xs font-medium text-secondary shadow-sm">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">{index + 1}</span>
                  <span className="truncate">{step}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <ServiceFinder currentHref={service.match} />
          <p className="hidden text-xs text-muted-foreground sm:block">Fast navigation — no extra account data is loaded.</p>
        </div>

        <div className="mb-5 flex items-center gap-2 overflow-x-auto pb-1">
          <span className="shrink-0 text-xs font-medium text-muted-foreground">Quick services</span>
          {QUICK_LINKS.map(({ href, label, icon: QuickIcon }) => {
            const active = pathname === href
            return (
              <Link
                key={href}
                href={href}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                  active
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-border bg-card text-secondary hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
                }`}
              >
                <QuickIcon className="h-3.5 w-3.5" aria-hidden="true" />
                {label}
              </Link>
            )
          })}
          <Link
            href="/dashboard"
            className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/5"
          >
            Dashboard <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>

        <div className="rounded-2xl border border-border/70 bg-card shadow-sm [&_input]:min-h-11 [&_select]:min-h-11 [&_button]:min-h-11 [&_label]:leading-5">
          {children}
        </div>
      </div>
    </div>
  )
}
