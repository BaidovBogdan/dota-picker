import Constants from 'expo-constants';
import { Linking, Platform } from 'react-native';
import { z } from 'zod';

import { translate } from '@/i18n';
import { apiRequest } from '@/services/api/client';
import { getSessionScope, useAppStore } from '@/store/app-store';
import type { BillingPlan } from '@/types/domain';

const entitlementId = process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID ?? 'pro';
const backendAccountId =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const billingStatusSchema = z.object({
  revenueCatAppUserId: z.uuid(),
  plan: z.enum(['free', 'pro']),
  entitlement: z.object({
    id: z.string().min(1),
    active: z.boolean(),
    productId: z.string().nullable(),
    expiresAt: z.string().min(1).nullable(),
  }),
  quota: z.object({
    plan: z.enum(['free', 'pro']),
    remaining: z.number().int().nonnegative(),
    limit: z.number().int().positive(),
    nextRefillAt: z.string().min(1).nullable(),
    planExpiresAt: z.string().min(1).nullable(),
  }),
});
type BillingStatus = z.infer<typeof billingStatusSchema>;
let configured = false;
let modulePromise: Promise<typeof import('react-native-purchases')> | null = null;
let identityTail: Promise<void> = Promise.resolve();

const getApiKey = () =>
  Platform.select({
    ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY,
    android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY,
  });

export class BillingUnavailableError extends Error {
  constructor(message = translate('billing.unavailable')) {
    super(message);
    this.name = 'BillingUnavailableError';
  }
}

function assertBillingRuntime() {
  if (Platform.OS === 'web') {
    throw new BillingUnavailableError(translate('billing.web'));
  }
  if (Constants.expoGoConfig) {
    throw new BillingUnavailableError(translate('billing.devBuild'));
  }
}

async function loadPurchases() {
  assertBillingRuntime();
  const apiKey = getApiKey();
  if (!apiKey) throw new BillingUnavailableError(translate('billing.missingKey'));

  try {
    modulePromise ??= import('react-native-purchases');
    return await modulePromise;
  } catch {
    throw new BillingUnavailableError(translate('billing.expoGo'));
  }
}

