import test from 'node:test';
import assert from 'node:assert/strict';
import {currentHeadingIndex, nextTocState, panelScrollForLink, TOC_CLOSE_AT, TOC_OPEN_AT, TOC_READING_LINE} from '../public/blog-toc.js';

test('the contents panel opens after the reading area and closes only at the page top', () => {
  assert.equal(TOC_CLOSE_AT < TOC_OPEN_AT, true);
  let state = nextTocState({scrollY: 0, open: false, dismissed: false});
  assert.deepEqual(state, {open: false, dismissed: false});
  state = nextTocState({scrollY: TOC_OPEN_AT - 1, open: false, dismissed: false});
  assert.equal(state.open, false);
  state = nextTocState({scrollY: TOC_OPEN_AT, open: false, dismissed: false});
  assert.deepEqual(state, {open: true, dismissed: false});
  state = nextTocState({scrollY: TOC_CLOSE_AT + 1, open: true, dismissed: false});
  assert.equal(state.open, true);
  state = nextTocState({scrollY: TOC_CLOSE_AT, open: true, dismissed: false});
  assert.deepEqual(state, {open: false, dismissed: false});
});

test('a manual close stays closed through later scrolling until the page top', () => {
  let state = nextTocState({scrollY: 480, open: true, dismissed: true});
  assert.deepEqual(state, {open: false, dismissed: true});
  state = nextTocState({scrollY: TOC_OPEN_AT + 40, open: false, dismissed: true});
  assert.deepEqual(state, {open: false, dismissed: true});
  state = nextTocState({scrollY: TOC_CLOSE_AT, open: false, dismissed: true});
  assert.deepEqual(state, {open: false, dismissed: false});
  state = nextTocState({scrollY: TOC_OPEN_AT, open: false, dismissed: false});
  assert.equal(state.open, true);
});

test('the current heading follows scroll down, scroll up, and the first and last sections', () => {
  const tops = [640, 1400, 2200, 3100];
  assert.equal(currentHeadingIndex(tops, 0), 0);
  assert.equal(currentHeadingIndex(tops, tops[0] - TOC_READING_LINE), 0);
  assert.equal(currentHeadingIndex(tops, tops[1] - TOC_READING_LINE), 1);
  assert.equal(currentHeadingIndex(tops, tops[2] - TOC_READING_LINE), 2);
  assert.equal(currentHeadingIndex(tops, tops[1] - TOC_READING_LINE - 1), 0);
  assert.equal(currentHeadingIndex(tops, 8000), tops.length - 1);
  assert.equal(currentHeadingIndex(tops, tops[tops.length - 1] - TOC_READING_LINE), tops.length - 1);
  assert.equal(currentHeadingIndex([], 100), -1);
  const stuckBelowTheLine = [640, 1400, 4700];
  assert.equal(currentHeadingIndex(stuckBelowTheLine, 4485), 1);
  assert.equal(currentHeadingIndex(stuckBelowTheLine, 4485, TOC_READING_LINE, {scrollHeight: 5485, viewportHeight: 1000}), 2);
  assert.equal(currentHeadingIndex([200, 400], 0, TOC_READING_LINE, {scrollHeight: 800, viewportHeight: 1000}), 0);
  assert.equal(currentHeadingIndex([100, 5000], 2000, TOC_READING_LINE, {scrollHeight: 3000, viewportHeight: 1000}), 0);
});

test('a long contents list scrolls only its own panel to keep the current link visible', () => {
  const inside = panelScrollForLink({scrollTop: 40, panelHeight: 120, linkTop: 50, linkHeight: 24});
  assert.equal(inside, 40);
  const above = panelScrollForLink({scrollTop: 80, panelHeight: 120, linkTop: 20, linkHeight: 24});
  assert.equal(above, 12);
  const below = panelScrollForLink({scrollTop: 0, panelHeight: 120, linkTop: 200, linkHeight: 24});
  assert.equal(below, 112);
});
