// Converts a hex color to HSL and applies it as CSS variables on :root
// so all Tailwind primary-* classes update instantly without a rebuild.

function hexToHsl(hex: string): [number, number, number] {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');

  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }

  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

export function applyBrandColor(hex: string) {
  if (typeof document === 'undefined') return;
  if (!hex || !/^#[0-9A-Fa-f]{6}$/.test(hex)) return;

  try {
    const [h, s] = hexToHsl(hex);
    document.documentElement.style.setProperty('--primary-h', `${h}`);
    document.documentElement.style.setProperty('--primary-s', `${s}%`);
  } catch {
    // silently ignore invalid colors
  }
}

export function applySecondaryColor(hex: string) {
  if (typeof document === 'undefined') return;
  if (!hex || !/^#[0-9A-Fa-f]{6}$/.test(hex)) return;

  try {
    const [h, s] = hexToHsl(hex);
    document.documentElement.style.setProperty('--secondary-h', `${h}`);
    document.documentElement.style.setProperty('--secondary-s', `${s}%`);
  } catch {
    // silently ignore invalid colors
  }
}

// Curated Google Fonts a tenant can pick as their brand font. Keep this in
// sync with ALLOWED_FONTS in apps/api/src/validators/tenant.validator.js.
export const FONT_OPTIONS = [
  'Inter', 'Poppins', 'Roboto', 'Open Sans', 'Lato',
  'Montserrat', 'Nunito', 'Work Sans', 'Plus Jakarta Sans', 'Source Sans 3',
] as const;

export type TenantFont = typeof FONT_OPTIONS[number];

// Loads the Google Font stylesheet on demand and applies it to <body>.
// Inline style (not a CSS class) so it reliably overrides the Inter className
// next/font already puts on <body> in the root layout.
export function applyFontFamily(fontName: string | null | undefined) {
  if (typeof document === 'undefined') return;
  if (!fontName || !FONT_OPTIONS.includes(fontName as TenantFont)) return;

  const linkId = 'tenant-font-link';
  const href = `https://fonts.googleapis.com/css2?family=${fontName.replace(/ /g, '+')}:wght@400;500;600;700;800&display=swap`;

  let link = document.getElementById(linkId) as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement('link');
    link.id = linkId;
    link.rel = 'stylesheet';
    document.head.appendChild(link);
  }
  if (link.href !== href) link.href = href;

  document.body.style.fontFamily = `'${fontName}', ui-sans-serif, system-ui, sans-serif`;
}
