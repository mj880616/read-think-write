import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';

const nativeSource = readFileSync(new URL('../src/mobile-native.js', import.meta.url), 'utf8');
const pullFile = new URL('../src/mobile-pull-refresh.js', import.meta.url);
const pullSource = existsSync(pullFile) ? readFileSync(pullFile, 'utf8') : '';
const mainSource = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const swipeStart = mainSource.indexOf('function bindPrimaryTabSwipe()');
const swipeSource = mainSource.slice(swipeStart, mainSource.indexOf('\nbindPrimaryTabSwipe();', swipeStart));

async function harness({ capacitor = { isNativePlatform: () => true, getPlatform: () => 'android' }, selection = '', swipe = false } = {}) {
  const dom = new JSDOM('<div id="app"><div class="page"><div id="blank">내용</div><div id="inner"><span>내부 스크롤</span></div><textarea></textarea><input><select></select><div contenteditable="true"><span>작성 중</span></div><button>저장</button></div></div>');
  const { window } = dom;
  window.getSelection = () => ({ toString: () => selection });
  const root = window.document.querySelector('#app');
  let reloads = 0;
  const navigations = [];
  const context = vm.createContext({
    window, document: window.document, Capacitor: capacitor, MutationObserver: window.MutationObserver,
    location: { reload: () => reloads++ },
    root, primaryTabIndex: () => 2,
    SWIPE_TABS: Array.from({ length: 9 }, (_, i) => ({ path: `/tab-${i}/` })),
    navigate: (path) => navigations.push(path),
    matchMedia: () => ({ matches: true }), setTimeout: () => {}, console
  });
  const moduleCode = [pullSource, nativeSource].map(source => source.replace(/^import .*;\s*$/gm, '').replace(/^export /gm, '')).join('\n');
  await vm.runInContext(`${moduleCode}\nbootstrapNativeNavigation();`, context);
  if (swipe) vm.runInContext(`${swipeSource}\nbindPrimaryTabSwipe();`, context);
  const fire = (type, x = 195, y = 400, { target = root.querySelector('#blank'), count = 1, cancelable = true } = {}) => {
    const event = new window.Event(type, { bubbles: true, cancelable });
    const touches = type === 'touchend' || type === 'touchcancel' ? [] : Array.from({ length: count }, (_, i) => ({ identifier: i, clientX: x, clientY: y }));
    Object.defineProperty(event, 'touches', { value: touches });
    target.dispatchEvent(event);
    return event.defaultPrevented;
  };
  const pull = (options) => { fire('touchstart', 195, 400, options); fire('touchmove', 195, 520, options); fire('touchend', 195, 520, options); };
  return { window, root, fire, pull, navigations, get reloads() { return reloads; }, get indicator() { return window.document.querySelector('.native-pull-refresh'); } };
}

test('native Android pull shows a small status and reloads the whole page once on release', async () => {
  const h = await harness();
  assert.ok(h.indicator, 'native bootstrap installs the refresh status');
  assert.equal(h.indicator.hidden, true);
  h.fire('touchstart');
  assert.equal(h.fire('touchmove', 195, 520), true);
  assert.equal(h.indicator.hidden, false);
  assert.match(h.indicator.textContent, /놓으면 새로고침/);
  assert.equal(h.reloads, 0);
  h.fire('touchend');
  h.fire('touchend');
  h.pull();
  assert.equal(h.reloads, 1);
  assert.match(h.indicator.textContent, /새로고침 중/);
});

test('ordinary browsers and non-Android platforms leave DOM and touch behavior untouched', async () => {
  for (const capacitor of [null, {}, { isNativePlatform: () => false, getPlatform: () => 'android' }, { isNativePlatform: () => true, getPlatform: () => 'ios' }, { isNativePlatform: () => { throw new Error('bridge unavailable'); } }]) {
    const h = await harness({ capacitor });
    assert.equal(h.indicator, null);
    h.fire('touchstart');
    assert.equal(h.fire('touchmove', 195, 520), false);
    h.fire('touchend');
    assert.equal(h.reloads, 0);
  }
});

test('short pulls, upward scrolling, cancellation and pulling back below the threshold do not reload', async () => {
  for (const [endY, finish] of [[450, 'touchend'], [280, 'touchend'], [520, 'touchcancel']]) {
    const h = await harness();
    h.fire('touchstart'); h.fire('touchmove', 195, endY); h.fire(finish);
    assert.equal(h.reloads, 0);
    assert.equal(h.indicator?.hidden, true);
  }
  const h = await harness();
  h.fire('touchstart'); h.fire('touchmove', 195, 520); h.fire('touchmove', 195, 430); h.fire('touchend');
  assert.equal(h.reloads, 0);
});

