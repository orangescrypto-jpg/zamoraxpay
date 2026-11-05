"use client"

import { useState } from "react"
import { Check, Copy, Download, Share2 } from "lucide-react"
import { useToast } from "@/components/shared/ToastProvider"

interface ReceiptButtonProps {
  service: string
  reference: string
  amount: string
  status: string
  date: string
  recipient?: string
}

// Brand tokens — kept in sync with app/globals.css so the printed
// receipt matches what users see on the site, even though the print
// iframe can't read Tailwind/CSS variables from the parent document.
const BRAND = {
  orange: "#FF6B00",
  orangeSoft: "rgba(255, 107, 0, 0.10)",
  navy: "#0F172A",
  navySoft: "#1E293B",
  ink: "#0F172A",
  muted: "#64748B",
  hairline: "#E2E8F0",
  surface: "#F8FAFC",
  white: "#FFFFFF",
}

function statusTone(status: string) {
  const s = (status || "").toLowerCase()
  if (s === "success" || s === "completed" || s === "approved") {
    return { bg: "#DCFCE7", fg: "#166534", dot: "#16A34A" }
  }
  if (s === "failed" || s === "rejected" || s === "cancelled") {
    return { bg: "#FEE2E2", fg: "#991B1B", dot: "#DC2626" }
  }
  if (s === "refunded" || s === "partial") {
    return { bg: "#FEF3C7", fg: "#92400E", dot: "#D97706" }
  }
  return { bg: "#E0E7FF", fg: "#3730A3", dot: "#4F46BF" } // pending / unknown
}

function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
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
    "This receipt was electronically generated and is valid without signature.",
    "Need help? Visit zamoraxpay.com.ng/contact",
  ].filter(Boolean).join("\n")
}

/**
 * Build a printable, on-brand HTML receipt in a hidden iframe, then
 * trigger a print dialog. The user can save the printed page as PDF
 * from the browser's print dialog (this is the "Save as PDF" flow
 * shown in the Android Print Spooler). No external PDF library needed
 * — this works offline and stays tiny.
 *
 * Uses an isolated iframe so the print stylesheet doesn't conflict
 * with the main app's Tailwind CSS. The HTML below is self-contained:
 * it inlines the brand palette, the "Z" logo tile, and the layout, so
 * the printed PDF looks the same regardless of the user's theme
 * (light/dark) or any CSS overrides.
 */
function printReceiptAsPdf(props: ReceiptButtonProps) {
  const tone = statusTone(props.status)
  // Page setup: A5 is receipt-sized and prints cleanly on both A4
  // and Letter paper. Generous margins so nothing clips.
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>ZamoraxPay Receipt - ${escapeHtml(props.reference)}</title>
<style>
  @page { size: A5; margin: 14mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, Arial, sans-serif;
    color: ${BRAND.ink};
    background: ${BRAND.white};
    padding: 28px 28px 24px;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .sheet {
    max-width: 540px;
    margin: 0 auto;
  }

  /* ── Header ─────────────────────────────────────────────── */
  .header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    padding-bottom: 18px;
    border-bottom: 2px solid ${BRAND.orange};
  }
  .brand { display: flex; align-items: center; gap: 10px; }
  .brand-tile {
    width: 34px; height: 34px;
    display: inline-flex; align-items: center; justify-content: center;
    background: ${BRAND.orange};
    color: ${BRAND.white};
    font-weight: 700;
    font-size: 18px;
    border-radius: 8px;
    letter-spacing: -0.02em;
  }
  .brand-name {
    font-size: 18px;
    font-weight: 700;
    letter-spacing: -0.02em;
    line-height: 1.1;
  }
  .brand-name .ink { color: ${BRAND.ink}; }
  .brand-name .orange { color: ${BRAND.orange}; }
  .brand-sub {
    font-size: 10px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: ${BRAND.muted};
    font-weight: 600;
    margin-top: 2px;
  }
  .header-right {
    text-align: right;
    font-size: 10px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: ${BRAND.muted};
    font-weight: 600;
  }
  .header-right .ref {
    font-size: 12px;
    color: ${BRAND.ink};
    letter-spacing: 0;
    text-transform: none;
    margin-top: 4px;
    font-weight: 600;
    white-space: nowrap;
  }

  /* ── Hero amount block ──────────────────────────────────── */
  .hero {
    background: ${BRAND.navy};
    color: ${BRAND.white};
    border-radius: 14px;
    padding: 22px 24px;
    margin: 22px 0 18px;
    position: relative;
    overflow: hidden;
  }
  .hero::before {
    content: "";
    position: absolute;
    right: -28px; top: -28px;
    width: 110px; height: 110px;
    border-radius: 999px;
    background: ${BRAND.orange};
    opacity: 0.20;
    pointer-events: none;
  }
  .hero::after {
    content: "";
    position: absolute;
    right: 36px; bottom: -54px;
    width: 90px; height: 90px;
    border-radius: 999px;
    border: 2px solid ${BRAND.orange};
    opacity: 0.10;
    pointer-events: none;
  }
  .hero > * { position: relative; z-index: 1; }
  .hero .label {
    font-size: 10px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: rgba(255,255,255,0.65);
    font-weight: 600;
  }
  .hero .amount {
    font-size: 30px;
    font-weight: 700;
    letter-spacing: -0.02em;
    color: ${BRAND.orange};
    margin-top: 6px;
    line-height: 1.1;
  }
  .hero .status-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 14px;
  }
  .status-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 11px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
    text-transform: capitalize;
    background: ${tone.bg};
    color: ${tone.fg};
  }
  .status-badge .dot {
    width: 6px; height: 6px; border-radius: 999px;
    background: ${tone.dot};
  }

  /* ── Details rows ───────────────────────────────────────── */
  .details {
    border: 1px solid ${BRAND.hairline};
    border-radius: 12px;
    overflow: hidden;
  }
  .row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    padding: 12px 16px;
    border-bottom: 1px solid ${BRAND.hairline};
    font-size: 13px;
  }
  .row:last-child { border-bottom: 0; }
  .row .label {
    color: ${BRAND.muted};
    font-weight: 500;
    flex-shrink: 0;
  }
  .row .value {
    color: ${BRAND.ink};
    font-weight: 600;
    text-align: right;
    word-break: break-word;
  }
  .row .value.mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 11px;
    font-weight: 500;
    word-break: break-all;
    max-width: 60%;
  }

  /* ── Footer ─────────────────────────────────────────────── */
  .footer {
    margin-top: 26px;
    padding-top: 16px;
    border-top: 1px solid ${BRAND.hairline};
    text-align: center;
    font-size: 11px;
    line-height: 1.55;
    color: ${BRAND.muted};
  }
  .footer .thanks {
    color: ${BRAND.ink};
    font-weight: 600;
    font-size: 12px;
    margin-bottom: 4px;
  }
  .footer a, .footer .link {
    color: ${BRAND.orange};
    text-decoration: none;
    font-weight: 600;
  }
  .footer .signature {
    margin-top: 8px;
    font-style: italic;
    color: ${BRAND.muted};
  }

  /* ── Print tweaks ───────────────────────────────────────── */
  @media print {
    body { padding: 0; }
    .sheet { max-width: none; }
    .hero { break-inside: avoid; }
    .details { break-inside: avoid; }
  }
