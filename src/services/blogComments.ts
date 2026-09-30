// src/services/blogComments.ts
// Service abstraction layer — blog comments. Deliberately simple:
// display name + comment text, no account required. Held 'pending' by
// default; admin/moderator approves before it shows publicly.

import { d1Query } from "@/lib/d1"
import { randomUUID } from "crypto"

export interface BlogComment {
  id: string
  postId: string
  name: string
  comment: string
  status: "pending" | "approved" | "rejected"
  createdAt: string
}

function mapRow(r: any): BlogComment {
  return {
    id: r.id,
    postId: r.post_id,
    name: r.name,
    comment: r.comment,
    status: r.status,
    createdAt: r.created_at,
  }
}

export async function listApprovedComments(postId: string, nativeDB?: any): Promise<BlogComment[]> {
  const result = await d1Query(
    "SELECT * FROM blog_comments WHERE post_id = ? AND status = 'approved' ORDER BY created_at ASC",
    [postId],
    nativeDB,
  )
  return (result.results ?? []).map(mapRow)
}

export async function listAllCommentsAdmin(status?: string, nativeDB?: any): Promise<BlogComment[]> {
  const sql = status
    ? "SELECT * FROM blog_comments WHERE status = ? ORDER BY created_at DESC"
    : "SELECT * FROM blog_comments ORDER BY created_at DESC"
  const result = await d1Query(sql, status ? [status] : [], nativeDB)
  return (result.results ?? []).map(mapRow)
}

export async function createComment(
  params: { postId: string; name: string; comment: string; ipAddress?: string },
  nativeDB?: any,
): Promise<string> {
  const name = params.name.trim().slice(0, 80)
  const comment = params.comment.trim().slice(0, 3000)
  if (!name) throw new Error("Name is required")
  if (!comment) throw new Error("Comment is required")

  const id = randomUUID()
  await d1Query(
    `INSERT INTO blog_comments (id, post_id, name, comment, status, ip_address)
     VALUES (?, ?, ?, ?, 'pending', ?)`,
    [id, params.postId, name, comment, params.ipAddress ?? null],
    nativeDB,
  )
  return id
}

export async function setCommentStatus(
  id: string,
  status: "approved" | "rejected",
  nativeDB?: any,
): Promise<void> {
  await d1Query("UPDATE blog_comments SET status = ? WHERE id = ?", [status, id], nativeDB)
}

export async function deleteComment(id: string, nativeDB?: any): Promise<void> {
  await d1Query("DELETE FROM blog_comments WHERE id = ?", [id], nativeDB)
}
