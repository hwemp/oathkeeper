import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileLimit, previewType, canDelete, STORAGE_LIMIT } from '../src/community/policy.js';

test('agreed decimal file and storage limits, including disguised extensions', () => {
  assert.equal(fileLimit('photo.png', ''), 100_000_000);
  assert.equal(fileLimit('photo.bin', 'image/jpeg'), 100_000_000);
  assert.equal(fileLimit('clip.MP4', 'application/octet-stream'), 500_000_000);
  assert.equal(fileLimit('clip.bin', 'video/webm'), 500_000_000);
  assert.equal(fileLimit('sheet.pdf', 'application/pdf'), 1_000_000_000);
  assert.equal(fileLimit('archive.zip', ''), 1_000_000_000);
  assert.equal(STORAGE_LIMIT, 5_000_000_000);
});
test('inline previews use content signatures and exclude executable HTML and SVG', () => {
  assert.equal(previewType(Buffer.from('<svg onload="alert(1)">')), null);
  assert.equal(previewType(Buffer.from('<!doctype html>')), null);
  assert.equal(previewType(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), 'image/png');
});
test('deletion belongs to author or group owner', () => {
  assert.equal(canDelete('author', 'author'), true);
  assert.equal(canDelete('author', 'owner', 'owner'), true);
  assert.equal(canDelete('author', 'outsider', 'owner'), false);
});
