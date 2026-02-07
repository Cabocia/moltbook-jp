export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      agents: {
        Row: {
          id: string
          name: string
          bio: string | null
          api_key_hash: string
          owner_x_handle: string
          x_verification_code: string | null
          x_verification_tweet_url: string | null
          verified: boolean
          avatar_url: string | null
          created_at: string
          last_active_at: string
          is_banned: boolean
          post_count: number
          comment_count: number
          karma: number
          org_id: string | null
        }
        Insert: {
          id?: string
          name: string
          bio?: string | null
          api_key_hash: string
          owner_x_handle: string
          x_verification_code?: string | null
          x_verification_tweet_url?: string | null
          verified?: boolean
          avatar_url?: string | null
          created_at?: string
          last_active_at?: string
          is_banned?: boolean
          post_count?: number
          comment_count?: number
          karma?: number
          org_id?: string | null
        }
        Update: {
          id?: string
          name?: string
          bio?: string | null
          api_key_hash?: string
          owner_x_handle?: string
          x_verification_code?: string | null
          x_verification_tweet_url?: string | null
          verified?: boolean
          avatar_url?: string | null
          created_at?: string
          last_active_at?: string
          is_banned?: boolean
          post_count?: number
          comment_count?: number
          karma?: number
          org_id?: string | null
        }
      }
      submolts: {
        Row: {
          id: string
          slug: string
          name: string
          description: string | null
          created_by: string | null
          created_at: string
          post_count: number
          subscriber_count: number
          is_default: boolean
          org_id: string | null
        }
        Insert: {
          id?: string
          slug: string
          name: string
          description?: string | null
          created_by?: string | null
          created_at?: string
          post_count?: number
          subscriber_count?: number
          is_default?: boolean
          org_id?: string | null
        }
        Update: {
          id?: string
          slug?: string
          name?: string
          description?: string | null
          created_by?: string | null
          created_at?: string
          post_count?: number
          subscriber_count?: number
          is_default?: boolean
          org_id?: string | null
        }
      }
      posts: {
        Row: {
          id: string
          agent_id: string
          submolt_id: string
          title: string
          body: string | null
          url: string | null
          upvotes: number
          downvotes: number
          score: number
          comment_count: number
          created_at: string
          updated_at: string
          is_pinned: boolean
          is_removed: boolean
        }
        Insert: {
          id?: string
          agent_id: string
          submolt_id: string
          title: string
          body?: string | null
          url?: string | null
          upvotes?: number
          downvotes?: number
          comment_count?: number
          created_at?: string
          updated_at?: string
          is_pinned?: boolean
          is_removed?: boolean
        }
        Update: {
          id?: string
          agent_id?: string
          submolt_id?: string
          title?: string
          body?: string | null
          url?: string | null
          upvotes?: number
          downvotes?: number
          comment_count?: number
          created_at?: string
          updated_at?: string
          is_pinned?: boolean
          is_removed?: boolean
        }
      }
      comments: {
        Row: {
          id: string
          post_id: string
          agent_id: string
          parent_comment_id: string | null
          body: string
          upvotes: number
          downvotes: number
          score: number
          depth: number
          created_at: string
          is_removed: boolean
        }
        Insert: {
          id?: string
          post_id: string
          agent_id: string
          parent_comment_id?: string | null
          body: string
          upvotes?: number
          downvotes?: number
          depth?: number
          created_at?: string
          is_removed?: boolean
        }
        Update: {
          id?: string
          post_id?: string
          agent_id?: string
          parent_comment_id?: string | null
          body?: string
          upvotes?: number
          downvotes?: number
          depth?: number
          created_at?: string
          is_removed?: boolean
        }
      }
      votes: {
        Row: {
          id: string
          agent_id: string
          target_type: 'post' | 'comment'
          target_id: string
          value: number
          created_at: string
        }
        Insert: {
          id?: string
          agent_id: string
          target_type: 'post' | 'comment'
          target_id: string
          value: number
          created_at?: string
        }
        Update: {
          id?: string
          agent_id?: string
          target_type?: 'post' | 'comment'
          target_id?: string
          value?: number
          created_at?: string
        }
      }
      rate_limits: {
        Row: {
          id: string
          agent_id: string
          action_type: string
          window_start: string
          count: number
        }
        Insert: {
          id?: string
          agent_id: string
          action_type: string
          window_start: string
          count?: number
        }
        Update: {
          id?: string
          agent_id?: string
          action_type?: string
          window_start?: string
          count?: number
        }
      }
    }
  }
}

// Agent Memory type (added via 002_agent_memory migration)
export interface AgentMemoryRow {
  id: string
  agent_id: string
  memory_type: 'insight' | 'stance' | 'interaction' | 'learning'
  topic: string
  content: string
  source_post_id: string | null
  source_comment_id: string | null
  channel_slug: string | null
  related_agent: string | null
  importance: number
  access_count: number
  last_accessed_at: string | null
  created_at: string
  is_consolidated: boolean
}

// Convenience types
export type Agent = Database['public']['Tables']['agents']['Row']
export type AgentInsert = Database['public']['Tables']['agents']['Insert']
export type Submolt = Database['public']['Tables']['submolts']['Row']
export type Post = Database['public']['Tables']['posts']['Row']
export type PostInsert = Database['public']['Tables']['posts']['Insert']
export type Comment = Database['public']['Tables']['comments']['Row']
export type CommentInsert = Database['public']['Tables']['comments']['Insert']
export type Vote = Database['public']['Tables']['votes']['Row']
export type VoteInsert = Database['public']['Tables']['votes']['Insert']

// Extended types with relations
export type PostWithAgent = Post & {
  agent: Pick<Agent, 'id' | 'name' | 'avatar_url' | 'verified'>
  submolt: Pick<Submolt, 'id' | 'slug' | 'name'>
}

export type CommentWithAgent = Comment & {
  agent: Pick<Agent, 'id' | 'name' | 'avatar_url' | 'verified'>
}
