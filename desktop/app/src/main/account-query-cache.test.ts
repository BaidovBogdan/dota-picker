import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { QueryClient } from '@tanstack/react-query';
import {
  accountQueryKey,
  clearAccountQueryCache,
  sessionQueryKey,
} from '../shared/account-query-cache.ts';

describe('account query cache isolation', () => {
  it('removes every account-scoped value before a different account can use the renderer', async () => {
    const queryClient = new QueryClient();
    const accountA = '8f5b8d70-7a53-48c5-86b0-4c6f48efb84d';
    const accountB = '69ed403c-1358-4210-9cc8-115d1a0a5a41';
    const historyAKey = accountQueryKey(accountA, 'history');
    const quotaAKey = accountQueryKey(accountA, 'quota');
    const publicHeroesKey = ['heroes'] as const;

    queryClient.setQueryData(historyAKey, { owner: 'A', items: ['analysis-a'] });
    queryClient.setQueryData(quotaAKey, { owner: 'A', remaining: 1 });
    queryClient.setQueryData(publicHeroesKey, ['pudge']);

    await clearAccountQueryCache(queryClient);
    queryClient.setQueryData(sessionQueryKey, {
      authenticated: true,
      account: { id: accountB },
    });
    const historyBKey = accountQueryKey(accountB, 'history');
    queryClient.setQueryData(historyBKey, { owner: 'B', items: ['analysis-b'] });

    assert.equal(queryClient.getQueryData(historyAKey), undefined);
    assert.equal(queryClient.getQueryData(quotaAKey), undefined);
    assert.deepEqual(queryClient.getQueryData(historyBKey), { owner: 'B', items: ['analysis-b'] });
    assert.deepEqual(queryClient.getQueryData(publicHeroesKey), ['pudge']);
    assert.deepEqual(queryClient.getQueryData(sessionQueryKey), {
      authenticated: true,
      account: { id: accountB },
    });
  });
});
