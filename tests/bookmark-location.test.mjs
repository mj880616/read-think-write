import assert from 'node:assert/strict';
import test from 'node:test';
import { bookmarkSelectionData, locateBookmarkRange } from '../src/bookmark-location.js';

const nodes = (...parts) => parts.map((nodeValue) => ({ nodeValue }));

test('a long quote at the first paragraph resolves from its saved offset', () => {
  const quote = '처음 문단의 긴 문장은 앞과 뒤를 모두 포함한 채 정확한 위치로 돌아가야 한다.';
  const textNodes = nodes(`${quote} 이어지는 말.`, '다음 문단.');
  const found = locateBookmarkRange(textNodes, {
    selected_text: quote,
    start_offset: 0,
    end_offset: quote.length
  });
  assert.equal(found?.startNode, textNodes[0]);
  assert.equal(found?.startOffset, 0);
  assert.equal(found?.endOffset, quote.length);
});

test('bookmarks at the middle and end resolve despite rendered paragraph breaks', () => {
  const textNodes = nodes('도입 문단.', '중간에 남긴 문장과 다음 문장.', '마지막에 남긴 문장.');
  const displayed = textNodes.map((node) => node.nodeValue).join('\n\n');
  for (const quote of ['중간에 남긴 문장', '마지막에 남긴 문장.']) {
    const start = displayed.indexOf(quote);
    const found = locateBookmarkRange(textNodes, {
      selected_text: quote,
      start_offset: start,
      end_offset: start + quote.length
    });
    assert.ok(found, quote);
    assert.equal(found.startNode.nodeValue.slice(found.startOffset, found.endNode === found.startNode ? found.endOffset : undefined), quote);
  }
  assert.ok(displayed.length > textNodes.map((node) => node.nodeValue).join('').length);
});

test('a quote spanning separate text nodes and rendered lines resolves', () => {
  const textNodes = nodes('첫 줄의 끝', '다음 줄의 시작');
  const quote = '줄의 끝\n다음 줄의';
  const found = locateBookmarkRange(textNodes, { selected_text: quote });
  assert.equal(found?.startNode, textNodes[0]);
  assert.equal(found?.endNode, textNodes[1]);
  assert.equal(found?.startOffset, 2);
  assert.equal(found?.endOffset, 5);
});

test('whitespace, nonbreaking spaces, and quote marks can differ', () => {
  const textNodes = nodes('그는 “좋아”라고\u00a0말했다.');
  const found = locateBookmarkRange(textNodes, { selected_text: '그는 "좋아"라고 말했다.' });
  assert.equal(found?.startOffset, 0);
  assert.equal(found?.endOffset, textNodes[0].nodeValue.length);
});

test('saved context chooses the intended copy of repeated text', () => {
  const textNodes = nodes('첫 설명. 같은 문장. 앞부분. 둘째 설명. 같은 문장. 뒷부분.');
  const quote = '같은 문장.';
  const found = locateBookmarkRange(textNodes, {
    selected_text: quote,
    start_offset: 0,
    context_before: '둘째 설명. ',
    context_after: ' 뒷부분.'
  });
  assert.equal(found?.startOffset, textNodes[0].nodeValue.lastIndexOf(quote));
});

test('saving a repeated selection uses its actual range rather than the first quote', () => {
  const full = '앞. 같은 문장. 뒤. 같은 문장. 끝.';
  const prefix = '앞. 같은 문장. 뒤. ';
  const quote = '같은 문장.';
  const saved = bookmarkSelectionData(full, quote, prefix, prefix + quote, quote);
  assert.equal(saved.start, full.lastIndexOf(quote));
  assert.equal(saved.end, saved.start + quote.length);
  assert.equal(saved.contextBefore, prefix);
  assert.equal(saved.contextAfter, ' 끝.');
});

test('an unchanged quote still resolves after an insertion changes its saved offset', () => {
  const textNodes = nodes('새로운 앞 문단. 원래 기억한 문장.');
  const found = locateBookmarkRange(textNodes, {
    selected_text: '원래 기억한 문장.',
    start_offset: 0,
    end_offset: 10,
    context_before: '앞 문단. '
  });
  assert.equal(found?.startOffset, textNodes[0].nodeValue.indexOf('원래'));
});

test('a quote removed by editing reports no position', () => {
  assert.equal(locateBookmarkRange(nodes('완전히 바뀐 본문.'), {
    selected_text: '삭제된 문장.',
    context_before: '이전 문맥',
    context_after: '이후 문맥'
  }), null);
});
