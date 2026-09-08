// components/shared/WhatsAppSupportButton.tsx
"use client"

import { useEffect, useState } from "react"

export default function WhatsAppSupportButton() {
  const [state, setState] = useState<{ enabled: boolean; number: string } | null>(null)

  useEffect(() => {
    fetch("/api/whatsapp-support")
      .then((res) => res.json())
      .then((data) => setState({ enabled: !!data.enabled, number: data.number ?? "" }))
      .catch(() => setState({ enabled: false, number: "" }))
  }, [])

  if (!state?.enabled) return null

  return (
    <a
      href={`https://wa.me/${state.number}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with us on WhatsApp"
      className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] shadow-lg transition-transform hover:scale-105"
    >
      <svg viewBox="0 0 32 32" className="h-7 w-7 fill-white">
        <path d="M16.001 3C9.373 3 4 8.373 4 15.001c0 2.386.7 4.6 1.91 6.47L4 29l7.72-1.87A11.94 11.94 0 0 0 16.001 27C22.63 27 28 21.628 28 15.001 28 8.373 22.63 3 16.001 3zm0 21.8a9.75 9.75 0 0 1-4.98-1.36l-.357-.212-3.72.9.94-3.63-.233-.373A9.76 9.76 0 0 1 6.2 15C6.2 9.596 10.596 5.2 16.001 5.2S25.8 9.596 25.8 15c0 5.404-4.396 9.8-9.799 9.8zm5.36-7.34c-.294-.147-1.738-.858-2.008-.956-.27-.098-.466-.147-.663.147-.196.294-.76.956-.932 1.152-.171.196-.343.22-.637.073-.294-.147-1.24-.457-2.362-1.457-.873-.779-1.463-1.74-1.634-2.034-.171-.294-.018-.453.129-.6.132-.132.294-.343.44-.514.147-.171.196-.294.294-.49.098-.196.049-.368-.024-.514-.073-.147-.663-1.597-.909-2.187-.24-.575-.484-.497-.663-.506-.171-.008-.368-.01-.564-.01-.196 0-.514.073-.783.368-.27.294-1.03 1.007-1.03 2.456 0 1.45 1.055 2.85 1.202 3.046.147.196 2.077 3.172 5.033 4.448.703.303 1.252.484 1.68.62.706.224 1.348.192 1.856.117.566-.085 1.738-.71 1.983-1.396.245-.686.245-1.274.171-1.396-.073-.122-.269-.196-.563-.343z" />
      </svg>
    </a>
  )
}
