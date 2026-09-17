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

export function validateSignupInput(email, password, passwordConfirm) {
  const cleanEmail = String(email ?? '').trim();
  const cleanPassword = String(password ?? '');
  const cleanConfirm = String(passwordConfirm ?? '');

  if (!cleanEmail || !cleanEmail.includes('@')) {
    return { ok: false, message: '이메일 주소를 확인해 주세요.' };
  }
  if (cleanPassword.length < 8) {
    return { ok: false, message: '비밀번호는 8자 이상으로 입력해 주세요.' };
  }
  if (cleanPassword !== cleanConfirm) {
    return { ok: false, message: '비밀번호 확인이 일치하지 않습니다.' };
  }
  return { ok: true, message: '' };
}

export function rememberLoginUntil(now = Date.now()) {
  return now + 30 * 24 * 60 * 60 * 1000;
}

export function isRememberedLoginValid(value, now = Date.now()) {
  const until = Number(value);
  return Number.isFinite(until) && until > now;
}
