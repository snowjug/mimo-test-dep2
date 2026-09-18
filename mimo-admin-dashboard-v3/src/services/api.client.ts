/**
 * MIMO Admin V3 — Centralized Backend API Client & Connection Manager
 * 
 * Provides typed HTTP communication with the MIMO production/staging backend.
 * Falls back to isolated development mock stores when backend environment variables
 * or endpoints are unconfigured, clearly flagging development status.
 */

export interface BackendEnvironmentConfig {
  apiBaseUrl: string;
  isLiveConfigured: boolean;
  mode: 'LIVE' | 'DEVELOPMENT_MOCK';
  timeoutMs: number;
}

export const BACKEND_CONFIG: BackendEnvironmentConfig = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || 'https://api-upqxuj7evq-uc.a.run.app',
  isLiveConfigured: Boolean(import.meta.env.VITE_API_BASE_URL && import.meta.env.VITE_USE_LIVE_API === 'true'),
  mode: import.meta.env.VITE_USE_LIVE_API === 'true' ? 'LIVE' : 'DEVELOPMENT_MOCK',
  timeoutMs: Number(import.meta.env.VITE_API_TIMEOUT_MS) || 8000,
};

export class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = BACKEND_CONFIG.apiBaseUrl) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  get isLive(): boolean {
    return BACKEND_CONFIG.isLiveConfigured;
  }

  get mode(): 'LIVE' | 'DEVELOPMENT_MOCK' {
    return BACKEND_CONFIG.mode;
  }

  async get<T>(endpoint: string, headers: Record<string, string> = {}): Promise<{ data: T | null; isLive: boolean; error?: string }> {
    if (!BACKEND_CONFIG.isLiveConfigured) {
      return { data: null, isLive: false };
    }

    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), BACKEND_CONFIG.timeoutMs);

      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...(import.meta.env.VITE_ADMIN_API_KEY ? { 'Authorization': `Bearer ${import.meta.env.VITE_ADMIN_API_KEY}` } : {}),
          ...headers,
        },
        signal: controller.signal,
      });
      clearTimeout(id);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const json = await response.json();
      return { data: json as T, isLive: true };
    } catch (err: any) {
      console.warn(`[MIMO API Client] Real backend request to ${endpoint} failed (${err.message}). Using fallback.`);
      return { data: null, isLive: false, error: err.message };
    }
  }

  async post<T>(endpoint: string, body: any, headers: Record<string, string> = {}): Promise<{ data: T | null; isLive: boolean; error?: string }> {
    if (!BACKEND_CONFIG.isLiveConfigured) {
      return { data: null, isLive: false };
    }

    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), BACKEND_CONFIG.timeoutMs);

      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...(import.meta.env.VITE_ADMIN_API_KEY ? { 'Authorization': `Bearer ${import.meta.env.VITE_ADMIN_API_KEY}` } : {}),
          ...headers,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(id);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const json = await response.json();
      return { data: json as T, isLive: true };
    } catch (err: any) {
      console.warn(`[MIMO API Client] Real backend request to ${endpoint} failed (${err.message}).`);
      return { data: null, isLive: false, error: err.message };
    }
  }
}

export const apiClient = new ApiClient();
