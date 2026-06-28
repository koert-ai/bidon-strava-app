const express = require('express');
const { savePushSubscription, deletePushSubscription } = require('../db');

const router = express.Router();

// Lazily load web-push so server starts without it installed
let webpush = null;
const getWebPush = () => {
  if (webpush) return webpush;
  try {
    webpush = require('web-push');
    const pub = process.env.VAPID_PUBLIC_KEY;
    const priv = process.env.VAPID_PRIVATE_KEY;
    if (pub && priv) {
      webpush.setVapidDetails(
        `mailto:${process.env.VAPID_EMAIL || 'admin@bidon.app'}`,
        pub,
        priv
      );
    } else {
      const keys = webpush.generateVAPIDKeys();
      console.log('[push] No VAPID keys found. Set these env vars:');
      console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
      console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
      process.env.VAPID_PUBLIC_KEY = keys.publicKey;
      process.env.VAPID_PRIVATE_KEY = keys.privateKey;
      webpush.setVapidDetails(
        `mailto:${process.env.VAPID_EMAIL || 'admin@bidon.app'}`,
        keys.publicKey,
        keys.privateKey
      );
    }
    return webpush;
  } catch {
    return null;
  }
};

// GET /api/notifications/vapid-public-key
router.get('/vapid-public-key', (req, res) => {
  const wp = getWebPush();
  if (!wp) return res.status(503).json({ error: 'Push notifications not configured (web-push not installed)' });
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

// POST /api/notifications/subscribe
router.post('/subscribe', (req, res, next) => {
  try {
    const { subscription, rider_id } = req.body;
    if (!subscription?.endpoint) return res.status(400).json({ error: 'subscription.endpoint required' });
    savePushSubscription({
      riderId: rider_id || null,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys?.p256dh || '',
      auth: subscription.keys?.auth || '',
    });
    res.status(201).json({ message: 'Subscribed' });
  } catch (err) { next(err); }
});

// DELETE /api/notifications/subscribe
router.delete('/subscribe', (req, res, next) => {
  try {
    const { endpoint } = req.body;
    if (!endpoint) return res.status(400).json({ error: 'endpoint required' });
    deletePushSubscription(endpoint);
    res.json({ message: 'Unsubscribed' });
  } catch (err) { next(err); }
});

// Internal: send notification to all subscribers
const sendPushNotification = async (payload) => {
  const wp = getWebPush();
  if (!wp) return;
  const { getAllPushSubscriptions } = require('../db');
  const subs = getAllPushSubscriptions();
  const msg = JSON.stringify(payload);
  const results = await Promise.allSettled(
    subs.map(sub =>
      wp.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        msg
      ).catch(err => {
        if (err.statusCode === 410) deletePushSubscription(sub.endpoint);
        throw err;
      })
    )
  );
  const sent = results.filter(r => r.status === 'fulfilled').length;
  console.log(`[push] Sent ${sent}/${subs.length} notifications`);
};

module.exports = router;
module.exports.sendPushNotification = sendPushNotification;
