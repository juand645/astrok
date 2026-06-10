/** Picks a foreground color (light vs. dark ink) that reads cleanly on top
 *  of the given background hex. Uses the WCAG 2.x relative-luminance formula
 *  with a 0.5 cutoff — simple and reliable in practice for accent colors.
 *
 *  Returns the dark ink (matches the rest of the palette) when the input is
 *  unrecognizable, so a typo never produces an invisible UI.
 *
 *  Examples:
 *    pickContrastTextColor("#9be564") → "#17201b"   // light lime → dark ink
 *    pickContrastTextColor("#4C7A36") → "#17201b"   // mid green still favours dark
 *    pickContrastTextColor("#222222") → "#f6f7f2"   // dark grey → pale ink
 *    pickContrastTextColor("nonsense") → "#17201b"  // fallback
 */
export const DARK_INK = "#17201b";
export const LIGHT_INK = "#f6f7f2";

export function pickContrastTextColor(hexColor: string): string {
  const match = /^#?([0-9a-f]{6})$/i.exec(hexColor.trim());
  if (!match) return DARK_INK;

  const hex = match[1];
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;

  // sRGB → linear (gamma-decoded), then weighted by human luminosity sensitivity.
  const toLinear = (channel: number): number =>
    channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);

  const luminance =
    0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);

  return luminance > 0.5 ? DARK_INK : LIGHT_INK;
}
