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
