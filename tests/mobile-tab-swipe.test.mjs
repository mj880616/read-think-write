import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const start = source.indexOf('function bindPrimaryTabSwipe()');
const end = source.indexOf('\nbindPrimaryTabSwipe();', start);
assert.ok(start >= 0 && end > start, 'primary tab swipe handler exists');
const swipeSource = source.slice(start, end);
const tabsSource = source.slice(source.indexOf('const PRIMARY_TABS = ['), source.indexOf('let user = null;'));
const indexStart = source.indexOf('function primaryTabIndex()');
const indexSource = source.slice(indexStart, start);

test('every main tab still resolves to its swipe neighbor after the memo label change', () => {
  const paths = ['/', '/read/', '/bookmarks/', '/notes/', '/records/', '/topics/', '/questions/', '/archive/2026/', '/search/'];
  for (const [index, path] of paths.entries()) {
    const resolved = vm.runInNewContext(`${tabsSource}\n${indexSource}\n({ index: primaryTabIndex(), label: SWIPE_TABS[primaryTabIndex()]?.label })`, {
      pathFromLocation: () => path
    });
    assert.equal(resolved.index, index, path);
    if (path === '/notes/') assert.equal(resolved.label, '메모');
  }
});

function swipeHarness({ index = 2, targetType = 'blank', selection = '' } = {}) {
  const listeners = new Map();
  const routes = Array.from({ length: 9 }, (_, n) => ({ path: `/tab-${n}/` }));
  const navigations = [];
  const page = {
    classList: { add() {}, remove() {}, toggle() {} },
    style: {}
  };
  const target = {
    closest(selector) {
      if (selector === '.page') return page;
      return selector.split(',').some((part) => part.trim() === targetType) ? this : null;
    }
  };
  const root = { addEventListener(type, callback) { listeners.set(type, callback); } };
  vm.runInNewContext(`${swipeSource}\nbindPrimaryTabSwipe();`, {
    root,
    SWIPE_TABS: routes,
    primaryTabIndex: () => index,
    navigate: (path) => navigations.push(path),
    matchMedia: () => ({ matches: true }),
    window: { innerWidth: 390, getSelection: () => ({ toString: () => selection }) },
    setTimeout: () => {}
  });
  let prevented = 0;
  const fire = (type, x, y, { cancelable = true } = {}) => {
    listeners.get(type)({
      target,
      touches: type === 'touchend' || type === 'touchcancel' ? [] : [{ clientX: x, clientY: y }],
      cancelable,
      preventDefault() { prevented += 1; }
    });
  };
  return { fire, navigations, get prevented() { return prevented; } };
}

test('blank body and card allow swiping both directions', () => {
  for (const targetType of ['blank', 'card']) {
    for (const [endX, expected] of [[100, '/tab-3/'], [290, '/tab-1/']]) {
      const h = swipeHarness({ targetType });
      h.fire('touchstart', 195, 700);
      h.fire('touchmove', endX, 704);
      h.fire('touchend');
      assert.deepEqual(h.navigations, [expected]);
      assert.equal(h.prevented, 1);
    }
  }
});

test('vertical scroll and diagonal movement do not switch tabs or prevent scrolling', () => {
  for (const [x, y] of [[205, 560], [285, 620]]) {
    const h = swipeHarness();
    h.fire('touchstart', 195, 700);
    h.fire('touchmove', x, y);
    h.fire('touchend');
    assert.deepEqual(h.navigations, []);
    assert.equal(h.prevented, 0);
  }
});

test('interactive controls, horizontal scrollers, and selected text retain their gestures', () => {
  for (const targetType of ['button', 'input', 'textarea', 'select', 'label', '[data-swipe-ignore]']) {
    const h = swipeHarness({ targetType });
    h.fire('touchstart', 195, 500);
    h.fire('touchmove', 100, 500);
    h.fire('touchend');
    assert.deepEqual(h.navigations, [], targetType);
    assert.equal(h.prevented, 0, targetType);
  }
  const selected = swipeHarness({ selection: 'selected text' });
  selected.fire('touchstart', 195, 500);
  selected.fire('touchmove', 100, 500);
  selected.fire('touchend');
  assert.deepEqual(selected.navigations, []);
  assert.equal(selected.prevented, 0);
});

test('links and card summaries still allow a deliberate tab swipe while a tap stays untouched', () => {
  for (const targetType of ['a', 'summary']) {
    const swipe = swipeHarness({ targetType });
    swipe.fire('touchstart', 195, 500);
    swipe.fire('touchmove', 175, 500);
    swipe.fire('touchmove', 100, 500);
    swipe.fire('touchend');
    assert.deepEqual(swipe.navigations, ['/tab-3/'], targetType);

    const tap = swipeHarness({ targetType });
    tap.fire('touchstart', 195, 500);
    tap.fire('touchmove', 192, 500);
    tap.fire('touchend');
    assert.deepEqual(tap.navigations, [], targetType);
    assert.equal(tap.prevented, 0, targetType);
  }
});

test('the first horizontal move is handled before the browser claims the gesture', () => {
  const h = swipeHarness();
  h.fire('touchstart', 195, 500);
  h.fire('touchmove', 177, 500);
  assert.equal(h.prevented, 1);
  h.fire('touchmove', 100, 500);
  h.fire('touchend');
  assert.deepEqual(h.navigations, ['/tab-3/']);
});

test('browser edge gestures and unavailable adjacent tabs are not intercepted', () => {
  const edge = swipeHarness();
  edge.fire('touchstart', 10, 500);
  edge.fire('touchmove', 100, 500);
  edge.fire('touchend');
  assert.deepEqual(edge.navigations, []);
  assert.equal(edge.prevented, 0);

  const first = swipeHarness({ index: 0 });
  first.fire('touchstart', 195, 500);
  first.fire('touchmove', 290, 500);
  first.fire('touchend');
  assert.deepEqual(first.navigations, []);
  assert.equal(first.prevented, 0);
});

test('a gesture that turns into vertical scrolling does not switch tabs', () => {
  const h = swipeHarness();
  h.fire('touchstart', 195, 500);
  h.fire('touchmove', 175, 497);
  h.fire('touchmove', 100, 300);
  h.fire('touchend');
  assert.deepEqual(h.navigations, []);
});
