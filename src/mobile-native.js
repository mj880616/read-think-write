function capacitor() {
  return globalThis.Capacitor ?? null;
}

function isNativeAndroid() {
  const cap = capacitor();
  if (!cap) return false;
  try {
    return cap.isNativePlatform?.() === true && cap.getPlatform?.() === 'android';
  } catch {
    return false;
  }
}

function plugin(name) {
  return capacitor()?.Plugins?.[name] ?? null;
}

function isAppRoot() {
  const path = location.pathname.replace(/\/+$/, '') || '/';
  return path === '/' && !location.search && !location.hash;
}

function shouldOpenExternally(anchor) {
  const href = anchor?.getAttribute?.('href');
  if (!href || href.startsWith('#') || href.startsWith('javascript:')) return null;

  let url;
  try {
    url = new URL(href, location.href);
  } catch {
    return null;
  }

  if (!['http:', 'https:'].includes(url.protocol)) return null;
  if (url.origin === location.origin) return null;
  return url.href;
}

export async function bootstrapNativeNavigation() {
  if (!isNativeAndroid()) return;

  const app = plugin('App');
  const browser = plugin('Browser');

  if (app?.addListener) {
    await app.addListener('backButton', async () => {
      if (!isAppRoot()) {
        history.back();
        return;
      }

      if (app.minimizeApp) {
        await app.minimizeApp();
      }
    });
  }

  document.addEventListener('click', (event) => {
    const anchor = event.target?.closest?.('a[href]');
    const externalUrl = shouldOpenExternally(anchor);
    if (!externalUrl) return;

    event.preventDefault();
    event.stopPropagation();

    if (browser?.open) {
      browser.open({ url: externalUrl }).catch((error) => {
        console.error('External link open failed', error);
        location.assign(externalUrl);
      });
      return;
    }

    location.assign(externalUrl);
  }, true);
}
