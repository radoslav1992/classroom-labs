/** JSON for a <script type="application/ld+json"> block: "<" is escaped so text can never close the tag. */
export function jsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}
