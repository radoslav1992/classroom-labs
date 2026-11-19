import { describe, expect, it } from 'vitest';
import { noticeCode } from '../../src/notice';

const get = (path: string, method = 'GET') => new Request(`https://classroomlabs.org${path}`, { method });

describe('no-JavaScript result message', () => {
  it('applies to the two form pages with ?waitlist=', () => {
    expect(noticeCode(get('/?waitlist=ok'))).toBe('ok');
    expect(noticeCode(get('/teachers/?waitlist=rate_limited#teacher-plan'))).toBe('rate_limited');
  });

  it('maps unknown codes to the generic message, so nothing from the URL reaches the selector', () => {
    expect(noticeCode(get('/?waitlist="]%20*'))).toBe('server_error');
    expect(noticeCode(get('/?waitlist=constructor'))).toBe('server_error');
  });

  it('leaves other pages, other methods and plain visits alone', () => {
    expect(noticeCode(get('/'))).toBeNull();
    expect(noticeCode(get('/about/?waitlist=ok'))).toBeNull();
    expect(noticeCode(get('/?waitlist=ok', 'HEAD'))).toBeNull();
  });
});
