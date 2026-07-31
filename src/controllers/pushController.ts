import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import {
  isWebPushConfigured,
  getVapidPublicKey,
  saveSubscription,
  removeSubscription
} from '../services/webPushService';

// GET /api/push/vapid-public-key — public key the browser needs to subscribe.
export const getVapidKey = async (_req: AuthRequest, res: Response) => {
  if (!isWebPushConfigured()) {
    return res.status(503).json({ message: 'Web Push is not configured', configured: false });
  }
  return res.status(200).json({ configured: true, publicKey: getVapidPublicKey() });
};

// POST /api/push/subscribe — body is the browser PushSubscription JSON.
export const subscribe = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    if (!isWebPushConfigured()) {
      return res.status(503).json({ message: 'Web Push is not configured' });
    }

    const { endpoint, keys } = req.body || {};
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ message: 'A valid push subscription (endpoint + keys) is required' });
    }

    await saveSubscription(req.user.id, { endpoint, keys });
    return res.status(201).json({ message: 'Push subscription saved' });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error saving subscription', error: error.message });
  }
};

// POST /api/push/unsubscribe — body: { endpoint }.
export const unsubscribe = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const { endpoint } = req.body || {};
    if (!endpoint) return res.status(400).json({ message: 'endpoint is required' });

    await removeSubscription(endpoint);
    return res.status(200).json({ message: 'Push subscription removed' });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error removing subscription', error: error.message });
  }
};
