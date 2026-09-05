/** CSS class names for special condition marker styling. */
export const STATUS_MARKER_TYPES = [
  'status-poison',
  'status-burn',
  'status-asleep',
  'status-paralyzed',
  'status-confused',
  'status-default',
];

/** Map editable marker text to a CSS class. */
export function getSpecialConditionClass(text) {
  switch (String(text ?? '').toUpperCase()) {
    case 'P':
      return 'status-poison';
    case 'B':
      return 'status-burn';
    case 'A':
      return 'status-asleep';
    case 'PA':
      return 'status-paralyzed';
    case 'C':
      return 'status-confused';
    default:
      return 'status-default';
  }
}
