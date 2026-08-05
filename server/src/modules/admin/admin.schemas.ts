import { z } from 'zod';

const paginationSchema = z.object({
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});

const accountKindSchema = z.enum(['guest', 'user']);
const planSchema = z.enum(['free', 'pro']);
const analysisStatusSchema = z.enum(['processing', 'completed', 'failed']);
const analysisSourceSchema = z.enum(['manual', 'photo']);
const jsonObjectSchema = z.record(z.string(), z.unknown());

export const adminHeadersSchema = z.object({
  authorization: z.string().min(1).optional(),
  'x-admin-key': z.string().min(1).optional(),
});

export const adminSessionInputSchema = z.object({
  key: z.string().min(1).max(1_024),
});

export const adminSessionResponseSchema = z.object({
  token: z.string().min(1),
  expiresAt: z.iso.datetime(),
});

export const overviewQuerySchema = z.object({
  days: z.coerce.number().int().pipe(z.union([z.literal(7), z.literal(30)])).default(30),
});

export const activityEventSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['user', 'analysis', 'billing', 'system']),
  title: z.string(),
  detail: z.string(),
  createdAt: z.iso.datetime(),
  tone: z.enum(['neutral', 'positive', 'warning', 'negative']),
});

export const overviewResponseSchema = z.object({
  generatedAt: z.iso.datetime(),
  range: z.object({
    days: z.union([z.literal(7), z.literal(30)]),
    from: z.iso.datetime(),
    to: z.iso.datetime(),
  }),
  totals: z.object({
    users: z.number().int().nonnegative(),
    registered: z.number().int().nonnegative(),
    guests: z.number().int().nonnegative(),
    pro: z.number().int().nonnegative(),
    analyses: z.number().int().nonnegative(),
    completed: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    processing: z.number().int().nonnegative(),
    reviews: z.number().int().nonnegative(),
  }),
  daily: z.array(z.object({
    date: z.iso.date(),
    analyses: z.number().int().nonnegative(),
    activeUsers: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
  })),
  recentActivity: z.array(activityEventSchema),
});

export const adminUsersQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
  q: z.string().trim().max(200).default(''),
  kind: accountKindSchema.optional(),
  plan: planSchema.optional(),
});

export const adminUserSchema = z.object({
  id: z.uuid(),
  kind: accountKindSchema,
  email: z.email().nullable(),
  deviceId: z.string().nullable(),
  plan: planSchema,
  complimentaryPro: z.boolean(),
  planProductId: z.string().nullable(),
  planExpiresAt: z.iso.datetime().nullable(),
  quotaBalance: z.number().int().nonnegative(),
  quotaRefreshedAt: z.iso.datetime(),
  billingUpdatedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  analysesCount: z.number().int().nonnegative(),
  completedCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
  processingCount: z.number().int().nonnegative(),
  reviewsCount: z.number().int().nonnegative(),
  successRate: z.number().min(0).max(1).nullable(),
  lastAnalysisAt: z.iso.datetime().nullable(),
});

export const adminUsersResponseSchema = z.object({
  items: z.array(adminUserSchema),
  pagination: paginationSchema,
});

export const adminAnalysesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
  q: z.string().trim().max(200).default(''),
  status: analysisStatusSchema.optional(),
  source: analysisSourceSchema.optional(),
});

export const adminAnalysisSchema = z.object({
  id: z.uuid(),
  accountId: z.uuid(),
  account: z.object({
    id: z.uuid(),
    kind: accountKindSchema,
    email: z.email().nullable(),
  }),
  status: analysisStatusSchema,
  source: analysisSourceSchema,
  input: jsonObjectSchema,
  result: jsonObjectSchema.nullable(),
  patch: z.string().nullable(),
  errorCode: z.string().nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const adminAnalysesResponseSchema = z.object({
  items: z.array(adminAnalysisSchema),
  pagination: paginationSchema,
});

export const integrationStatusSchema = z.enum(['connected', 'connectable', 'blocked']);

export const integrationSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  status: integrationStatusSchema,
  detail: z.string().min(1),
  reason: z.string().nullable(),
  missing: z.array(z.string()),
});

export const adminSystemResponseSchema = z.object({
  generatedAt: z.iso.datetime(),
  summary: z.object({
    api: z.object({
      status: z.literal('connected'),
    }),
    database: z.object({
      status: z.enum(['connected', 'blocked']),
      latencyMs: z.number().int().nonnegative(),
    }),
    connected: z.number().int().nonnegative(),
    connectable: z.number().int().nonnegative(),
    blocked: z.number().int().nonnegative(),
  }),
  groups: z.object({
    connected: z.array(integrationSchema),
    connectable: z.array(integrationSchema),
    blocked: z.array(integrationSchema),
  }),
});

export const grantProAllInputSchema = z.object({
  confirm: z.literal('GRANT_PRO_ALL'),
});

export const grantProAllResponseSchema = z.object({
  marker: z.literal('admin-grant-all-2026-08-02'),
  alreadyApplied: z.boolean(),
  totalAccounts: z.number().int().nonnegative(),
  eligibleAccounts: z.number().int().nonnegative(),
  grantedAccounts: z.number().int().nonnegative(),
  quotaBalance: z.number().int().positive(),
  appliedAt: z.iso.datetime(),
});

export type OverviewQuery = z.infer<typeof overviewQuerySchema>;
export type AdminUsersQuery = z.infer<typeof adminUsersQuerySchema>;
export type AdminAnalysesQuery = z.infer<typeof adminAnalysesQuerySchema>;
