// What the waitlist form says for each result code of the API (docs/waitlist-contract.md), plus "network"
// for a fetch that never reached it. Used by the form, its script, and the Worker for no-JavaScript posts.
export const MESSAGES = {
  ok: 'Thank you, you’re on the list. We’ll email you when there is news about the teacher plan.',
  invalid_email: 'Please check your email address and try again.',
  invalid_field: 'Some answers were not in the expected form. Please check the form and try again.',
  consent_required: 'Please tick the box to agree that we may store your answers and email you.',
  turnstile_failed: 'The spam check did not go through. Please try again. The check needs JavaScript turned on.',
  bad_origin: 'This form can only be sent from a Classroom Labs site. Please reload the page and try again.',
  rate_limited: 'Too many sign-ups from your network just now. Please wait ten minutes and try again.',
  server_error: 'Something went wrong on our side. Please try again later.',
  network: 'We could not reach the server. Please check your connection and try again.',
};

/** The message key for a result code: unknown codes get the generic server message. */
export function messageKey(code) {
  return typeof code === 'string' && Object.hasOwn(MESSAGES, code) ? code : 'server_error';
}
