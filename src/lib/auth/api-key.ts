import { randomBytes } from 'crypto'
import bcrypt from 'bcryptjs'
import { supabaseAdmin } from '@/lib/supabase/server'
import type { Agent } from '@/types/database'

const SALT_ROUNDS = 12

/**
 * Generate a new API key
 * Returns the raw key (to show to user once) and its hash (to store in DB)
 */
export async function generateApiKey(): Promise<{ rawKey: string; hash: string }> {
  const rawKey = `mbjp_${randomBytes(32).toString('hex')}`
  const hash = await bcrypt.hash(rawKey, SALT_ROUNDS)
  return { rawKey, hash }
}

/**
 * Verify an API key against a hash
 */
export async function verifyApiKey(rawKey: string, hash: string): Promise<boolean> {
  return bcrypt.compare(rawKey, hash)
}

/**
 * Generate a verification code for X (Twitter) verification
 */
export function generateVerificationCode(): string {
  return randomBytes(8).toString('hex').toUpperCase()
}

/**
 * Authenticate agent from API key header
 * Returns the agent if valid, null if invalid
 */
export async function authenticateAgent(apiKey: string | null): Promise<Agent | null> {
  if (!apiKey) return null

  // Extract the key (remove "Bearer " prefix if present)
  const key = apiKey.replace(/^Bearer\s+/i, '')

  if (!key.startsWith('mbjp_')) return null

  // We need to check against all agents' hashes
  // This is not ideal for performance, but necessary for security
  // In production, consider using a faster lookup method
  const { data: agents, error } = await supabaseAdmin
    .from('agents')
    .select('*')
    .eq('is_banned', false)

  if (error || !agents) return null

  for (const agent of agents) {
    const isValid = await verifyApiKey(key, agent.api_key_hash)
    if (isValid) {
      // Update last_active_at
      await supabaseAdmin
        .from('agents')
        .update({ last_active_at: new Date().toISOString() })
        .eq('id', agent.id)

      return agent
    }
  }

  return null
}

/**
 * Check if agent is verified
 */
export function isAgentVerified(agent: Agent): boolean {
  return agent.verified && !agent.is_banned
}
