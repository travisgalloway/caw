import { z } from 'zod';

export const transportTypeSchema = z.enum(['stdio', 'http']);

export const agentRuntimeSchema = z.enum(['claude-code']);

export const workflowSourceTypeSchema = z.enum([
  'prompt',
  'github_issue',
  'spec_file',
  'template',
  'custom',
]);

export const agentConfigSchema = z.object({
  runtime: agentRuntimeSchema.optional(),
  autoSetup: z.boolean().optional(),
  maxParallelAgents: z.number().int().min(1).max(50).optional(),
  agentsPerWorkflow: z.number().int().min(1).max(20).optional(),
});

export const cycleModeSchema = z.enum(['auto', 'hitl', 'off']);
export const mergeMethodSchema = z.enum(['squash', 'merge', 'rebase']);

export const prConfigSchema = z.object({
  pollEnabled: z.boolean().optional(),
  pollInterval: z.number().int().min(30).max(3600).optional(),
  cycle: cycleModeSchema.optional(),
  mergeMethod: mergeMethodSchema.optional(),
  ciTimeout: z.number().int().min(0).max(3600).optional(),
  noReview: z.boolean().optional(),
});

export const cawConfigSchema = z.object({
  transport: transportTypeSchema.optional(),
  port: z.number().int().min(1).max(65535).optional(),
  agent: agentConfigSchema.optional(),
  pr: prConfigSchema.optional(),
});

export const AGENT_DEFAULTS = {
  runtime: 'claude-code',
  maxParallelAgents: 10,
  agentsPerWorkflow: 3,
} as const;

export type TransportType = z.infer<typeof transportTypeSchema>;
export type AgentRuntime = z.infer<typeof agentRuntimeSchema>;
export type WorkflowSourceType = z.infer<typeof workflowSourceTypeSchema>;
export type AgentConfig = z.infer<typeof agentConfigSchema>;
export type CycleMode = z.infer<typeof cycleModeSchema>;
export type MergeMethod = z.infer<typeof mergeMethodSchema>;
export type PrConfig = z.infer<typeof prConfigSchema>;
export type CawConfig = z.infer<typeof cawConfigSchema>;
