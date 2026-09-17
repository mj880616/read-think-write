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
  const [y,m,d] = date.split('-').map(Number);
  return `${y}.${String(m).padStart(2,'0')}.${String(d).padStart(2,'0')}`;
}
