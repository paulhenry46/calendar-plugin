export const card = {
  border: '1px solid var(--color-border, #e2e8f0)',
  borderRadius: '8px',
  padding: '12px',
  background: 'var(--color-background, #fff)',
  color: 'var(--color-foreground, #0f172a)',
};
export const btn = {
  font: 'inherit',
  padding: '6px 12px',
  borderRadius: '6px',
  border: '0px solid var(--color-input, #cbd5e1)',
  color: 'var(--color-foreground, #0f172a)',
  cursor: 'pointer',
};

export function fmtDate(iso: string | number | Date | null) {
  try { return iso ? new Date(iso).toLocaleDateString() : 'Never'; } catch { return iso; }
}
export function isExpired(iso: string | number | Date | null) {
  if(!iso) return false;
  try { return iso ? new Date(iso).getTime() < Date.now() : false; } catch { return false; }
}

export const selectStyle = {
  height: '2.25rem',
  padding: '0 2.25rem 0 0.75rem', 
  borderRadius: '0.375rem', 
  border: '1px solid var(--color-border, #e2e8f0)', 
  backgroundColor: 'var(--color-background, #ffffff)', 
  outline: 'none', 
  marginBottom: '8px',
  appearance: 'none' as const,
  WebkitAppearance: 'none' as const,
  MozAppearance: 'none' as const,
  backgroundImage: `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="var(--color-muted-foreground, %2364748b)"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>')`,
  backgroundRepeat: 'no-repeat',
  backgroundSize: '1rem',
  backgroundPosition: 'right 12px center',
};