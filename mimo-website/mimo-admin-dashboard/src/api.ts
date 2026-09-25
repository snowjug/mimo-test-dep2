import axios from 'axios';

const PROD_API_URL = 'https://api-upqxuj7evq-uc.a.run.app';

// Production always talks to the Firebase Functions API (same rule as mimo-website/src/app/api.ts).
// The admin build is produced by the customer site's Vercel build, so a build-time VITE_API_URL set
// for that project must not be able to redirect the admin dashboard to a stale backend.
// Local dev defaults to functions/dev.js (port 5001).
const API_URL = import.meta.env.DEV
  ? (import.meta.env.VITE_API_URL || 'http://localhost:5001')
  : PROD_API_URL;

const api = axios.create({
  baseURL: API_URL,
});

const TOKEN_KEYS = ['financeToken', 'adminToken'];
const isJwt = (t: string | null): t is string => !!t && t.split('.').length === 3;

api.interceptors.request.use((config) => {
  // Only attach real JWTs (a leftover non-JWT value must never be sent as a bearer token).
  const token = TOKEN_KEYS
    .flatMap((k) => [localStorage.getItem(k), sessionStorage.getItem(k)])
    .find(isJwt);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Expired/invalid session: clear it and fall back to the login screen instead of a silently empty dashboard.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401 && error.config?.url !== '/admin/login') {
      TOKEN_KEYS.forEach((k) => {
        localStorage.removeItem(k);
        sessionStorage.removeItem(k);
      });
      window.location.reload();
    }
    return Promise.reject(error);
  }
);

export default api;
