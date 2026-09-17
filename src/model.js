export function groupResourcesByMonth(resources = []) {
  return resources.reduce((acc, resource) => {
    if (!resource.published_on) return acc;
    const [year, month, day] = resource.published_on.split('-');
    acc[year] ??= {};
    acc[year][month] ??= {};
    acc[year][month][day] ??= [];
    acc[year][month][day].push(resource);
    return acc;
  }, {});
}

export function matchesQuery(item, query, fields) {
  const q = query.trim().toLocaleLowerCase('ko-KR');
  if (!q) return true;
  return fields.some((field) => String(item?.[field] ?? '').toLocaleLowerCase('ko-KR').includes(q));
}

export function formatDate(date) {
  if (!date) return '';
  const [y, m, d] = date.split('-').map(Number);
  return `${y}.${String(m).padStart(2, '0')}.${String(d).padStart(2, '0')}`;
}

export function safeHttpUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

export function rememberLoginUntil(now = Date.now()) {
  return now + 30 * 24 * 60 * 60 * 1000;
}

export function isRememberedLoginValid(value, now = Date.now()) {
  const until = Number(value);
  return Number.isFinite(until) && until > now;
}

export function isOAuthCallback(search = '') {
  try {
    return Boolean(new URLSearchParams(search).get('code'));
  } catch {
    return false;
  }
}

export function enabledAuthProviders() {
  return ['google'];
}

export function shouldUnlinkEmailIdentity(identities = []) {
  const providers = new Set(identities.map((identity) => identity?.provider).filter(Boolean));
  return providers.has('google') && providers.has('email') && identities.length >= 2;
}