function serializeIdentity<T>(operation: () => Promise<T>) {
  const result = identityTail.then(operation, operation);
  identityTail = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function currentBillingUserId() {
  return useAppStore.getState().session?.revenueCatAppUserId ?? null;
}

async function verifyServerBillingIdentity(expectedId: string) {
  const status = await apiRequest<BillingStatus>('/billing/status', {
    timeoutMs: 6_000,
    schema: billingStatusSchema,
  });
  if (status.revenueCatAppUserId !== expectedId) {
    throw new BillingUnavailableError(translate('billing.profileMismatch'));
  }
}

export async function ensureBillingIdentity(expectedId = currentBillingUserId()) {
  assertBillingRuntime();
  if (!expectedId) throw new BillingUnavailableError(translate('billing.profileLoading'));
  if (!backendAccountId.test(expectedId)) {
    throw new BillingUnavailableError(translate('billing.serverRequired'));
  }
  if (currentBillingUserId() !== expectedId) {
    throw new BillingUnavailableError(translate('billing.profileChanged'));
  }
  return serializeIdentity(async () => {
    if (currentBillingUserId() !== expectedId) {
      throw new BillingUnavailableError(translate('billing.profileChanged'));
    }
    await verifyServerBillingIdentity(expectedId);
    if (currentBillingUserId() !== expectedId) {
      throw new BillingUnavailableError(translate('billing.profileChanged'));
    }
    const module = await loadPurchases();
    if (currentBillingUserId() !== expectedId) {
      throw new BillingUnavailableError(translate('billing.profileChanged'));
    }
    const apiKey = getApiKey();
    if (!apiKey) throw new BillingUnavailableError(translate('billing.missingKey'));
    if (!configured) {
      module.default.setLogLevel(module.LOG_LEVEL.ERROR);
      module.default.configure({ apiKey, appUserID: expectedId });
      configured = true;
    }
    if ((await module.default.getAppUserID()) !== expectedId) {
      await module.default.logIn(expectedId);
    }
    if (
      currentBillingUserId() !== expectedId ||
      (await module.default.getAppUserID()) !== expectedId
    ) {
      throw new BillingUnavailableError(translate('billing.confirmProfile'));
    }
    return module;
  });
}

export async function loginBilling(userId: string) {
  await ensureBillingIdentity(userId);
}

export async function logoutBilling(expectedId = currentBillingUserId()) {
  if (!expectedId) return;
  await serializeIdentity(async () => {
    const module = await loadPurchases();
    const apiKey = getApiKey();
    if (!apiKey) return;
    if (!configured) {
      module.default.setLogLevel(module.LOG_LEVEL.ERROR);
      module.default.configure({ apiKey, appUserID: expectedId });
      configured = true;
    }
    if (
      (await module.default.getAppUserID()) === expectedId &&
      !(await module.default.isAnonymous())
    ) {
      await module.default.logOut();
    }
  });
}

export async function manageSubscriptions() {
  if (Platform.OS === 'android') {
    await Linking.openURL('https://play.google.com/store/account/subscriptions');
    return;
  }
  const { default: Purchases } = await ensureBillingIdentity();
  await Purchases.showManageSubscriptions();
}

export async function getBillingPlans(): Promise<BillingPlan[]> {
  const { default: Purchases } = await ensureBillingIdentity();
  const offering = (await Purchases.getOfferings()).current;
  if (!offering) return [];

  return offering.availablePackages.map((item) => ({
    packageId: item.identifier,
    productId: item.product.identifier,
    title: item.product.title,
    price: item.product.priceString,
    period:
      item.packageType === 'ANNUAL'
        ? 'annual'
        : item.packageType === 'MONTHLY'
          ? 'monthly'
          : 'unknown',
  }));
}

export async function purchasePlan(packageId: string) {
  const expectedId = currentBillingUserId();
  if (!expectedId) throw new BillingUnavailableError(translate('billing.profileLoading'));
  const { default: Purchases, PURCHASES_ERROR_CODE } = await ensureBillingIdentity(expectedId);
  const offering = (await Purchases.getOfferings()).current;
  const selected = offering?.availablePackages.find((item) => item.identifier === packageId);
  if (!selected) throw new BillingUnavailableError(translate('billing.planUnavailable'));
  try {
    if (currentBillingUserId() !== expectedId) {
      throw new BillingUnavailableError(translate('billing.reopenPlans'));
    }
    await ensureBillingIdentity(expectedId);
    const { customerInfo } = await Purchases.purchasePackage(selected);
    return customerInfo.entitlements.active[entitlementId] ? 'purchased' : 'not_entitled';
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) return 'cancelled';
    throw error;
  }
}

export async function restorePurchases() {
  const expectedId = currentBillingUserId();
  if (!expectedId) throw new BillingUnavailableError(translate('billing.profileLoading'));
  const { default: Purchases } = await ensureBillingIdentity(expectedId);
  if (currentBillingUserId() !== expectedId) {
    throw new BillingUnavailableError(translate('billing.restoreAgain'));
  }
  const customerInfo = await Purchases.restorePurchases();
  return Boolean(customerInfo.entitlements.active[entitlementId]);
}

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

const applyBillingStatus = (status: BillingStatus, expectedUserId: string) => {
  const store = useAppStore.getState();
  if (store.session?.userId !== expectedUserId) return false;
  const ownerScope = getSessionScope(store.session, store.guestId);
  if (ownerScope) {
    store.setServerAttempts(
      {
        remaining: status.quota.remaining,
        maximum: status.quota.limit,
        nextRefreshAt:
          status.quota.nextRefillAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        planExpiresAt: status.quota.planExpiresAt,
      },
      ownerScope,
    );
  }
  const latest = useAppStore.getState();
  if (latest.session?.userId !== expectedUserId) return false;
  if (latest.session.plan !== status.plan) {
    latest.setSession({ ...latest.session, plan: status.plan });
  }
  return true;
};

export async function confirmBillingStatus() {
  const expectedUserId = useAppStore.getState().session?.userId;
  if (!expectedUserId) return false;
  const delays = [0, 450, 900, 1600];
  for (const delay of delays) {
    if (delay) await wait(delay);
    const status = await apiRequest<BillingStatus>('/billing/status', {
      schema: billingStatusSchema,
    });
    if (useAppStore.getState().session?.userId !== expectedUserId) return false;
    if (!applyBillingStatus(status, expectedUserId)) return false;
    if (status.plan === 'pro') return true;
  }
  return false;
}
