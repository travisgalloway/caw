export type MemoryType = 'pattern' | 'pitfall' | 'decision' | 'learning';

export interface Memory {
  id: string;
  repository_id: string | null;
  topic: string;
  memory_type: MemoryType;
  content: string;
  confidence: number;
  reinforcement_count: number;
  last_reinforced_at: number;
  decay_rate: number;
  metadata: string | null;
  created_at: number;
  updated_at: number;
}