test('a gesture must start and finish at document top', async () => {
  const h = await harness();
  h.window.scrollY = 200;
  h.fire('touchstart');
  h.window.scrollY = 0;
  assert.equal(h.fire('touchmove', 195, 520), false);
  h.fire('touchend');
  assert.equal(h.reloads, 0);
  h.fire('touchstart'); h.fire('touchmove', 195, 520);
  h.window.scrollY = 1;
  h.fire('touchend');
  assert.equal(h.reloads, 0);
  const doc = await harness();
  doc.window.document.documentElement.scrollTop = 200;
  doc.pull();
  assert.equal(doc.reloads, 0);
});

test('nested scroll areas at their top or middle keep their own scrolling', async () => {
  for (const [axis, scrollTop] of [['Y', 0], ['Y', 50], ['X', 0]]) {
    const h = await harness();
    const inner = h.root.querySelector('#inner');
    inner.style[`overflow${axis}`] = 'auto';
    Object.defineProperty(inner, axis === 'Y' ? 'scrollHeight' : 'scrollWidth', { value: 500 });
    Object.defineProperty(inner, axis === 'Y' ? 'clientHeight' : 'clientWidth', { value: 100 });
    inner.scrollTop = scrollTop;
    const options = { target: inner.firstElementChild };
    h.fire('touchstart', 195, 400, options);
    assert.equal(h.fire('touchmove', 195, 520, options), false);
    h.fire('touchend', 195, 520, options);
    assert.equal(h.reloads, 0);
  }
});

test('form controls and editable descendants never start refresh', async () => {
  for (const selector of ['textarea', 'input', 'select', 'button', '[contenteditable] span']) {
    const h = await harness();
    h.pull({ target: h.root.querySelector(selector) });
    assert.equal(h.reloads, 0, selector);
  }
});

test('focused editors block a pull anywhere and focus acquired during a pull cancels it', async () => {
  for (const selector of ['textarea', 'input', 'select', '[contenteditable]']) {
    const h = await harness();
    h.root.querySelector(selector).focus();
    h.pull();
    assert.equal(h.reloads, 0, selector);
  }
  const h = await harness();
  h.fire('touchstart'); h.fire('touchmove', 195, 520);
  h.root.querySelector('textarea').focus();
  h.root.querySelector('textarea').blur();
  h.fire('touchend');
  assert.equal(h.reloads, 0);
});

test('existing tab swipe still navigates, while vertical pulls do not switch tabs', async () => {
  const horizontal = await harness({ swipe: true });
  horizontal.fire('touchstart'); horizontal.fire('touchmove', 95, 405); horizontal.fire('touchend');
  assert.deepEqual(horizontal.navigations, ['/tab-3/']);
  assert.equal(horizontal.reloads, 0);
  const vertical = await harness({ swipe: true });
  vertical.pull();
  assert.deepEqual(vertical.navigations, []);
  assert.equal(vertical.reloads, 1);
});

test('horizontal intent and diagonal gestures cannot turn into refresh', async () => {
  for (const [x, y] of [[95, 405], [255, 500]]) {
    const h = await harness();
    h.fire('touchstart'); h.fire('touchmove', x, y); h.fire('touchmove', 195, 550); h.fire('touchend');
    assert.equal(h.reloads, 0);
  }
});

test('text selection, multi-touch and a browser-owned gesture are not intercepted', async () => {
  const selected = await harness({ selection: '선택한 글' });
  selected.pull();
  assert.equal(selected.reloads, 0);
  for (const options of [{ count: 2 }, { cancelable: false }]) {
    const h = await harness();
    h.fire('touchstart');
    assert.equal(h.fire('touchmove', 195, 520, options), false);
    h.fire('touchend');
    assert.equal(h.reloads, 0);
  }
});

test('replacing the page during an armed pull cancels refresh', async () => {
  const h = await harness();
  h.fire('touchstart'); h.fire('touchmove', 195, 520);
  const originalTarget = h.root.querySelector('#blank');
  h.root.innerHTML = '<div id="blank">다른 화면</div>';
  await Promise.resolve();
  assert.equal(h.indicator.hidden, true, 'clear without waiting for events from a detached target');
  h.fire('touchend', 195, 520, { target: originalTarget });
  assert.equal(h.reloads, 0);
});
