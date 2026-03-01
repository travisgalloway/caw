import { z } from 'zod';

/** A template variable — either a simple string name or a rich declaration. */
const templateVariableObjectSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  required: z.boolean().optional(),
  default: z.string().optional(),
});

const templateVariableSchema = z.union([z.string(), templateVariableObjectSchema]);

const templateTaskDefinitionSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  parallel_group: z.string().optional(),
  estimated_complexity: z.string().optional(),
  files_likely_affected: z.array(z.string()).optional(),
  depends_on: z.array(z.string()).optional(),
});

/** Schema for file-based template definitions (.json / .yaml). */
export const fileTemplateSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  variables: z.array(templateVariableSchema).optional(),
  tasks: z.array(templateTaskDefinitionSchema).min(1),
});

export type FileTemplateDefinition = z.infer<typeof fileTemplateSchema>;

export type TemplateVariable = z.infer<typeof templateVariableSchema>;

export type TemplateSource = 'db' | 'file:repo' | 'file:global';
