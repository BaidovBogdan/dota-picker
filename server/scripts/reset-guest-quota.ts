import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { loadConfig } from '../src/config/env.js';
import { createDatabase } from '../src/db/client.js';
import { accounts } from '../src/db/schema.js';
import { materializeQuota } from '../src/modules/quota/quota.logic.js';

const argv = process.argv.slice(2);

function readArgument(name: string) {
  const index = argv.indexOf(name);
  if (index === -1) return undefined;
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${name}`);
  }
  return value;
}

const inputSchema = z
  .object({
    confirmLocal: z.literal(true),
    accountId: z.uuid().optional(),
    deviceId: z.string().min(16).max(128).optional(),
    latestGuest: z.boolean(),
  })
  .superRefine((value, context) => {
    const targetCount =
      Number(value.accountId !== undefined) +
      Number(value.deviceId !== undefined) +
      Number(value.latestGuest);
    if (targetCount !== 1) {
      context.addIssue({
        code: 'custom',
        message: 'Choose exactly one target: --account-id, --device-id, or --latest-guest',
      });
    }
  });

function usage() {
  return [
    'Usage:',
    '  npm exec -- tsx scripts/reset-guest-quota.ts --account-id <uuid> --confirm-local',
    '  npm exec -- tsx scripts/reset-guest-quota.ts --device-id <device-id> --confirm-local',
    '  npm exec -- tsx scripts/reset-guest-quota.ts --latest-guest --confirm-local',
  ].join('\n');
}

async function main() {
  const parsed = inputSchema.safeParse({
    confirmLocal: argv.includes('--confirm-local') ? true : undefined,
    accountId: readArgument('--account-id'),
    deviceId: readArgument('--device-id'),
    latestGuest: argv.includes('--latest-guest'),
  });
  if (!parsed.success) {
    throw new Error(`${parsed.error.issues.map((issue) => issue.message).join('\n')}\n${usage()}`);
  }

  const config = loadConfig();
  if (config.nodeEnv === 'production') {
    throw new Error('Guest quota reset is disabled in production');
  }

  const databaseUrl = new URL(config.databaseUrl);
  const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
  if (!localHosts.has(databaseUrl.hostname)) {
    throw new Error(`Guest quota reset is limited to a local database, received host: ${databaseUrl.hostname}`);
  }

  const { db, pool } = createDatabase(config.databaseUrl);
  try {
    await db.transaction(async (tx) => {
      const targetCondition = parsed.data.accountId
        ? eq(accounts.id, parsed.data.accountId)
        : parsed.data.deviceId
          ? eq(accounts.deviceId, parsed.data.deviceId)
          : undefined;
      const [account] = targetCondition
        ? await tx
            .select()
            .from(accounts)
            .where(and(eq(accounts.kind, 'guest'), targetCondition))
            .for('update')
        : await tx
            .select()
            .from(accounts)
            .where(eq(accounts.kind, 'guest'))
            .orderBy(desc(accounts.updatedAt), desc(accounts.createdAt), desc(accounts.id))
            .limit(1)
            .for('update');

      if (!account) {
        throw new Error('Guest account was not found');
      }
      if (account.plan !== 'free') {
        throw new Error(`Refusing to change a guest account on the ${account.plan} plan`);
      }

      const now = new Date();
      const before = materializeQuota(
        {
          balance: account.quotaBalance,
          refreshedAt: account.quotaRefreshedAt,
        },
        config.quota.free,
        now,
      );
      console.log(
        JSON.stringify(
          {
            stage: 'before',
            accountId: account.id,
            deviceId: account.deviceId,
            plan: account.plan,
            quota: {
              storedBalance: account.quotaBalance,
              remaining: before.balance,
              limit: config.quota.free.max,
              refreshedAt: before.refreshedAt.toISOString(),
              nextRefillAt: before.nextRefillAt?.toISOString() ?? null,
            },
          },
          null,
          2,
        ),
      );

      const [updated] = await tx
        .update(accounts)
        .set({
          quotaBalance: config.quota.free.max,
          quotaRefreshedAt: now,
          updatedAt: now,
        })
        .where(and(eq(accounts.id, account.id), eq(accounts.kind, 'guest'), eq(accounts.plan, 'free')))
        .returning({
          id: accounts.id,
          deviceId: accounts.deviceId,
          plan: accounts.plan,
          quotaBalance: accounts.quotaBalance,
          quotaRefreshedAt: accounts.quotaRefreshedAt,
        });

      if (!updated) {
        throw new Error('Guest quota reset did not update an account');
      }

      console.log(
        JSON.stringify(
          {
            stage: 'after',
            accountId: updated.id,
            deviceId: updated.deviceId,
            plan: updated.plan,
            quota: {
              remaining: updated.quotaBalance,
              limit: config.quota.free.max,
              refreshedAt: updated.quotaRefreshedAt.toISOString(),
              nextRefillAt: null,
            },
          },
          null,
          2,
        ),
      );
    });
  } finally {
    await pool.end();
  }
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
