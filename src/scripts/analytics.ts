// GA4 events. A no-op unless a Google tag (or the consent defaults' gtag stub) exists.
// Never send an email address or anything a person types: only the lab, the role, the site and the source.
type Params = Record<string, string | number | boolean>;

export function track(name: string, params: Params = {}) {
  const gtag = (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag;
  if (typeof gtag === 'function') gtag('event', name, params);
}

/** lab_click { lab }: any link marked data-lab="<lab id>" (lab cards, tool links, the footer). */
export function trackLabClicks() {
  document.addEventListener('click', event => {
    const link = (event.target as Element | null)?.closest?.('a[data-lab]');
    if (link) track('lab_click', { lab: link.getAttribute('data-lab') ?? '' });
  });
}
