// The waitlist form with JavaScript: sends JSON with fetch, shows the result in a live region, keeps what was
// typed on an error, and resets Turnstile so a new token is ready. Also shows the result of a no-JavaScript
// post (?waitlist=<code> on the page URL) when the Worker has not already revealed it.
import { messageKey } from '../lib/waitlist.mjs';
import { track } from './analytics';

type Turnstile = { reset: (widget?: string | HTMLElement) => void; getResponse?: (widget?: string | HTMLElement) => string | undefined };

function show(status: HTMLElement, code: string) {
  const key = messageKey(code);
  for (const message of status.querySelectorAll<HTMLElement>('[data-waitlist-message]')) message.hidden = message.dataset.waitlistMessage !== key;
  status.focus();
}

export function initWaitlist() {
  const form = document.querySelector<HTMLFormElement>('form[data-waitlist-form]');
  const status = document.querySelector<HTMLElement>('[data-waitlist-status]');
  if (!form || !status) return;
  const button = form.querySelector<HTMLButtonElement>('[data-waitlist-submit]');
  const email = form.querySelector<HTMLInputElement>('input[name="email"]');

  // Result of a no-JavaScript post: show it, then drop the parameter so a reload or a shared link is clean.
  const url = new URL(location.href);
  const returned = url.searchParams.get('waitlist');
  if (returned) {
    show(status, returned);
    if (returned === 'ok') form.hidden = true;
    url.searchParams.delete('waitlist');
    history.replaceState(history.state, '', url.pathname + url.search + url.hash);
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const payload = {
      email: String(data.get('email') ?? ''),
      role: String(data.get('role') ?? ''),
      subjects: String(data.get('subjects') ?? ''),
      grades: String(data.get('grades') ?? ''),
      interests: data.getAll('interests').map(String),
      school_buys: String(data.get('school_buys') ?? ''),
      site: String(data.get('site') ?? ''),
      source: String(data.get('source') ?? ''),
      consent: data.get('consent') === 'yes' ? 'yes' : '',
      website: String(data.get('website') ?? ''),
      'cf-turnstile-response': String(data.get('cf-turnstile-response') ?? ''),
    };
    if (button) {
      button.disabled = true;
      button.textContent = 'Sending…';
    }
    form.setAttribute('aria-busy', 'true');
    let code = 'network';
    try {
      const response = await fetch(form.action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      code = result?.ok ? 'ok' : (result?.error ?? 'server_error');
    } catch {
      code = 'network';
    }
    form.removeAttribute('aria-busy');
    if (button) {
      button.disabled = false;
      button.textContent = 'Join the list';
    }
    email?.setAttribute('aria-invalid', String(code === 'invalid_email'));
    if (code === 'ok') {
      // Never the email or anything typed: only the site, the role and where the form was.
      track('waitlist_signup', { site: payload.site, role: payload.role, source: payload.source });
      form.reset();
      form.hidden = true;
    } else {
      (window as unknown as { turnstile?: Turnstile }).turnstile?.reset();
    }
    show(status, code);
  });
}
