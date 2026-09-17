import assert from 'node:assert/strict';
import { extractPublishedDateFromText } from '../supabase/functions/_shared/rtw-date-extraction.js';

assert.equal(
  extractPublishedDateFromText('대통령 지지율이 20%대로 내려가면...\n\n2026. 9. 15. 21:15\n\n본문입니다.'),
  '2026-09-15',
  'Naver-style dotted date near the top of article text should be detected',
);

assert.equal(
  extractPublishedDateFromText('제목\n2026.09.15\n본문'),
  '2026-09-15',
  'compact dotted date should be detected',
);

assert.equal(
  extractPublishedDateFromText('본문 중 과거 사건은 2024. 12. 3.에 있었다. ' + 'x'.repeat(600)),
  '',
  'dates deep in article prose must not be mistaken for publication dates',
);

assert.equal(extractPublishedDateFromText('날짜가 없는 글입니다.'), '');

console.log('date extraction tests passed');
