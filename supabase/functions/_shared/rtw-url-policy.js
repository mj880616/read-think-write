const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata.aws.internal',
  'metadata.azure.internal',
  'instance-data.ec2.internal'
]);

function parseIpv4(hostname) {
  const parts = hostname.split('.');
  if (parts.length !== 4) return null;
  const nums = parts.map((part) => Number(part));
  if (nums.some((num, index) => !Number.isInteger(num) || num < 0 || num > 255 || String(num) !== String(Number(parts[index])))) {
    return null;
  }
  return nums;
}

function isBlockedIpv4(parts) {
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

export function parsePublicHttpUrl(value) {
  let url;
  try {
    url = new URL(String(value ?? '').trim());
  } catch {
    throw new Error('올바른 URL을 입력하세요.');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('http 또는 https URL만 사용할 수 있습니다.');
  }
  if (!url.hostname) throw new Error('호스트가 없는 URL은 사용할 수 없습니다.');
  if (url.username || url.password) throw new Error('자격증명이 포함된 URL은 사용할 수 없습니다.');
  return url;
}

export function isBlockedHostname(hostname) {
  const host = String(hostname ?? '').trim().toLowerCase().replace(/\.$/, '');
  if (!host) return true;
  if (BLOCKED_HOSTNAMES.has(host)) return true;
  if (host.endsWith('.localhost') || host.endsWith('.local')) return true;
  return false;
}

export function isBlockedIpLiteral(hostname) {
  let host = String(hostname ?? '').trim().toLowerCase();
  if (!host) return false;
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1);

  const ipv4 = parseIpv4(host);
  if (ipv4) return isBlockedIpv4(ipv4);

  if (!host.includes(':')) return false;
  if (host === '::' || host === '::1') return true;

  if (host.startsWith('::ffff:')) {
    const mapped = parseIpv4(host.slice('::ffff:'.length));
    return mapped ? isBlockedIpv4(mapped) : true;
  }

  const first = host.split(':', 1)[0];
  if (first.startsWith('fc') || first.startsWith('fd')) return true;
  if (/^fe[89ab]/.test(first)) return true;
  if (first === 'ff00' || first.startsWith('ff')) return true;

  return false;
}
