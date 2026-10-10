// Native Android bootstrap owns the platform gate. This only handles the gesture.
export function bindNativePullRefresh(root) {
  if (!root) return;

  const threshold = 96;
  const intentDistance = 10;
  const verticalRatio = 2;
  const controls = 'button, input, label, select, textarea, [contenteditable]:not([contenteditable="false"]), [data-swipe-ignore]';
  const editors = 'input, select, textarea, [contenteditable]:not([contenteditable="false"])';
  const editableSelector = '[contenteditable=""], [contenteditable="true" i], [contenteditable="plaintext-only" i]';
  const textInputTypes = new Set(['text', 'search', 'email', 'url', 'tel', 'password', 'number']);
  const initialEditables = new WeakMap();
  const unsavedMessage = '저장하지 않은 내용이 있어 새로고침하지 않습니다';
  let gesture = null;
  let reloading = false;
  let blockedTimer;

  const rememberEditables = (container) => {
    const elements = [...container.querySelectorAll(editableSelector)];
    if (container.matches?.(editableSelector)) elements.push(container);
    for (const element of elements) {
      if (!initialEditables.has(element)) initialEditables.set(element, element.innerHTML);
    }
  };
  rememberEditables(document.body);
  // Keep each editable's first rendered content, including future route renders.
  // Observe added elements only; typing must never replace the original baseline.
  const inputObserver = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'attributes') rememberEditables(record.target);
      for (const node of record.addedNodes) if (node.nodeType === 1) rememberEditables(node);
    }
  });
  inputObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['contenteditable'] });
  const hasUnsavedInput = () => [...document.querySelectorAll(`input, textarea, ${editableSelector}`)].some(element => {
    if (element.matches(editableSelector)) return initialEditables.get(element) !== element.innerHTML;
    if (element.tagName === 'INPUT' && !textInputTypes.has(element.type)) return false;
    // Partial numeric text (e.g. '-') is visible but value can still be empty.
    // defaultValue retains rendered text even after typing or automatic imports.
    return element.validity.badInput || element.value !== element.defaultValue;
  });

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
    window.clearTimeout(blockedTimer);
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
    indicator.textContent = hasUnsavedInput() ? unsavedMessage : gesture.ready ? '놓으면 새로고침' : '아래로 당겨 새로고침';
    indicator.hidden = false;
  }, { passive: false });

  root.addEventListener('touchend', (event) => {
    if (!gesture) return;
    const blocked = gesture.pulling && valid() && hasUnsavedInput();
    const refresh = event.touches.length === 0 && gesture.ready && valid() && !blocked;
    reset();
    if (blocked) {
      indicator.textContent = unsavedMessage;
      indicator.hidden = false;
      blockedTimer = window.setTimeout(() => { indicator.hidden = true; }, 2000);
      return;
    }
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
