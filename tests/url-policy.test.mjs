import assert from 'node:assert/strict';
import { parsePublicHttpUrl, isBlockedHostname, isBlockedIpLiteral } from '../supabase/functions/_shared/rtw-url-policy.js';

assert.equal(parsePublicHttpUrl('https://example.com/a').hostname, 'example.com');
assert.throws(() => parsePublicHttpUrl('file:///etc/passwd'));
assert.throws(() => parsePublicHttpUrl('javascript:alert(1)'));
assert.throws(() => parsePublicHttpUrl('https://user:pass@example.com/'));
assert.equal(isBlockedHostname('localhost'), true);
assert.equal(isBlockedHostname('metadata.google.internal'), true);
assert.equal(isBlockedHostname('example.com'), false);
assert.equal(isBlockedIpLiteral('127.0.0.1'), true);
assert.equal(isBlockedIpLiteral('10.0.0.1'), true);
assert.equal(isBlockedIpLiteral('169.254.169.254'), true);
assert.equal(isBlockedIpLiteral('192.168.1.2'), true);
assert.equal(isBlockedIpLiteral('8.8.8.8'), false);
assert.equal(isBlockedIpLiteral('::1'), true);
assert.equal(isBlockedIpLiteral('fc00::1'), true);
assert.equal(isBlockedIpLiteral('2001:4860:4860::8888'), false);

console.log('url policy tests passed');
