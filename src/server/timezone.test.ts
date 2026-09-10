import { describe, it, expect } from 'bun:test';
import {
  getServerTimezone,
  getInitialDate,
  resolveServerCookieTimezone,
  resolveServerInitialDate,
} from './timezone';

describe('Timezone server functions', () => {
  it('defines getServerTimezone server function', () => {
    expect(getServerTimezone).toBeDefined();
  });

  it('defines getInitialDate server function', () => {
    expect(getInitialDate).toBeDefined();
  });

  it('resolves undefined timezone when getCookie is not in request context', async () => {
    const tz = await resolveServerCookieTimezone();
    expect(tz).toBeUndefined();
  });

  it('resolves default date string when cookie is absent', async () => {
    const date = await resolveServerInitialDate();
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
