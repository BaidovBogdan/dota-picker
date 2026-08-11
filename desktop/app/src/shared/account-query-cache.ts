const accountQueryRoot = ['account'] as const;

type AccountQueryClient = {
  cancelQueries: (filters: { queryKey: readonly unknown[] }) => Promise<unknown>;
  removeQueries: (filters: { queryKey: readonly unknown[] }) => void;
};

export const sessionQueryKey = ['session'] as const;

export function accountQueryKey<T extends readonly unknown[]>(
  accountId: string,
  ...key: T
): readonly ['account', string, ...T] {
  return ['account', accountId, ...key];
}

export async function clearAccountQueryCache(queryClient: AccountQueryClient): Promise<void> {
  await queryClient.cancelQueries({ queryKey: accountQueryRoot });
  queryClient.removeQueries({ queryKey: accountQueryRoot });
}
