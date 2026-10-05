"use client"

import { Download, Share2 } from "lucide-react"

interface ReceiptButtonProps {
  service: string
  reference: string
  amount: string
  status: string
  date: string
  recipient?: string
}

function receiptText(props: ReceiptButtonProps) {
  return [
    "ZAMORAXPAY",
    "TRANSACTION RECEIPT",
    "",
    `Service: ${props.service}`,
    props.recipient ? `Recipient: ${props.recipient}` : null,
    `Amount: ${props.amount}`,
    `Status: ${props.status}`,
    `Transaction ID: ${props.reference}`,
    `Date: ${props.date}`,
    "",
    "Thank you for using ZamoraxPay.",
  ].filter(Boolean).join("\n")
}

export function ReceiptButton(props: ReceiptButtonProps) {
  const download = () => {
    const blob = new Blob([receiptText(props)], { type: "text/plain;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = `zamoraxpay-receipt-${props.reference}.txt`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }

  const share = async () => {
    const text = receiptText(props)
    if (navigator.share) {
      try {
        await navigator.share({ title: "ZamoraxPay receipt", text })
        return
      } catch {
        // The user cancelled the native share sheet; keep the interaction quiet.
      }
    }
    download()
  }

  return (
    <div className="mt-1.5 flex items-center justify-end gap-1">
      <button
        type="button"
        onClick={download}
        className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-medium text-muted-foreground transition hover:bg-muted hover:text-primary"
        aria-label={`Download receipt for ${props.reference}`}
      >
        <Download className="h-3 w-3" />
        Receipt
      </button>
      <button
        type="button"
        onClick={share}
        className="inline-flex items-center rounded-md p-1 text-muted-foreground transition hover:bg-muted hover:text-primary"
        aria-label={`Share receipt for ${props.reference}`}
      >
        <Share2 className="h-3 w-3" />
      </button>
    </div>
  )
}
