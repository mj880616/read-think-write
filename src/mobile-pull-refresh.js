// Native Android bootstrap owns the platform gate. This only handles the gesture.
export function bindNativePullRefresh(root) {
  if (!root) return;

  const threshold = 96;
  const intentDistance = 10;
  const verticalRatio = 2;
  const controls = 'button, input, label, select, textarea, [contenteditable]:not([contenteditable="false"]), [data-swipe-ignore]';
  const editors = 'input, select, textarea, [contenteditable]:not([contenteditable="false"])';
  let gesture = null;
  let reloading = false;

  // Keep the status outside #app: route renders replace its contents.
  const indicator = document.createElement('div');
  indicator.className = 'native-pull-refresh';
  indicator.setAttribute('role', 'status');
  indicator.hidden = true;
  document.body.append(indicator);

  // Detached touch targets no longer bubble end/cancel to #app. Observe only
  // during a gesture so a route/auth render can clear its status immediately.
  const detachObserver = new MutationObserver(() => {
    if (gesture && !gesture.target.isConnected) reset();
  });
  const reset = () => {
    detachObserver.disconnect();
    gesture = null;
    if (!reloading) indicator.hidden = true;
  };
  const atTop = () => Math.max(window.scrollY || 0, (document.scrollingElement || document.documentElement).scrollTop || 0) <= 0;
  const editing = () => !!document.activeElement?.closest?.(editors);
  const selected = () => !!window.getSelection?.()?.toString();
  const insideScroller = (target) => {
    for (let element = target; element && element !== document.body; element = element.parentElement) {
      const style = window.getComputedStyle(element);
      if ([style.overflow, style.overflowX, style.overflowY].some(value => /^(auto|scroll|overlay)$/.test(value))) return true;
    }
    return false;
  };
  const valid = () => atTop() && !editing() && !selected() && gesture?.target.isConnected;

  root.addEventListener('touchstart', (event) => {
    reset();
    if (reloading || event.touches.length !== 1 || !atTop() || editing() || selected()) return;
    const target = event.target;
    if (!target.closest || target.closest(controls) || insideScroller(target)) return;
    const touch = event.touches[0];
    gesture = { target, id: touch.identifier, x: touch.clientX, y: touch.clientY, pulling: false, ready: false };
    detachObserver.observe(root, { childList: true, subtree: true });
  }, { passive: true });

  root.addEventListener('touchmove', (event) => {
    if (!gesture) return;
    if (event.touches.length !== 1 || !valid() || !event.cancelable) { reset(); return; }
    const touch = event.touches[0];
    if (touch.identifier !== gesture.id) { reset(); return; }
    const dx = Math.abs(touch.clientX - gesture.x);
    const dy = touch.clientY - gesture.y;
    if (!gesture.pulling && Math.max(dx, Math.abs(dy)) < intentDistance) return;
    // Lock out horizontal, diagonal or upward intent for this entire touch.
    if (dy <= 0 || dy < dx * verticalRatio) { reset(); return; }
    gesture.pulling = true;
    gesture.ready = dy >= threshold;
    event.preventDefault();
    indicator.textContent = gesture.ready ? '놓으면 새로고침' : '아래로 당겨 새로고침';
    indicator.hidden = false;
  }, { passive: false });

  root.addEventListener('touchend', (event) => {
    if (!gesture) return;
    const refresh = event.touches.length === 0 && gesture.ready && valid();
    reset();
    if (!refresh || reloading) return;
    reloading = true;
    indicator.textContent = '새로고침 중…';
    indicator.hidden = false;
    // Reinitialize all view/module caches and load the current deployment shell.
    location.reload();
  }, { passive: true });

  root.addEventListener('touchcancel', reset, { passive: true });
  document.addEventListener('focusin', () => { if (editing()) reset(); });
}
