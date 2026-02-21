import { z } from 'zod';

export const transportTypeSchema = z.enum(['stdio', 'http']);
export const dbModeSchema = z.enum(['global', 'per-repo']);

export const agentConfigSchema = z.object({
  runtime: z.string().optional(),
  autoSetup: z.boolean().optional(),
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
  dbMode: dbModeSchema.optional(),
  agent: agentConfigSchema.optional(),
  pr: prConfigSchema.optional(),
});

export type TransportType = z.infer<typeof transportTypeSchema>;
export type DbMode = z.infer<typeof dbModeSchema>;
export type AgentConfig = z.infer<typeof agentConfigSchema>;
export type CycleMode = z.infer<typeof cycleModeSchema>;
export type MergeMethod = z.infer<typeof mergeMethodSchema>;
export type PrConfig = z.infer<typeof prConfigSchema>;
export type CawConfig = z.infer<typeof cawConfigSchema>;
