import { describe, expect, it } from 'vitest';
import { labs, groups, canonicalLabUrls } from '../../src/lib/labs.mjs';
import { learningApps } from '../../src/lib/learning-apps.mjs';
import { MESSAGES, messageKey } from '../../src/lib/waitlist.mjs';

describe('the labs on the hub', () => {
  it('are the eight labs of the series, in order', () => {
    expect(labs.map(lab => lab.name)).toEqual([
      'Interactive Periodic Table', 'Physics Lab', 'Biology Lab', 'Earth Science Lab', 'Astronomy Lab', 'Geometry Lab', 'KidsCode', 'Fiction & Fact Library',
    ]);
  });

  it('use each lab’s name, color, tint, mark and icon from learning-apps.mjs', () => {
    for (const lab of labs) {
      const app = learningApps.find(entry => entry.id === lab.id);
      expect({ name: lab.name, color: lab.color, tint: lab.tint, mark: lab.mark, path: lab.path, url: lab.url })
        .toEqual({ name: app.name, color: app.color, tint: app.tint, mark: app.mark, path: app.path, url: `${app.url}/` });
    }
  });

  it('link only to canonical URLs: no trailing slash on Interactive Periodic Table paths, a trailing slash elsewhere', () => {
    expect(canonicalLabUrls.size).toBeGreaterThan(30);
    for (const href of canonicalLabUrls) {
      const url = new URL(href);
      expect(url.protocol).toBe('https:');
      expect(url.search + url.hash).toBe('');
      if (url.hostname === 'interactiveperiodictable.net' && url.pathname !== '/') expect(url.pathname).not.toMatch(/\/$/);
      else expect(url.pathname).toMatch(/\/$/);
    }
  });

  it('give every lab with a teachers page a grade band and a summary of it', () => {
    for (const lab of labs.filter(entry => entry.teachersUrl)) {
      expect(lab.grades, lab.name).toBeTruthy();
      expect(lab.teachers, lab.name).toBeTruthy();
      expect(lab.tools.length, lab.name).toBeGreaterThanOrEqual(4);
    }
    // KidsCode's pages could not be checked: only its home page and its own description are used.
    const kids = labs.find(lab => lab.id === 'kids');
    expect([kids.teachersUrl, kids.grades, kids.tools.length]).toEqual([null, null, 0]);
  });

  it('put every lab in exactly one subject group', () => {
    expect(groups.flatMap(group => group.labs.map(lab => lab.id)).sort()).toEqual(labs.map(lab => lab.id).sort());
    expect(groups.map(group => group.name)).toEqual(['Science', 'Math', 'Coding', 'Reading']);
  });

  it('use American spelling and no em dashes in their copy', () => {
    const copy = JSON.stringify(labs.map(({ does, grades, teachers, tools }) => ({ does, grades, teachers, tools })));
    expect(copy).not.toMatch(/—|licence|colour|practise\b|organis/i);
  });
});

describe('waitlist messages', () => {
  it('cover every result code of the API', () => {
    for (const code of ['ok', 'invalid_email', 'invalid_field', 'consent_required', 'turnstile_failed', 'bad_origin', 'rate_limited', 'server_error', 'network']) {
      expect(MESSAGES[code], code).toBeTruthy();
      expect(messageKey(code)).toBe(code);
    }
    expect(Object.values(MESSAGES).join(' ')).not.toMatch(/—/);
  });

  it('fall back to the generic message for anything unknown', () => {
    for (const code of ['', 'nope', '__proto__', 'toString', null, undefined, 42]) expect(messageKey(code)).toBe('server_error');
  });
});
