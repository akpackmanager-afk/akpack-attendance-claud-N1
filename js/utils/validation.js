/**
 * validation.js
 * Numeric-only input enforcement + basic field validation.
 * Membership ID and Contact No must NEVER accept alphabetic characters,
 * and mobile keyboards must present the numeric keypad, not a full keyboard.
 */

/**
 * Wires an <input> so it behaves as a numeric-only field:
 * - inputmode="numeric" + pattern trigger the numeric keypad on mobile/tablet
 * - keystrokes/paste that aren't digits are stripped immediately
 * @param {HTMLInputElement} input
 * @param {{ maxLength?: number }} [opts]
 */
export function enforceNumericInput(input, opts = {}) {
  input.setAttribute('inputmode', 'numeric');
  input.setAttribute('pattern', '[0-9]*');
  input.setAttribute('autocomplete', 'off');
  input.setAttribute('type', 'text'); // "text" + inputmode gives a cleaner numeric pad than type="number"

  const sanitize = () => {
    let digitsOnly = input.value.replace(/[^0-9]/g, '');
    if (opts.maxLength) digitsOnly = digitsOnly.slice(0, opts.maxLength);
    if (digitsOnly !== input.value) input.value = digitsOnly;
  };

  input.addEventListener('input', sanitize);
  input.addEventListener('paste', () => setTimeout(sanitize, 0));
}

export function isDigitsOnly(value) {
  return /^[0-9]+$/.test(String(value || '').trim());
}

export function isValidMembershipId(value) {
  const v = String(value || '').trim();
  return isDigitsOnly(v) && v.length >= 3;
}

export function isValidContactNo(value) {
  const v = String(value || '').trim();
  return isDigitsOnly(v) && v.length >= 7 && v.length <= 15;
}

/**
 * Validate the reception verification form.
 * @returns {{ valid: boolean, errors: { membershipId?: string, contactNo?: string } }}
 */
export function validateVerificationForm({ membershipId, contactNo }) {
  const errors = {};
  if (!membershipId) {
    errors.membershipId = 'Membership ID is required.';
  } else if (!isValidMembershipId(membershipId)) {
    errors.membershipId = 'Membership ID must be numbers only.';
  }

  if (!contactNo) {
    errors.contactNo = 'Contact number is required.';
  } else if (!isValidContactNo(contactNo)) {
    errors.contactNo = 'Enter a valid numeric contact number.';
  }

  return { valid: Object.keys(errors).length === 0, errors };
}
