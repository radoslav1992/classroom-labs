// Site-wide settings. Canonical links, the sitemap, robots.txt and Open Graph tags all use `url`.
// Settings that differ per deployment come from PUBLIC_* environment variables at build time (.env.example):
//   PUBLIC_GA_ID               Google Analytics 4 measurement ID. Empty: no Google tag, no cookies, no banner.
//   PUBLIC_TURNSTILE_SITE_KEY  Turnstile site key for the waitlist form. Empty: the form is not shown.
//   PUBLIC_CONTACT_EMAIL       The address people write to (questions, deleting a signup). Empty: not shown.
export const site = {
  name: 'Classroom Labs',
  url: 'https://classroomlabs.org',
  hostname: 'classroomlabs.org',
  tagline: 'Free interactive labs for science, math, spreadsheets, coding and reading.',
  defaultTitle: 'Classroom Labs: Free Interactive Labs for Every Classroom',
  defaultDescription: 'Free interactive labs for science, math, spreadsheets, coding and reading. No sign-up, made for classrooms, ready for Chromebooks and Google Classroom.',
  /** Same-origin endpoint of the waitlist API (src/api). */
  waitlistEndpoint: '/api/waitlist',
};
