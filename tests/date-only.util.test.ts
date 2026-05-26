import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  dateOnlyFromStoredDate,
  parseDateOnlyUtc,
  todayDateOnlyAR,
} from '../src/utils/date-only.util';

describe('date-only.util', () => {
  it('parseDateOnlyUtc guarda medianoche UTC sin corrimiento', () => {
    const d = parseDateOnlyUtc('2026-05-26');
    assert.equal(d.toISOString(), '2026-05-26T00:00:00.000Z');
    assert.equal(dateOnlyFromStoredDate(d), '2026-05-26');
  });

  it('todayDateOnlyAR usa calendario de Argentina', () => {
    const noonUtcMay26 = new Date('2026-05-26T15:00:00.000Z');
    assert.equal(todayDateOnlyAR(noonUtcMay26), '2026-05-26');
  });
});
