import webpush from 'web-push';
import prisma from '../config/prisma';

// Web Push (PWA) — delivers notifications to a user's device even when the site
// is closed, for free, with no app store. Optional: no-ops safely when VAPID
// keys are not configured.
//
// Generate a VAPID key pair once with:  npx web-push generate-vapid-keys
// then set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (and optionally VAPID_SUBJECT).

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@bozor.tj';

let configured = false;
if (PUBLIC_KEY && PRIVATE_KEY) {
  try {
    webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
    configured = true;
  } catch (err) {
    console.error('Invalid VAPID configuration:', err);
  }
}

export const isWebPushConfigured = (): boolean => configured;
export const getVapidPublicKey = (): string => PUBLIC_KEY;

interface SubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

// Store (or refresh) a browser push subscription for a user.
export const saveSubscription = async (userId: string, sub: SubscriptionInput): Promise<void> => {
  await prisma.pushSubscription.upsert({
    where: { endpoint: sub.endpoint },
    update: { userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    create: { userId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth }
  });
};

export const removeSubscription = async (endpoint: string): Promise<void> => {
  await prisma.pushSubscription.deleteMany({ where: { endpoint } });
};

// Push a notification to every device the user has subscribed. Fire-and-forget:
// callers should not await this on the critical path. Dead endpoints (410/404)
// are pruned automatically.
export const notifyWebPush = async (
  userId: string,
  title: string,
  content: string,
  meta?: Record<string, any>
): Promise<void> => {
  if (!configured) return;
  try {
    const subs = await prisma.pushSubscription.findMany({ where: { userId } });
    if (subs.length === 0) return;

    const payload = JSON.stringify({ title, body: content, ...(meta || {}) });

    await Promise.all(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload
          );
        } catch (err: any) {
          if (err?.statusCode === 410 || err?.statusCode === 404) {
            // Subscription expired or was revoked — remove it.
            await prisma.pushSubscription.deleteMany({ where: { endpoint: sub.endpoint } });
          } else {
            console.error('Web push send failed:', err?.statusCode || err?.message || err);
          }
        }
      })
    );
  } catch (err) {
    console.error('notifyWebPush failed:', err);
  }
};
