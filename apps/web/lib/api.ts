import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import Cookies from 'js-cookie';

const ACCESS_TOKEN_KEY = 'lms_access_token';
const TENANT_KEY = 'lms_tenant';

// ─── Impersonation (in-memory only — intentionally clears on page refresh) ─────
let _impersonationSubdomain: string | null = null;

export function setImpersonationSubdomain(sub: string): void {
  _impersonationSubdomain = sub;
}
export function clearImpersonationSubdomain(): void {
  _impersonationSubdomain = null;
}
export function getImpersonationSubdomain(): string | null {
  return _impersonationSubdomain;
}

export function getAccessToken(): string | null {
  return Cookies.get(ACCESS_TOKEN_KEY) ?? null;
}

export function setAccessToken(token: string): void {
  Cookies.set(ACCESS_TOKEN_KEY, token, { secure: process.env.NODE_ENV === 'production', sameSite: 'lax' });
}

export function clearAccessToken(): void {
  Cookies.remove(ACCESS_TOKEN_KEY);
}

export function getTenantSubdomain(): string | null {
  return Cookies.get(TENANT_KEY) ?? null;
}

export function setTenantSubdomain(subdomain: string): void {
  Cookies.set(TENANT_KEY, subdomain, { sameSite: 'lax' });
}

export function clearTenantSubdomain(): void {
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'coursel.space';
  // Cookie was set by Next.js middleware with domain:.coursel.space — must match to delete
  Cookies.remove(TENANT_KEY, { path: '/', domain: `.${rootDomain}` });
  Cookies.remove(TENANT_KEY, { path: '/' });
  Cookies.remove(TENANT_KEY);
}

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL + '/api',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

// Attach access token + tenant subdomain to every request
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getAccessToken();
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // Impersonation takes priority over the regular tenant subdomain
  const subdomain = _impersonationSubdomain || getTenantSubdomain();
  if (subdomain && config.headers) {
    config.headers['X-Tenant-Subdomain'] = subdomain;
  }
  // For FormData uploads let the browser set Content-Type (includes multipart boundary)
  if (config.data instanceof FormData && config.headers) {
    delete config.headers['Content-Type'];
  }
  return config;
});

// Silent refresh on 401
let isRefreshing = false;
let failedQueue: Array<{ resolve: (v: string) => void; reject: (e: unknown) => void }> = [];

function processQueue(error: unknown, token: string | null) {
  failedQueue.forEach((prom) => {
    if (error) prom.reject(error);
    else prom.resolve(token!);
  });
  failedQueue = [];
}

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    const isAuthRoute = original.url?.includes('/auth/');
    if (error.response?.status === 401 && !original._retry && !isAuthRoute) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          original.headers.Authorization = `Bearer ${token}`;
          return api(original);
        });
      }

      original._retry = true;
      isRefreshing = true;

      try {
        const subdomain = getTenantSubdomain();
        const { data } = await axios.post(
          process.env.NEXT_PUBLIC_API_URL + '/api/auth/refresh',
          {},
          {
            withCredentials: true,
            headers: subdomain ? { 'X-Tenant-Subdomain': subdomain } : {},
          }
        );
        const newToken: string = data.data.accessToken;
        setAccessToken(newToken);
        processQueue(null, newToken);
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      } catch (refreshError) {
        processQueue(refreshError, null);
        clearAccessToken();
        clearTenantSubdomain();
        if (typeof window !== 'undefined') {
          window.location.href = '/login';
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    // Plan expired — redirect to billing so the admin can reactivate
    if (error.response?.status === 402) {
      const code = (error.response.data as any)?.code;
      if (code === 'PLAN_EXPIRED' && typeof window !== 'undefined') {
        const isBillingPage = window.location.pathname.startsWith('/billing');
        if (!isBillingPage) window.location.href = '/billing';
      }
    }

    return Promise.reject(error);
  }
);

export default api;
