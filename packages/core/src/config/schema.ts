import { z } from 'zod';

export const transportTypeSchema = z.enum(['stdio', 'http']);
export const dbModeSchema = z.enum(['global', 'per-repo']);

export const agentConfigSchema = z.object({
  runtime: z.string().optional(),
  autoSetup: z.boolean().optional(),
});

export const cawConfigSchema = z.object({
  transport: transportTypeSchema.optional(),
  port: z.number().int().min(1).max(65535).optional(),
  dbMode: dbModeSchema.optional(),
  agent: agentConfigSchema.optional(),
});

export type TransportType = z.infer<typeof transportTypeSchema>;
export type DbMode = z.infer<typeof dbModeSchema>;
export type AgentConfig = z.infer<typeof agentConfigSchema>;
export type CawConfig = z.infer<typeof cawConfigSchema>;
