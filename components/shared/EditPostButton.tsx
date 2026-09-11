// components/shared/EditPostButton.tsx
"use client"

import Link from "next/link"
import { useAuth } from "@/hooks/useAuth"

export function EditPostButton({ postId }: { postId: string }) {
  const { user, loading } = useAuth()
  const isAdmin = !!user?.adminRole

  if (loading || !isAdmin) return null

  return (
    <Link
      href={`/admin/blog/${postId}/edit`}
      className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-secondary hover:bg-muted"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4"
      >
        <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
        <path d="m15 5 4 4" />
      </svg>
      Edit
    </Link>
  )
}
