import { count, sql } from 'drizzle-orm';
import { loadConfig } from '../src/config/env.js';
import { createDatabase } from '../src/db/client.js';
import { accounts } from '../src/db/schema.js';
import { AdminService } from '../src/modules/admin/admin.service.js';

const requiredConfirmation = 'GRANT_PRO_ALL';

async function run() {
  const apply = process.argv.includes('--apply');
  const config = loadConfig();
  const { db, pool } = createDatabase(config.databaseUrl);

  try {
    const [totals] = await db.select({
      totalAccounts: count(),
      freeAccounts: sql<number>`count(*) filter (where ${accounts.plan} = 'free')::int`,
      proAccounts: sql<number>`count(*) filter (where ${accounts.plan} = 'pro')::int`,
    }).from(accounts);

    const preview = {
      mode: apply ? 'apply' : 'dry-run',
      totalAccounts: totals?.totalAccounts ?? 0,
      freeAccounts: totals?.freeAccounts ?? 0,
      proAccounts: totals?.proAccounts ?? 0,
      targetPlan: 'pro',
      targetExpiry: null,
      targetQuotaBalance: config.quota.pro.max,
    };
    process.stdout.write(`${JSON.stringify(preview)}\n`);

    if (!apply) return;
    if (process.env.ADMIN_GRANT_CONFIRMATION !== requiredConfirmation) {
      throw new Error(`ADMIN_GRANT_CONFIRMATION must equal ${requiredConfirmation}`);
    }

    const result = await new AdminService(db, config)
      .grantProToAllFreeAccounts('github-actions');
    process.stdout.write(`${JSON.stringify({ mode: 'result', ...result })}\n`);
  } finally {
    await pool.end();
  }
}

await run();
