export function groupResourcesByArchive(resources) {
  const years = new Map();
  for (const resource of resources) {
    if (!resource.published_on) continue;
    const [year, month, day] = resource.published_on.split('-');
    if (!years.has(year)) years.set(year, new Map());
    const months = years.get(year);
    if (!months.has(month)) months.set(month, new Map());
    const days = months.get(month);
    if (!days.has(day)) days.set(day, []);
    days.get(day).push(resource);
  }
  return years;
}

export function archiveYears(resources) {
  return [...groupResourcesByArchive(resources).keys()].sort((a, b) => Number(b) - Number(a));
}
