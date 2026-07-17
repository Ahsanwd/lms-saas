import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api, {
  setAccessToken, clearAccessToken,
  setTenantSubdomain, clearTenantSubdomain,
  setImpersonationSubdomain, clearImpersonationSubdomain,
} from '@/lib/api';
import { disconnectSocket } from '@/lib/socket';
import type { User } from '@/types';

export interface ImpersonatedTenant {
  _id: string;
  name: string;
  subdomain: string;
}

interface AuthState {
  user: User | null;
  subdomain: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  hasHydrated: boolean;

  /** Set when a super_admin is viewing a specific tenant's context. NOT persisted. */
  impersonation: ImpersonatedTenant | null;

  login: (email: string, password: string, subdomain: string) => Promise<void>;
  logout: () => Promise<void>;
  fetchMe: () => Promise<void>;
  setUser: (user: User) => void;
  setSubdomain: (subdomain: string) => void;
  clearAuth: () => void;
  setHasHydrated: (val: boolean) => void;


  /** Begin impersonating a tenant (super_admin only). Updates the in-memory API header. */
  setImpersonation: (tenant: ImpersonatedTenant) => void;
  /** Stop impersonating — restores normal super_admin context. */
  clearImpersonation: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      subdomain: null,
      isAuthenticated: false,
      isLoading: false,
      hasHydrated: false,
      impersonation: null,

      setUser: (user) => set({ user, isAuthenticated: true }),

      setHasHydrated: (val) => set({ hasHydrated: val }),

      setSubdomain: (subdomain) => {
        setTenantSubdomain(subdomain);
        set({ subdomain });
      },

      clearAuth: () => {
        clearAccessToken();
        clearTenantSubdomain();
        clearImpersonationSubdomain();
        // The one legitimate place to fully tear down the shared socket —
        // there's no valid session left for it to represent. Every other
        // component only removes its own listeners on unmount.
        disconnectSocket();
        set({ user: null, subdomain: null, isAuthenticated: false, impersonation: null });
      },

      login: async (email, password, subdomain) => {
        set({ isLoading: true });
        try {
          // Always clear the stale tenant cookie first.
          // Without this, a leftover cookie from a previous tenant session
          // gets sent during super-admin login (or wrong-tenant login),
          // causing the backend to look in the wrong tenant → "Invalid credentials".
          clearTenantSubdomain();
          if (subdomain) setTenantSubdomain(subdomain);
          const { data } = await api.post('/auth/login', { email, password });
          setAccessToken(data.data.accessToken);
          set({ user: data.data.user, subdomain: subdomain || null, isAuthenticated: true });
        } finally {
          set({ isLoading: false });
        }
      },

      logout: async () => {
        try {
          await api.post('/auth/logout');
        } catch {
          // swallow — clear local state regardless
        } finally {
          get().clearAuth();
        }
      },

      fetchMe: async () => {
        set({ isLoading: true });
        try {
          const { data } = await api.get('/auth/me');
          set({ user: data.data, isAuthenticated: true });
        } catch {
          get().clearAuth();
        } finally {
          set({ isLoading: false });
        }
      },

      setImpersonation: (tenant) => {
        setImpersonationSubdomain(tenant.subdomain);
        set({ impersonation: tenant });
      },

      clearImpersonation: () => {
        clearImpersonationSubdomain();
        set({ impersonation: null });
      },
    }),
    {
      name: 'lms_auth',
      // impersonation is intentionally excluded — should NOT survive page refresh
      partialize: (state) => ({
        user: state.user,
        subdomain: state.subdomain,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        if (state?.subdomain) setTenantSubdomain(state.subdomain);
        state?.setHasHydrated(true);
      },
    }
  )
);
