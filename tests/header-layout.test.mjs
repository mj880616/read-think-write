import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const shellSource = main.slice(main.indexOf('function shell('), main.indexOf('function setAccountMenuOpen('));
function mediaBlock(query) {
  const start = styles.indexOf(`${query}{`);
  assert.notEqual(start, -1, `missing ${query}`);
  return styles.slice(start, styles.indexOf('\n}', start));
}
const desktopCss = mediaBlock('@media(min-width:1024px)');
const accountGroupCss = mediaBlock('@media(min-width:761px)');
const tabletCss = mediaBlock('@media(min-width:761px) and (max-width:1023px)');

test('header keeps email, account deletion and logout inside a named account menu', () => {
  assert.match(shellSource, /<button class="account-menu-toggle"[^>]*aria-label="계정 메뉴"[^>]*aria-expanded="false"[^>]*aria-controls="account-menu-panel"/);
  const panel = shellSource.slice(shellSource.indexOf('id="account-menu-panel"'));
  assert.match(panel, /class="user-email"/, 'email is only shown inside the account menu');
  assert.match(panel, /href\('\/about\/\?delete-account=1'\)/, 'account deletion stays reachable from the account menu');
  assert.match(panel, /data-logout/, 'logout stays reachable from the account menu');
  assert.equal((shellSource.match(/class="user-email"/g) || []).length, 1);
  assert.match(shellSource, /userbar-search[^"]*"[^>]*data-nav="\/search\/"/, 'search sits in the right-hand group');
});

test('PC header is a single non-wrapping row with shared page-top spacing', () => {
  assert.match(desktopCss, /\.topbar\{display:grid;grid-template-columns:auto minmax\(0,1fr\) auto;[^}]*min-height:64px/);
  assert.match(desktopCss, /\.nav\{flex-wrap:nowrap;justify-content:center/);
  assert.match(desktopCss, /\.shell \.page\{padding-top:40px\}/);
  assert.match(desktopCss, /\.page \.hero,\.page \.record-detail-head\{padding-top:0;padding-bottom:24px\}/);
  assert.match(desktopCss, /\.page \.hero\+\*\{margin-top:0\}/);
  assert.doesNotMatch(styles, /\.read-list-shell \.page \{ padding-top/, 'no per-screen page-top override');
});

test('PC and tablet (>=761px) share the account group and dropdown account menu', () => {
  assert.match(accountGroupCss, /\.nav a\[data-nav="\/search\/"\]\{display:none\}/);
  assert.match(accountGroupCss, /\.userbar\{[^}]*flex-wrap:nowrap;white-space:nowrap/);
  assert.match(accountGroupCss, /\.account-menu-panel\{display:none;position:absolute/);
  assert.match(accountGroupCss, /\.account-menu\.open \.account-menu-panel\{display:flex\}/);
});

test('tablet/fold (761-1023px) header is two tidy rows with a non-wrapping nav', () => {
  assert.match(tabletCss, /\.topbar\{display:grid;grid-template-columns:minmax\(0,1fr\) auto;grid-template-areas:"brand user" "nav nav"/);
  assert.match(tabletCss, /\.userbar\{grid-area:user\}/);
  assert.match(tabletCss, /\.nav\{grid-area:nav;flex-wrap:nowrap;[^}]*overflow-x:auto/, 'nav never wraps; it scrolls if a wide font needs more room');
  assert.match(tabletCss, /\.nav a\{white-space:nowrap\}/);
  assert.doesNotMatch(tabletCss, /\.page|\.hero/, 'tablet change is header-only');
});

test('narrow screens flatten the account menu back into the existing userbar', () => {
  const base = styles.slice(0, styles.indexOf('@media(min-width:761px){'));
  assert.match(base, /\.userbar-search,\.account-menu-toggle,\.account-menu-item\{display:none\}/);
  assert.match(base, /\.account-menu\{display:contents\}\.account-menu-panel\{display:contents\}/);
});

function menuHarness() {
  const listeners = {};
  const attrs = { 'aria-expanded': 'false' };
  let focused = null;
  const insideTarget = { closest: (selector) => (selector === '[data-account-menu]' ? menu : null) };
  const outsideTarget = { closest: () => null };
  const toggle = { getAttribute: (key) => attrs[key], setAttribute: (key, value) => { attrs[key] = value; }, focus() { focused = 'toggle'; } };
  const classes = new Set();
  const menu = { classList: { toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)) } };
  const document = {
    addEventListener: (type, fn) => { listeners[type] = fn; },
    querySelector: (selector) => ({ '[data-account-toggle]': toggle, '[data-account-menu]': menu })[selector] ?? null
  };
  const start = main.indexOf('function setAccountMenuOpen(');
  const block = main.slice(start, main.indexOf('function bindCommon('));
  const context = { document };
  vm.runInNewContext(`${block}\nthis.setAccountMenuOpen = setAccountMenuOpen;`, context);
  return {
    open: () => context.setAccountMenuOpen(true),
    get expanded() { return attrs['aria-expanded']; },
    get classOpen() { return classes.has('open'); },
    get focused() { return focused; },
    emit: (type, event) => listeners[type]?.(event),
    insideTarget, outsideTarget
  };
}

test('account menu closes on Escape (returning focus), outside click and focus leaving', () => {
  const menu = menuHarness();
  menu.open();
  assert.equal(menu.expanded, 'true');
  assert.equal(menu.classOpen, true);

  menu.emit('keydown', { key: 'Escape' });
  assert.equal(menu.expanded, 'false');
  assert.equal(menu.classOpen, false);
  assert.equal(menu.focused, 'toggle');

  menu.open();
  menu.emit('click', { target: menu.insideTarget });
  assert.equal(menu.expanded, 'true', 'clicks inside the menu keep it open');
  menu.emit('click', { target: menu.outsideTarget });
  assert.equal(menu.expanded, 'false');

  menu.open();
  menu.emit('focusin', { target: menu.outsideTarget });
  assert.equal(menu.expanded, 'false');
});
