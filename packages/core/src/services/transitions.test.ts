import { describe, expect, it } from 'bun:test';
import type { TaskStatus } from '../types/task';
import type { WorkflowStatus } from '../types/workflow';
import {
  isValidTaskTransition,
  isValidWorkflowTransition,
  TASK_TRANSITIONS,
  WORKFLOW_TRANSITIONS,
} from './transitions';

const ALL_WORKFLOW_STATUSES: WorkflowStatus[] = [
  'planning',
  'ready',
  'in_progress',
  'paused',
  'failed',
  'completed',
  'abandoned',
];

const ALL_TASK_STATUSES: TaskStatus[] = [
  'pending',
  'blocked',
  'planning',
  'in_progress',
  'paused',
  'completed',
  'failed',
  'skipped',
];

describe('WORKFLOW_TRANSITIONS', () => {
  it('has entries for all workflow statuses', () => {
    for (const status of ALL_WORKFLOW_STATUSES) {
      expect(WORKFLOW_TRANSITIONS[status]).toBeDefined();
    }
  });

  it('planning can transition to ready or abandoned', () => {
    expect(WORKFLOW_TRANSITIONS.planning).toEqual(['ready', 'abandoned']);
  });

  it('ready can transition to in_progress or abandoned', () => {
    expect(WORKFLOW_TRANSITIONS.ready).toEqual(['in_progress', 'abandoned']);
  });

  it('in_progress can transition to paused, completed, failed, or abandoned', () => {
    expect(WORKFLOW_TRANSITIONS.in_progress).toEqual([
      'paused',
      'completed',
      'failed',
      'abandoned',
    ]);
  });

  it('paused can transition to in_progress or abandoned', () => {
    expect(WORKFLOW_TRANSITIONS.paused).toEqual(['in_progress', 'abandoned']);
  });

  it('failed can transition to in_progress (retry)', () => {
    expect(WORKFLOW_TRANSITIONS.failed).toEqual(['in_progress']);
  });

  it('completed is terminal (no outgoing transitions)', () => {
    expect(WORKFLOW_TRANSITIONS.completed).toEqual([]);
  });

  it('abandoned is terminal (no outgoing transitions)', () => {
    expect(WORKFLOW_TRANSITIONS.abandoned).toEqual([]);
  });
});

describe('isValidWorkflowTransition', () => {
  it('allows all documented transitions', () => {
    for (const [from, targets] of Object.entries(WORKFLOW_TRANSITIONS)) {
      for (const to of targets) {
        expect(isValidWorkflowTransition(from as WorkflowStatus, to)).toBe(true);
      }
    }
  });

  it('rejects transitions from terminal states', () => {
    for (const status of ALL_WORKFLOW_STATUSES) {
      expect(isValidWorkflowTransition('completed', status)).toBe(false);
      expect(isValidWorkflowTransition('abandoned', status)).toBe(false);
    }
  });

  it('rejects self-transitions', () => {
    for (const status of ALL_WORKFLOW_STATUSES) {
      expect(isValidWorkflowTransition(status, status)).toBe(false);
    }
  });

  it('rejects backwards transitions not in the map', () => {
    expect(isValidWorkflowTransition('ready', 'planning')).toBe(false);
    expect(isValidWorkflowTransition('in_progress', 'ready')).toBe(false);
    expect(isValidWorkflowTransition('completed', 'in_progress')).toBe(false);
  });
});

describe('TASK_TRANSITIONS', () => {
  it('has entries for all task statuses', () => {
    for (const status of ALL_TASK_STATUSES) {
      expect(TASK_TRANSITIONS[status]).toBeDefined();
    }
  });

  it('pending can transition to planning', () => {
    expect(TASK_TRANSITIONS.pending).toEqual(['planning']);
  });

  it('blocked can transition to planning', () => {
    expect(TASK_TRANSITIONS.blocked).toEqual(['planning']);
  });

  it('planning can transition to in_progress or completed', () => {
    expect(TASK_TRANSITIONS.planning).toEqual(['in_progress', 'completed']);
  });

  it('in_progress can transition to completed, paused, or failed', () => {
    expect(TASK_TRANSITIONS.in_progress).toEqual(['completed', 'paused', 'failed']);
  });

  it('paused can transition to in_progress', () => {
    expect(TASK_TRANSITIONS.paused).toEqual(['in_progress']);
  });

  it('failed can transition to pending (retry) or skipped', () => {
    expect(TASK_TRANSITIONS.failed).toEqual(['pending', 'skipped']);
  });

  it('completed is terminal (no outgoing transitions)', () => {
    expect(TASK_TRANSITIONS.completed).toEqual([]);
  });

  it('skipped is terminal (no outgoing transitions)', () => {
    expect(TASK_TRANSITIONS.skipped).toEqual([]);
  });
});

describe('isValidTaskTransition', () => {
  it('allows all documented transitions', () => {
    for (const [from, targets] of Object.entries(TASK_TRANSITIONS)) {
      for (const to of targets) {
        expect(isValidTaskTransition(from as TaskStatus, to)).toBe(true);
      }
    }
  });

  it('rejects transitions from terminal states', () => {
    for (const status of ALL_TASK_STATUSES) {
      expect(isValidTaskTransition('completed', status)).toBe(false);
      expect(isValidTaskTransition('skipped', status)).toBe(false);
    }
  });

  it('rejects self-transitions', () => {
    for (const status of ALL_TASK_STATUSES) {
      expect(isValidTaskTransition(status, status)).toBe(false);
    }
  });

  it('rejects invalid backwards transitions', () => {
    expect(isValidTaskTransition('in_progress', 'planning')).toBe(false);
    expect(isValidTaskTransition('in_progress', 'pending')).toBe(false);
    expect(isValidTaskTransition('completed', 'in_progress')).toBe(false);
  });
});
