'use client';

import { useEffect } from 'react';

export default function AuthCallbackPage() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    const error = params.get('error');

    if (window.opener) {
      window.opener.postMessage(
        {
          type: 'telegram-auth-callback',
          code,
          state,
          error,
        },
        window.location.origin,
      );
      window.close();
    } else {
      // Direct navigation — redirect to home
      window.location.href = '/';
    }
  }, []);

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      <p>Авторизация... Окно закроется автоматически.</p>
    </div>
  );
}
