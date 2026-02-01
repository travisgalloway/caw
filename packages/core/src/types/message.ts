export type MessageType =
  | 'task_assignment'
  | 'status_update'
  | 'query'
  | 'response'
  | 'broadcast';

export type MessagePriority = 'low' | 'normal' | 'high' | 'urgent';

export type MessageStatus = 'unread' | 'read' | 'archived';

export interface Message {
  id: string;
  sender_id: string | null;
  recipient_id: string;
  message_type: MessageType;
  subject: string | null;
  body: string;
  priority: MessagePriority;
  status: MessageStatus;
  workflow_id: string | null;
  task_id: string | null;
  reply_to_id: string | null;
  thread_id: string | null;
  created_at: number;
  read_at: number | null;
  expires_at: number | null;
}
