/**
 * Weekly email digest — runs every Monday at 08:00.
 * Requires env vars: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, DIGEST_EMAIL
 * Install: npm install nodemailer node-cron
 */

const { getLeaderboard, getRecentFeed } = require('../db');

const fmtTime = (s) => {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
};

const buildDigestHtml = () => {
  const from = new Date();
  from.setDate(from.getDate() - 7);
  const fromStr = from.toISOString().slice(0, 10);
  const toStr = new Date().toISOString().slice(0, 10);

  const leaderboard = getLeaderboard(fromStr, toStr, 1, false).slice(0, 5);
  const feed = getRecentFeed(5);

  const lbRows = leaderboard.map((r, i) =>
    `<tr><td>${i + 1}</td><td>${r.name}</td><td><strong>${r.total_points}</strong></td><td>${r.scored_efforts}</td></tr>`
  ).join('');

  const feedItems = feed.map(ev =>
    `<li><strong>${ev.segment?.name}</strong> — ${ev.ride_date} (${ev.rider_count} riders)</li>`
  ).join('');

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Bidon Weekly Digest</title></head>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333">
  <h1 style="color:#E85D04">🚴 De Gevulde Bidon — Weekly Digest</h1>
  <p style="color:#666">Week of ${fromStr} to ${toStr}</p>

  <h2>📊 Top 5 This Week</h2>
  <table border="0" cellspacing="0" cellpadding="8" style="width:100%;border-collapse:collapse">
    <thead style="background:#f5f5f5">
      <tr><th>#</th><th>Rider</th><th>Points</th><th>Efforts</th></tr>
    </thead>
    <tbody>${lbRows || '<tr><td colspan="4">No scored climbs this week</td></tr>'}</tbody>
  </table>

  <h2>🏔 Recent Group Rides</h2>
  <ul>${feedItems || '<li>No recent group rides</li>'}</ul>

  <p style="color:#999;font-size:12px;margin-top:40px">
    Sent automatically by De Gevulde Bidon.
    Manage your events at <a href="${process.env.APP_URL || 'http://localhost:3000'}">the app</a>.
  </p>
</body>
</html>`;
};

const sendDigest = async () => {
  if (!process.env.SMTP_HOST || !process.env.DIGEST_EMAIL) {
    console.log('[digest] SMTP_HOST or DIGEST_EMAIL not set, skipping digest');
    return;
  }
  let nodemailer;
  try {
    nodemailer = require('nodemailer');
  } catch {
    console.log('[digest] nodemailer not installed — run: npm install nodemailer');
    return;
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  try {
    const html = buildDigestHtml();
    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: process.env.DIGEST_EMAIL,
      subject: `🚴 Bidon Weekly Digest — ${new Date().toLocaleDateString('en-GB')}`,
      html,
    });
    console.log(`[digest] Weekly digest sent to ${process.env.DIGEST_EMAIL}`);
  } catch (err) {
    console.error('[digest] Failed to send digest:', err.message);
  }
};

const startDigestJob = () => {
  let cron;
  try {
    cron = require('node-cron');
  } catch {
    console.log('[digest] node-cron not installed — weekly digest disabled. Run: npm install node-cron');
    return;
  }

  // Every Monday at 08:00
  cron.schedule('0 8 * * 1', () => {
    console.log('[digest] Running weekly digest...');
    sendDigest();
  });

  console.log('[digest] Weekly digest job scheduled (Mondays at 08:00)');
};

module.exports = { startDigestJob, sendDigest };
