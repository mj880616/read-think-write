import assert from 'node:assert/strict';
import { shouldKeepContentBlock } from '../supabase/functions/_shared/rtw-body-extraction.js';

assert.equal(shouldKeepContentBlock('li', []), true);
assert.equal(shouldKeepContentBlock('p', ['li']), false, 'paragraph nested in a list item must not be emitted twice');
assert.equal(shouldKeepContentBlock('p', ['blockquote']), false, 'paragraph nested in a blockquote must not be emitted twice');
assert.equal(shouldKeepContentBlock('p', ['div']), true, 'ordinary article paragraphs remain');
assert.equal(shouldKeepContentBlock('li', ['ul']), true, 'list items remain');

console.log('body extraction tests passed');
