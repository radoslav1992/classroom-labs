// CSV for the signup export: UTF-8 with a byte order mark so Excel reads the accents right.
import type { SignupRow } from './store';

const COLUMNS = ['email', 'role', 'subjects', 'grades', 'interests', 'school_buys', 'site', 'source', 'consent_at', 'created_at', 'updated_at'] as const;

/**
 * One CSV field. Quotes fields with commas, quotes or line breaks, and prefixes a ' to text a spreadsheet
 * would run as a formula (starting with =, +, -, @, a tab or a carriage return).
 */
export function csvField(value: string | null | undefined): string {
  let text = value ?? '';
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function interests(json: string): string {
  try {
    const list = JSON.parse(json);
    return Array.isArray(list) ? list.join('; ') : '';
  } catch {
    return '';
  }
}

export function signupsCsv(rows: SignupRow[]): string {
  const lines = [COLUMNS.join(',')];
  for (const row of rows) {
    const record: Record<(typeof COLUMNS)[number], string | null> = { ...row, interests: interests(row.interests_json) };
    lines.push(COLUMNS.map(column => csvField(record[column])).join(','));
  }
  return '﻿' + lines.join('\r\n') + '\r\n';
}
