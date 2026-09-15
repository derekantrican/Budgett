import React from 'react';
import { Form } from 'react-bootstrap';

// Formats a raw input string as a dollar amount: rounds to 2 decimal places and
// ensures a leading zero (e.g. ".5" -> "0.50"). Leaves blank/non-numeric values alone.
export function formatAmount(value) {
  if (value === '' || value === null || value === undefined) {
    return value;
  }

  const num = Number(value);
  return Number.isFinite(num) ? num.toFixed(2) : value;
}

// A number input for dollar amounts. Behaves like a plain Form.Control while typing
// (so e.g. ".5" or "12" aren't fought mid-keystroke), but snaps to a properly
// formatted "0.00" (rounded, leading zero) once the field is left.
function CurrencyInput({ value, onChange, onBlur, ...rest }) {
  const handleBlur = (e) => {
    const formatted = formatAmount(e.target.value);
    if (formatted !== e.target.value) {
      onChange({ target: { value: formatted } });
    }

    onBlur?.(e);
  };

  return (
    <Form.Control
      type="number"
      step="0.01"
      {...rest}
      value={value}
      onChange={onChange}
      onBlur={handleBlur}
    />
  );
}

export default CurrencyInput;
