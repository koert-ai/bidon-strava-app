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
export const clearRiderData = (riderId) =>
  req(`/sync/data/${riderId}`, { method: 'DELETE' });

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
