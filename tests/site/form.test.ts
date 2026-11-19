// Renders the Teacher plan section with the Astro container, with and without a Turnstile site key.
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { afterEach, describe, expect, it, vi } from 'vitest';

async function render(siteKey: string, pathname = '/teachers/') {
  vi.resetModules();
  vi.stubEnv('PUBLIC_TURNSTILE_SITE_KEY', siteKey);
  const { default: TeacherPlan } = await import('../../src/components/TeacherPlan.astro');
  const container = await AstroContainer.create();
  return container.renderToString(TeacherPlan, { request: new Request(`https://classroomlabs.org${pathname}`) });
}

afterEach(() => vi.unstubAllEnvs());

describe('Teacher plan section', () => {
  it('shows the pitch but no form while PUBLIC_TURNSTILE_SITE_KEY is empty', async () => {
    const html = await render('');
    expect(html).toContain('id="teacher-plan"');
    expect(html).toContain('one license for all the labs');
    expect(html).not.toContain('<form');
    expect(html).not.toContain('cf-turnstile');
  });

  it('renders every contract field once the site key is set', async () => {
    const html = await render('1x00000000000000000000AA');
    const form = html.match(/<form[\s\S]*?<\/form>/)![0];
    expect(form).toMatch(/method="post"/);
    expect(form).toMatch(/action="\/api\/waitlist"/);
    expect(form).toMatch(/<input id="wl-email" name="email" type="email" required maxlength="254"/);
    for (const role of ['teacher', 'school_leader', 'district', 'other']) expect(form).toContain(`<option value="${role}"`);
    expect(form).toMatch(/name="subjects" type="text" maxlength="200"/);
    expect(form).toMatch(/name="grades" type="text" maxlength="100"/);
    for (const interest of ['class_results', 'editable_worksheets', 'answer_keys', 'quiz_banks', 'all_labs_licence']) expect(form).toContain(`name="interests" value="${interest}"`);
    for (const value of ['yes', 'no', 'not_sure']) expect(form).toContain(`name="school_buys" value="${value}"`);
    const consent = form.match(/<input type="checkbox" name="consent"[^>]*>/)![0];
    expect(consent).toContain('value="yes"');
    expect(consent).not.toMatch(/\schecked/);
    expect(form).toContain('href="/privacy/#waitlist"');
    expect(form).toMatch(/<div class="hp" aria-hidden="true"[^>]*>[\s\S]*name="website" type="text" tabindex="-1" autocomplete="off"/);
    expect(form).toContain('name="site" value="classroomlabs.org"');
    expect(form).toContain('name="source" value="hub"');
    expect(form).toContain('name="return" value="https://classroomlabs.org/teachers/#teacher-plan"');
    expect(form).toContain('class="cf-turnstile" data-sitekey="1x00000000000000000000AA"');
    // One hidden message per result, revealed by the script or by the Worker.
    expect(html.match(/data-waitlist-message="/g)).toHaveLength(9);
    expect(html).not.toMatch(/data-waitlist-message="[^"]+"(?![^>]*hidden)/);
  });

  it('returns to the page it is on', async () => {
    const html = await render('key', '/');
    expect(html).toContain('name="return" value="https://classroomlabs.org/#teacher-plan"');
  });
});
