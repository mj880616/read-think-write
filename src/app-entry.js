const RTW_DELETE_ACCOUNT_PENDING = 'rtw_delete_account_pending_v1';

function captureAccountDeletionRequest() {
  const params = new URLSearchParams(location.search);
  if (params.get('delete-account') !== '1') return;
  localStorage.setItem(RTW_DELETE_ACCOUNT_PENDING, '1');
  params.delete('delete-account');
  const query = params.toString();
  history.replaceState({}, '', `${location.pathname}${query ? `?${query}` : ''}${location.hash || ''}`);
}

captureAccountDeletionRequest();

function normalizeAndroidShareAtBoot() {
  const params = new URLSearchParams(location.search);
  const sharedUrl = String(params.get('share') || '').trim();
  if (!sharedUrl) return;

  const target = new URL('/read/', location.origin);
  target.searchParams.set('new', '1');
  target.searchParams.set('url', sharedUrl);
  history.replaceState({}, '', `${target.pathname}${target.search}`);
}

normalizeAndroidShareAtBoot();

function waitForEntry(task, timeoutMs, code) {
  let timer;
  return Promise.race([
    Promise.resolve().then(task),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(Object.assign(new Error('Startup timed out'), { code })), timeoutMs);
    })
  ]).finally(() => clearTimeout(timer));
}

async function openApp() {
  let stage = 'AUTH_MODULE';
  try {
    const { bootstrapOAuth, bootstrapNativeOAuth } = await waitForEntry(() => import('./auth-oauth.js'), 15_000, 'AUTH_MODULE_TIMEOUT');
    stage = 'OAUTH';
    await waitForEntry(bootstrapOAuth, 10_000, 'OAUTH_TIMEOUT');
    stage = 'NATIVE';
    await waitForEntry(bootstrapNativeOAuth, 10_000, 'NATIVE_TIMEOUT');
    stage = 'APP_MODULE';
    await waitForEntry(() => import('./main.js'), 15_000, 'APP_MODULE_TIMEOUT');
  } catch (error) {
    const code = error?.code === `${stage}_TIMEOUT` ? error.code : `${stage}_ERROR`;
    globalThis.__rtwEntryBlocked = true;
    document.querySelector('#app').innerHTML = `<div class="shell"><div class="empty" role="alert">읽생기를 열지 못했습니다. 연결 상태를 확인하고 다시 시도해주세요.<div class="meta">${code}</div><button class="btn small" id="retry-startup" type="button">다시 시도</button></div></div>`;
    document.querySelector('#retry-startup')?.addEventListener('click', () => {
      // A PKCE code can be consumed by an exchange that completes after our timeout.
      // Restart without replaying a possibly spent one-use code; main verifies the session.
      if (stage === 'OAUTH' && new URLSearchParams(location.search).has('code')) {
        history.replaceState({}, '', `${location.pathname}${location.hash || ''}`);
      }
      location.reload();
    });
    return;
  }

  await import('./auth-enhance.js');
  await import('./reading-entry-flow.js');
  await import('./reading-import-ui.js');
  await import('./reading-ai-ui.js');
  await import('./records-ui.js');

  const { bootstrapNativeNavigation } = await import('./mobile-native.js');
  await bootstrapNativeNavigation();
}

await openApp();
