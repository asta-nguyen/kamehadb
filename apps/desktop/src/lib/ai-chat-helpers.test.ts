import { describe, expect, it } from 'vitest';
import { mergeToolActivity, type ChatToolActivity } from './ai-chat-helpers';

describe('mergeToolActivity', () => {
  it('appends a new tool activity', () => {
    const next: ChatToolActivity = { id: 't1', title: 'Query', status: 'in_progress' };
    expect(mergeToolActivity(undefined, next)).toEqual([next]);
  });

  it('merges repeated updates by id without dropping the earlier title', () => {
    const merged = mergeToolActivity([{ id: 't1', title: 'Query', status: 'in_progress' }], {
      id: 't1',
      title: '',
      status: 'completed',
    });
    expect(merged).toEqual([{ id: 't1', title: 'Query', status: 'completed' }]);
  });
});