</style>
</head>
<body>
  <div class="sheet">

    <div class="header">
      <div class="brand">
        <span class="brand-tile">Z</span>
        <div>
          <div class="brand-name"><span class="ink">Zamorax</span><span class="orange">Pay</span></div>
          <div class="brand-sub">Transaction Receipt</div>
        </div>
      </div>
      <div class="header-right">
        Issued
        <div class="ref">${escapeHtml(props.date)}</div>
      </div>
    </div>

    <div class="hero">
      <div class="label">Amount</div>
      <div class="amount">${escapeHtml(props.amount)}</div>
      <div class="status-row">
        <span class="status-badge"><span class="dot"></span>${escapeHtml(props.status)}</span>
      </div>
    </div>

    <div class="details">
      <div class="row">
        <span class="label">Service</span>
        <span class="value">${escapeHtml(props.service)}</span>
      </div>
      ${props.recipient ? `<div class="row"><span class="label">Recipient</span><span class="value">${escapeHtml(props.recipient)}</span></div>` : ""}
      <div class="row">
        <span class="label">Transaction ID</span>
        <span class="value mono">${escapeHtml(props.reference)}</span>
      </div>
      <div class="row">
        <span class="label">Date</span>
        <span class="value">${escapeHtml(props.date)}</span>
      </div>
    </div>

    <div class="footer">
      <div class="thanks">Thank you for using ZamoraxPay.</div>
      This receipt was electronically generated and is valid without signature.<br />
      Need help? Visit <span class="link">zamoraxpay.com.ng/contact</span>
      <div class="signature">— The ZamoraxPay Team</div>
    </div>

  </div>

  <script>
    // Give the iframe a tick to lay out, then trigger the print
    // dialog. Safari sometimes needs an explicit focus() first.
    window.onload = function() {
      try { window.focus(); } catch (e) {}
      setTimeout(function() { window.print(); }, 80);
    };
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
  // Cleanup after the print dialog closes (or is cancelled). Two
  // seconds is enough for the dialog to fully take over the viewport
  // in every browser we support.
  setTimeout(() => {
    try {
      iframe.remove()
    } catch {}
  }, 2000)
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

  // "Receipt" opens a styled, on-brand print preview. The user can
  // then pick "Save as PDF" in the system print dialog to download a
  // real PDF file. This works on every platform (Android, iOS,
  // desktop) with no extra dependencies.
  const download = () => {
    printReceiptAsPdf(props)
    toast("Opening print dialog — choose \"Save as PDF\" to download", "info")
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
        aria-label={`Download receipt as PDF for ${props.reference}`}
        title="Save as PDF"
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
