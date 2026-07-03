const MAX_DIGITS = 8;

/**
 * Strips every non-digit character and caps the result at 8 digits, matching Angular's
 * `ngx-mask` `dropSpecialCharacters` behavior for the `cellPhone` control
 * (`create-store-user.component.html:83-84` / `edit-user-details.component.html:22-23`,
 * mask `"0 000-0000"` = 1 + 3 + 4 = 8 digit placeholders). The submitted payload always
 * carries these raw digits, never the formatted display string.
 */
export function toDigits(input: string): string {
  return input.replace(/\D/g, '').slice(0, MAX_DIGITS);
}

/**
 * Renders raw digits as Angular's `+53 0 000-0000` mask, progressively formatting as
 * digits are typed (no template characters are shown ahead of typed input).
 */
export function formatCellPhone(input: string): string {
  const digits = toDigits(input);
  if (digits.length === 0) return '';

  let result = `+53 ${digits[0]}`;
  if (digits.length > 1) {
    result += ` ${digits.slice(1, 4)}`;
  }
  if (digits.length > 4) {
    result += `-${digits.slice(4, 8)}`;
  }
  return result;
}
