export function inr(n: number): string {
  const value = Number(n);
  return '₹' + (Number.isFinite(value) ? value : 0).toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 0 });
}
