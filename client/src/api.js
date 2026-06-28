const BASE = '/api';

async function req(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// Auth
export const getStravaLoginUrl = () => `${BASE}/auth/strava/login`;

// Sync
export const getSyncStatus = (riderId) => req(`/sync/status/${riderId}`);
export const triggerBackfill = (riderId) =>
  req(`/sync/backfill/${riderId}`, { method: 'POST' });
export const triggerEventSync = (riderId, eventId) =>
  req(`/sync/event/${riderId}`, { method: 'POST', body: JSON.stringify({ eventId }) });
export const clearRiderData = (riderId) =>
  req(`/sync/data/${riderId}`, { method: 'DELETE' });

// Events
export const getEvents = () => req('/events');
export const createEvent = (data) => req('/events', { method: 'POST', body: JSON.stringify(data) });
export const updateEvent = (id, data) => req(`/events/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteEvent = (id) => req(`/events/${id}`, { method: 'DELETE' });

// Config — categories
export const getCategoryConfig = () => req('/config/categories');
export const updateCategoryConfig = (thresholds) =>
  req('/config/categories', { method: 'PUT', body: JSON.stringify(thresholds) });

// Config — points
export const getPointsConfig = () => req('/config/points');
export const updatePointsForCategory = (category, points) =>
  req(`/config/points/${category}`, { method: 'PUT', body: JSON.stringify({ points }) });

// Segments
export const getQualifyingSegments = (from = null, to = null, minRiders = 1) => {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  params.set('minRiders', minRiders);
  return req(`/segments/qualifying?${params}`);
};
export const toggleStar = (segmentId) =>
  req(`/segments/${segmentId}/star`, { method: 'POST' });

// Climbs
export const getClimbRanking = (segmentId, from, to, minRiders = 1) =>
  req(`/climbs/${segmentId}/ranking?from=${from}&to=${to}&minRiders=${minRiders}`);

export const getGroupRides = (from, to, minRiders = 1) =>
  req(`/climbs/group-rides?from=${from}&to=${to}&minRiders=${minRiders}`);

// Leaderboard
export const getLeaderboard = (from, to, minRiders = 1, starredOnly = false) =>
  req(`/points/leaderboard?from=${from}&to=${to}&minRiders=${minRiders}&starredOnly=${starredOnly}`);
export const getMonthlyPoints = (from, to, minRiders = 1, starredOnly = false) =>
  req(`/points/monthly?from=${from}&to=${to}&minRiders=${minRiders}&starredOnly=${starredOnly}`);

// Feed & stats
export const getRecentFeed = (limit = 20) => req(`/feed/recent?limit=${limit}`);
export const getGlobalStats = () => req('/stats/global');

// Riders management
export const getAllRiders = () => req('/riders').then(r => r.data);
export const updateRider = (id, data) => req(`/riders/${id}`, { method: 'PUT', body: JSON.stringify(data) }).then(r => r.data);

// Rider profile
export const getRiderProfile = (riderId) => req(`/riders/${riderId}/profile`);

// Segment extras
export const getSegmentBadges = (id) => req(`/segments/${id}/badges`);
export const getSegmentAllTimeBests = (id) => req(`/segments/${id}/alltimebests`);
export const getStravaLeaderboard = (id) => req(`/segments/${id}/strava-leaderboard`);
export const getRiderSegmentHistory = (riderId, segmentId) =>
  req(`/riders/${riderId}/segments/${segmentId}/history`);

// Goals
export const getGoals = (riderId = null) =>
  req(`/goals${riderId ? `?riderId=${riderId}` : ''}`);
export const createGoal = (data) =>
  req('/goals', { method: 'POST', body: JSON.stringify(data) });
export const updateGoal = (id, data) =>
  req(`/goals/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteGoal = (id) =>
  req(`/goals/${id}`, { method: 'DELETE' });

// Rate limit
export const getRateLimitState = () => req('/sync/rate-limit');

// Push notifications
export const getVapidPublicKey = () => req('/notifications/vapid-public-key');
export const subscribeToPush = (subscription, rider_id = null) =>
  req('/notifications/subscribe', { method: 'POST', body: JSON.stringify({ subscription, rider_id }) });
export const unsubscribeFromPush = (endpoint) =>
  req('/notifications/subscribe', { method: 'DELETE', body: JSON.stringify({ endpoint }) });
