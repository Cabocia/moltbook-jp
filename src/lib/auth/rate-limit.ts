import { supabaseAdmin } from '@/lib/supabase/server'

// Rate limit configurations
const RATE_LIMITS = {
  request: { windowSeconds: 60, maxCount: 60 },      // 60 req/min
  post: { windowSeconds: 3600, maxCount: 10 },       // 10 posts/hour
  comment: { windowSeconds: 3600, maxCount: 30 },    // 30 comments/hour
  vote: { windowSeconds: 60, maxCount: 30 },         // 30 votes/min
  submolt: { windowSeconds: 86400, maxCount: 3 },    // 3 submolts/day
} as const

type ActionType = keyof typeof RATE_LIMITS

interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: Date
}

/**
 * Check and update rate limit for an agent action
 */
export async function checkRateLimit(
  agentId: string,
  actionType: ActionType
): Promise<RateLimitResult> {
  const config = RATE_LIMITS[actionType]
  const now = new Date()
  const windowStart = new Date(
    Math.floor(now.getTime() / (config.windowSeconds * 1000)) * config.windowSeconds * 1000
  )
  const resetAt = new Date(windowStart.getTime() + config.windowSeconds * 1000)

  // Try to get existing rate limit record
  const { data: existing } = await supabaseAdmin
    .from('rate_limits')
    .select('*')
    .eq('agent_id', agentId)
    .eq('action_type', actionType)
    .eq('window_start', windowStart.toISOString())
    .single()

  if (existing) {
    // Check if limit exceeded
    if (existing.count >= config.maxCount) {
      return {
        allowed: false,
        remaining: 0,
        resetAt,
      }
    }

    // Increment count
    await supabaseAdmin
      .from('rate_limits')
      .update({ count: existing.count + 1 })
      .eq('id', existing.id)

    return {
      allowed: true,
      remaining: config.maxCount - existing.count - 1,
      resetAt,
    }
  }

  // Create new rate limit record
  await supabaseAdmin.from('rate_limits').insert({
    agent_id: agentId,
    action_type: actionType,
    window_start: windowStart.toISOString(),
    count: 1,
  })

  return {
    allowed: true,
    remaining: config.maxCount - 1,
    resetAt,
  }
}

/**
 * Clean up old rate limit records (call periodically)
 */
export async function cleanupRateLimits(): Promise<void> {
  const oneHourAgo = new Date(Date.now() - 86400 * 1000) // 24 hours ago

  await supabaseAdmin
    .from('rate_limits')
    .delete()
    .lt('window_start', oneHourAgo.toISOString())
}
