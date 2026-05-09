'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/store/useAuthStore';

function TelegramIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  );
}

export function AuthButton() {
  const { user, isAuthenticated, isLoading, login, logout, checkAuth } = useAuthStore();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2">
        <div className="w-3 h-3 border-2 border-white/20 border-t-orange-500 rounded-full animate-spin" />
        <span className="text-gray-500 text-xs tracking-wider uppercase">Auth</span>
      </div>
    );
  }

  if (isAuthenticated && user) {
    return (
      <div className="flex items-center gap-3">
        {user.photo ? (
          <img
            src={user.photo}
            alt={user.firstName || 'User'}
            className="w-7 h-7 rounded-full ring-1 ring-white/10"
          />
        ) : (
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-orange-500/20 to-orange-600/20 border border-white/10 flex items-center justify-center">
            <span className="text-orange-400 text-xs font-bold">
              {(user.firstName || user.username || 'U')[0].toUpperCase()}
            </span>
          </div>
        )}
        <span className="text-gray-300 text-xs tracking-wide">
          {user.firstName || user.username || 'User'}
        </span>
        <button
          onClick={logout}
          className="text-gray-600 hover:text-gray-300 text-xs tracking-wider uppercase transition-colors"
        >
          Log out
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => login().catch(() => {})}
      className="flex items-center gap-2 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] hover:border-white/[0.15] text-gray-300 hover:text-white text-xs font-medium tracking-wide px-4 py-2 rounded-lg transition-all"
    >
      <TelegramIcon />
      <span>Log in</span>
    </button>
  );
}
