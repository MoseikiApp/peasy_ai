export function formatCurrency(value: number | bigint | null | undefined, currency = 'USD') {
  if (value === null || value === undefined) return '$0.00';

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(value));
} 