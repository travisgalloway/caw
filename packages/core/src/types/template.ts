export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string | null;
  template: string;
  version: number;
  created_at: number;
  updated_at: number;
}
