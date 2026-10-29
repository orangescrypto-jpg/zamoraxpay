"use client"

import { useState } from "react"
import { Check, Copy, Download, FileText, Share2 } from "lucide-react"
import { useToast } from "@/components/shared/ToastProvider"

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

/**
 * Build a printable HTML receipt in a hidden iframe, then trigger a
 * print dialog. The user can save the printed page as PDF from the
 * browser's print dialog. No external PDF library needed - this works
 * offline and stays tiny.
 *
 * Uses an isolated iframe so the print stylesheet doesn't conflict
 * with the main app's Tailwind CSS.
 */
function printReceiptAsPdf(props: ReceiptButtonProps) {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>ZamoraxPay Receipt - ${props.reference}</title>
<style>
  @page { size: A5; margin: 16mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Arial, sans-serif; color: #0B1220; margin: 0; padding: 24px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0057FF; padding-bottom: 16px; }
  .brand { font-size: 22px; font-weight: 700; letter-spacing: -0.02em; }
  .brand .accent { color: #0057FF; }
  .receipt-label { font-size: 11px; letter-spacing: 0.16em; color: #6B7280; text-transform: uppercase; font-weight: 600; }
  .title { font-size: 24px; font-weight: 700; margin: 24px 0 4px; }
  .subtitle { color: #6B7280; font-size: 13px; margin-bottom: 24px; }
  .row { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #E5E7EB; font-size: 14px; }
  .row .label { color: #6B7280; }
  .row .value { font-weight: 600; color: #0B1220; text-align: right; }
  .amount-row { background: #F5F7FA; border-radius: 8px; padding: 16px; margin: 16px 0; }
  .amount-row .label { color: #6B7280; font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; }
  .amount-row .value { font-size: 28px; font-weight: 700; color: #0057FF; }
  .status-badge { display: inline-block; padding: 4px 10px; border-radius: 999px; font-size: 11px; font-weight: 600; text-transform: capitalize; background: ${props.status === "success" || props.status === "completed" ? "#DEF7EC" : props.status === "failed" ? "#FDE8E8" : "#FEF3C7"}; color: ${props.status === "success" || props.status === "completed" ? "#03543F" : props.status === "failed" ? "#991B1B" : "#92400E"}; }
  .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #E5E7EB; font-size: 11px; color: #6B7280; text-align: center; }
  .footer a { color: #0057FF; text-decoration: none; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand">Zamorax<span class="accent">Pay</span></div>
      <div class="receipt-label">Transaction Receipt</div>
    </div>
    <div style="text-align: right;">
      <div class="receipt-label">Reference</div>
      <div style="font-family: monospace; font-size: 12px; margin-top: 4px;">${props.reference}</div>
    </div>
  </div>

  <h1 class="title">Receipt</h1>
  <p class="subtitle">Issued ${props.date}</p>

  <div class="amount-row">
    <div class="label">Amount</div>
    <div class="value">${props.amount}</div>
  </div>

  <div class="row"><span class="label">Service</span><span class="value">${props.service}</span></div>
  ${props.recipient ? `<div class="row"><span class="label">Recipient</span><span class="value">${props.recipient}</span></div>` : ""}
  <div class="row"><span class="label">Status</span><span class="value"><span class="status-badge">${props.status}</span></span></div>
  <div class="row"><span class="label">Transaction ID</span><span class="value" style="font-family: monospace; font-size: 12px;">${props.reference}</span></div>
  <div class="row"><span class="label">Date</span><span class="value">${props.date}</span></div>

  <div class="footer">
    Thank you for using ZamoraxPay. This receipt was generated electronically and is valid without signature.<br />
    Need help? Visit <strong>zamoraxpay.com.ng/contact</strong>
  </div>

  <script>
    window.onload = function() { window.print(); };
  </script>
</body>
</html>`

  // Create a hidden iframe so we can print without polluting the main
  // document's CSS. This is the same trick receipt-printing libraries
  // (react-to-print, etc.) use, without the dependency.
  const iframe = document.createElement("iframe")
  iframe.style.position = "fixed"
  iframe.style.right = "0"
  iframe.style.bottom = "0"
  iframe.style.width = "0"
  iframe.style.height = "0"
  iframe.style.border = "0"
  iframe.setAttribute("aria-hidden", "true")
  iframe.setAttribute("tabindex", "-1")
  document.body.appendChild(iframe)
  const doc = iframe.contentWindow?.document
  if (!doc) {
    iframe.remove()
    return
  }
  doc.open()
  doc.write(html)
  doc.close()
  // Give the iframe a tick to lay out before triggering print.
  // The inline script in the HTML already calls window.print() on load,
  // but Safari sometimes needs the iframe to focus first.
  setTimeout(() => {
    try {
      iframe.contentWindow?.focus()
    } catch {}
    // Cleanup after the print dialog closes (or is cancelled).
    setTimeout(() => {
      try { iframe.remove() } catch {}
    }, 2000)
  }, 300)
}

export function ReceiptButton(props: ReceiptButtonProps) {
  const [copied, setCopied] = useState(false)
  const toast = useToast()

  const copy = async () => {
    try {
      await navigator.clipboard?.writeText(receiptText(props))
      setCopied(true)
      toast("Receipt copied to clipboard", "success")
      window.setTimeout(() => setCopied(false), 1400)
    } catch {}
  }

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
    toast("Receipt downloaded", "success")
  }

  const printPdf = () => {
    printReceiptAsPdf(props)
    toast("Opening print dialog, save as PDF to download", "info")
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
        onClick={copy}
        className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-medium text-muted-foreground transition hover:bg-muted hover:text-primary"
        aria-label={`Copy receipt for ${props.reference}`}
      >
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        {copied ? "Copied" : "Copy"}
      </button>
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
        onClick={printPdf}
        className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-medium text-muted-foreground transition hover:bg-muted hover:text-primary"
        aria-label={`Print or save receipt as PDF for ${props.reference}`}
        title="Print or save as PDF"
      >
        <FileText className="h-3 w-3" />
        PDF
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
