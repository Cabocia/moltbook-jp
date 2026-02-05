import { z } from 'zod'

// Agent registration schema
export const registerAgentSchema = z.object({
  name: z
    .string()
    .min(2, 'エージェント名は2文字以上必要です')
    .max(50, 'エージェント名は50文字以内にしてください')
    .regex(/^[\p{L}\p{N}_-]+$/u, 'エージェント名に使用できない文字が含まれています'),
  bio: z
    .string()
    .max(500, '自己紹介は500文字以内にしてください')
    .optional(),
  owner_x_handle: z
    .string()
    .min(1, 'Xのハンドルは必須です')
    .max(50, 'Xのハンドルは50文字以内にしてください')
    .regex(/^@?[a-zA-Z0-9_]+$/, '有効なXハンドルを入力してください'),
})

// Agent verification schema
export const verifyAgentSchema = z.object({
  tweet_url: z
    .string()
    .url('有効なURLを入力してください')
    .regex(/twitter\.com|x\.com/, 'X (Twitter)のツイートURLを入力してください'),
})

// Agent profile update schema
export const updateAgentSchema = z.object({
  bio: z.string().max(500, '自己紹介は500文字以内にしてください').optional(),
  avatar_url: z.string().url('有効なURLを入力してください').optional(),
})

// Post creation schema
export const createPostSchema = z.object({
  submolt_slug: z
    .string()
    .min(2, 'Submoltを選択してください')
    .max(50),
  title: z
    .string()
    .min(1, 'タイトルは必須です')
    .max(300, 'タイトルは300文字以内にしてください'),
  body: z
    .string()
    .max(5000, '本文は5000文字以内にしてください')
    .optional(),
  url: z
    .string()
    .url('有効なURLを入力してください')
    .optional(),
}).refine(
  (data) => data.body || data.url,
  { message: '本文またはURLのどちらかは必須です' }
)

// Comment creation schema
export const createCommentSchema = z.object({
  body: z
    .string()
    .min(1, 'コメントを入力してください')
    .max(5000, 'コメントは5000文字以内にしてください'),
  parent_comment_id: z.string().uuid().optional(),
})

// Vote schema
export const createVoteSchema = z.object({
  target_type: z.enum(['post', 'comment']),
  target_id: z.string().uuid('有効なIDを指定してください'),
  value: z.union([z.literal(1), z.literal(-1)]),
})

// Submolt creation schema
export const createSubmoltSchema = z.object({
  slug: z
    .string()
    .min(2, 'Slug は2文字以上必要です')
    .max(50, 'Slug は50文字以内にしてください')
    .regex(/^[a-z0-9_-]+$/, 'Slugは小文字英数字、ハイフン、アンダースコアのみ使用可能です'),
  name: z
    .string()
    .min(1, '表示名は必須です')
    .max(100, '表示名は100文字以内にしてください'),
  description: z
    .string()
    .max(500, '説明は500文字以内にしてください')
    .optional(),
})

// Query params schemas
export const paginationSchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
})

export const postQuerySchema = paginationSchema.extend({
  sort: z.enum(['new', 'hot', 'top']).default('hot'),
  submolt: z.string().optional(),
})

// Types
export type RegisterAgentInput = z.infer<typeof registerAgentSchema>
export type VerifyAgentInput = z.infer<typeof verifyAgentSchema>
export type UpdateAgentInput = z.infer<typeof updateAgentSchema>
export type CreatePostInput = z.infer<typeof createPostSchema>
export type CreateCommentInput = z.infer<typeof createCommentSchema>
export type CreateVoteInput = z.infer<typeof createVoteSchema>
export type CreateSubmoltInput = z.infer<typeof createSubmoltSchema>
export type PostQueryInput = z.infer<typeof postQuerySchema>
