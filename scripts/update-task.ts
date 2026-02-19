import { createConnection } from '../packages/core/src/db/connection';
import { checkpointService, taskService } from '../packages/core/src/services/index';

const DB_PATH = '/Users/travisgalloway/github/caw/.caw/workflows.db';
const db = createConnection(DB_PATH);

const TASK_ID = 'tk_560ifydltswd';

// Move to planning first so setPlan works
taskService.updateStatus(db, TASK_ID, 'planning');
console.log('Status: planning');

// Set plan
const plan =
  'MessageDetailScreen.tsx already calls messageService.get(db, messageId, true) with markRead=true on line 19, which automatically marks the message as read when the detail screen opens. No additional changes needed — the implementation is complete.';
taskService.setPlan(db, TASK_ID, plan);
console.log('Plan set');

// Set in_progress
taskService.updateStatus(db, TASK_ID, 'in_progress');
console.log('Status: in_progress');

// Add checkpoint
checkpointService.add(db, {
  task_id: TASK_ID,
  type: 'progress',
  summary:
    'Verified MessageDetailScreen.tsx already uses messageService.get(db, messageId, true) with markRead=true flag. The auto-mark-as-read behavior is already implemented. Line 19: message = messageService.get(db, messageId, true).',
  files_changed: ['apps/tui/src/components/MessageDetailScreen.tsx'],
});
console.log('Checkpoint added');

// Set completed
taskService.updateStatus(db, TASK_ID, 'completed', {
  outcome:
    'MessageDetailScreen.tsx already correctly uses messageService.get(db, messageId, true) with the markRead=true flag (line 19). When the detail screen opens, this call automatically marks the message as read in the database. No code changes were needed — the implementation was already in place.',
});
console.log('Status: completed');

db.close();
