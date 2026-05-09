import { create } from 'zustand';
import { api } from '@/lib/api';
import { generateCodeVerifier, generateCodeChallenge, generateState } from '@/lib/pkce';

const TELEGRAM_CLIENT_ID = process.env.NEXT_PUBLIC_TELEGRAM_CLIENT_ID || '';

interface AuthUser {
  id: string;
  telegramId: string;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  photo: string | null;
  role: string;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: () => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null,
  isAuthenticated: false,
  isLoading: false,

  login: async () => {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    const state = generateState();

    // Store PKCE and state for validation after callback
    sessionStorage.setItem('oauth_code_verifier', codeVerifier);
    sessionStorage.setItem('oauth_state', state);

    const redirectUri = `${window.location.origin}/auth/callback`;

    const params = new URLSearchParams({
      client_id: TELEGRAM_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid profile',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    const authUrl = `https://oauth.telegram.org/auth?${params.toString()}`;

    // Open popup
    const width = 550;
    const height = 600;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    const popup = window.open(
      authUrl,
      'telegram-auth',
      `width=${width},height=${height},left=${left},top=${top}`,
    );

    // Listen for callback message
    return new Promise<void>((resolve, reject) => {
      let pollTimer: ReturnType<typeof setInterval>;

      const handleMessage = async (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;
        if (event.data?.type !== 'telegram-auth-callback') return;

        window.removeEventListener('message', handleMessage);
        clearInterval(pollTimer);

        const { code, state: returnedState, error } = event.data;

        if (error) {
          reject(new Error(error));
          return;
        }

        const savedState = sessionStorage.getItem('oauth_state');
        if (returnedState !== savedState) {
          reject(new Error('State mismatch — possible CSRF attack'));
          return;
        }

        const savedVerifier = sessionStorage.getItem('oauth_code_verifier');
        sessionStorage.removeItem('oauth_code_verifier');
        sessionStorage.removeItem('oauth_state');

        try {
          set({ isLoading: true });
          const response = await api.post('/auth/telegram', {
            code,
            code_verifier: savedVerifier,
            redirect_uri: redirectUri,
          });

          const { access_token, user } = response.data;
          localStorage.setItem('auth_token', access_token);
          set({ token: access_token, user, isAuthenticated: true, isLoading: false });
          resolve();
        } catch (err) {
          set({ isLoading: false });
          reject(err);
        }
      };

      window.addEventListener('message', handleMessage);

      // Poll for popup closed without auth
      pollTimer = setInterval(() => {
        if (popup?.closed) {
          clearInterval(pollTimer);
          window.removeEventListener('message', handleMessage);
          set({ isLoading: false });
          resolve(); // User closed popup, no error
        }
      }, 500);
    });
  },

  logout: () => {
    localStorage.removeItem('auth_token');
    set({ user: null, token: null, isAuthenticated: false });
  },

  checkAuth: async () => {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      set({ user: null, token: null, isAuthenticated: false });
      return;
    }

    try {
      set({ isLoading: true });
      const response = await api.get('/auth/me');
      set({ user: response.data, token, isAuthenticated: true, isLoading: false });
    } catch {
      localStorage.removeItem('auth_token');
      set({ user: null, token: null, isAuthenticated: false, isLoading: false });
    }
  },
}));
