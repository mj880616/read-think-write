import assert from 'node:assert/strict';
import { groupResourcesByMonth, matchesQuery } from '../src/model.js';

const grouped = groupResourcesByMonth([
  { id: 'a', published_on: '2026-09-14' },
  { id: 'b', published_on: '2026-09-14' },
  { id: 'c', published_on: '2026-10-01' }
]);
assert.equal(grouped['2026']['09']['14'].length, 2);
assert.equal(grouped['2026']['10']['01'][0].id, 'c');
assert.equal(matchesQuery({ title: '기술노동자 권력의 부상과 몰락' }, '기술노동', ['title']), true);
assert.equal(matchesQuery({ title: '다른 글' }, '기술노동', ['title']), false);
console.log('model tests passed');
