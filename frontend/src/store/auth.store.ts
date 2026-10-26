import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { authApi } from '../services/endpoints';
import { getToken, setToken, setUnauthorizedHandler } from '../services/api';
import type { User } from '../services/types';

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
  initialized: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (data: { email: string; password: string; firstName: string; lastName?: string; phone?: string }) => Promise<User>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  bootstrap: () => Promise<void>;
  setUser: (user: User) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: getToken(),
      loading: false,
      initialized: false,

      async login(email, password) {
        set({ loading: true });
        try {
          const { token, user } = await authApi.login({ email, password });
          setToken(token);
          set({ token, user, loading: false, initialized: true });
          return user;
        } catch (err) {
          set({ loading: false });
          throw err;
        }
      },

      async register(data) {
        set({ loading: true });
        try {
          const { token, user } = await authApi.register(data);
          setToken(token);
          set({ token, user, loading: false, initialized: true });
          return user;
        } catch (err) {
          set({ loading: false });
          throw err;
        }
      },

      async logout() {
        try {
          if (get().token) await authApi.logout();
        } catch {
          // выход в любом случае очищает локальное состояние
        }
        setToken(null);
        set({ user: null, token: null });
      },

      async refresh() {
        if (!get().token) {
          set({ user: null, initialized: true });
          return;
        }
        try {
          const { user } = await authApi.me();
          set({ user, initialized: true });
        } catch {
          setToken(null);
          set({ user: null, token: null, initialized: true });
        }
      },

      async bootstrap() {
        const token = getToken();
        set({ token });
        if (!token) {
          set({ user: null, initialized: true });
          return;
        }
        await get().refresh();
      },

      setUser(user) {
        set({ user });
      },
    }),
    {
      name: 'resell.auth',
      partialize: (state) => ({ user: state.user, token: state.token }),
    },
  ),
);

// При 401 очищаем сессию (токен истёк или отозван)
setUnauthorizedHandler(() => {
  setToken(null);
  useAuthStore.setState({ user: null, token: null });
});

export const selectIsAdmin = (state: AuthState) => state.user?.role === 'ADMIN';
