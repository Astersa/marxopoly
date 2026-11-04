export const AVATAR_NAMES = ['Gear', 'Factory', 'Wheat', 'Book', 'Anvil', 'Atom', 'Ship', 'Coin'];
export const PLAYER_COLORS = ['#e5483a', '#1fa8a1', '#f2b632', '#8f63d9'];

function gearPath(cx: number, cy: number, rOut: number, rIn: number, teeth: number) {
  const pts: string[] = [];
  for (let i = 0; i < teeth; i++) {
    const a0 = (i / teeth) * Math.PI * 2;
    const step = (Math.PI * 2) / teeth;
    for (const [d, r] of [[0.0, rIn], [0.2, rOut], [0.5, rOut], [0.7, rIn]] as const) {
      const a = a0 + d * step;
      pts.push(`${(cx + Math.cos(a) * r).toFixed(1)},${(cy + Math.sin(a) * r).toFixed(1)}`);
    }
  }
  return `M${pts.join('L')}Z`;
}

const GLYPHS: ((fg: string) => string)[] = [
  fg => `<path d="${gearPath(32, 32, 20, 15, 8)}" fill="${fg}"/><circle cx="32" cy="32" r="7" fill="none" stroke="currentBg" stroke-width="4"/>`,
  fg => `<path d="M14 46V28l10 6v-6l10 6v-6l10 6V16h6v30z" fill="${fg}"/><rect x="40" y="10" width="5" height="12" fill="${fg}"/><rect x="20" y="38" width="5" height="5" fill="currentBg"/><rect x="30" y="38" width="5" height="5" fill="currentBg"/>`,
  fg => `<path d="M32 50V18" stroke="${fg}" stroke-width="3" fill="none"/>${[0, 1, 2, 3].map(i => `<ellipse cx="${26}" cy="${24 + i * 7}" rx="3" ry="5.5" transform="rotate(-30 26 ${24 + i * 7})" fill="${fg}"/><ellipse cx="${38}" cy="${24 + i * 7}" rx="3" ry="5.5" transform="rotate(30 38 ${24 + i * 7})" fill="${fg}"/>`).join('')}<ellipse cx="32" cy="15" rx="3" ry="6" fill="${fg}"/>`,
  fg => `<path d="M14 18h16c2 0 2 2 2 2v26c0-2-2-3-4-3H14zM50 18H34c-2 0-2 2-2 2v26c0-2 2-3 4-3h14z" fill="${fg}"/>`,
  fg => `<path d="M12 22h34c0 6-4 8-10 8h-2l2 6h6v6H20v-6h6l2-6h-2c-8 0-14-2-14-8z" fill="${fg}"/><path d="M46 22h8c0 4-3 6-8 6z" fill="${fg}"/>`,
  fg => `<g fill="none" stroke="${fg}" stroke-width="3"><ellipse cx="32" cy="32" rx="21" ry="8"/><ellipse cx="32" cy="32" rx="21" ry="8" transform="rotate(60 32 32)"/><ellipse cx="32" cy="32" rx="21" ry="8" transform="rotate(120 32 32)"/></g><circle cx="32" cy="32" r="4.5" fill="${fg}"/>`,
  fg => `<path d="M10 36h44l-8 12H18z" fill="${fg}"/><rect x="20" y="26" width="22" height="10" fill="${fg}"/><rect x="26" y="16" width="6" height="10" fill="${fg}"/><rect x="36" y="20" width="4" height="6" fill="${fg}"/>`,
  fg => `<circle cx="32" cy="32" r="20" fill="${fg}"/><circle cx="32" cy="32" r="14" fill="none" stroke="currentBg" stroke-width="3"/><path d="M32 22v20M27 27h8a3 3 0 010 6h-6a3 3 0 000 6h8" fill="none" stroke="currentBg" stroke-width="3"/>`,
];

/** Full standalone SVG (used by Phaser) */
export function avatarSvg(idx: number, fg = '#efe3c6', bg = '#16130f', ring = ''): string {
  const g = GLYPHS[((idx % 8) + 8) % 8](fg).replaceAll('currentBg', bg);
  const r = ring ? `<circle cx="32" cy="32" r="30" fill="${bg}" stroke="${ring}" stroke-width="4"/>` : `<circle cx="32" cy="32" r="31" fill="${bg}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">${r}<g transform="translate(32 32) scale(0.78) translate(-32 -32)">${g}</g></svg>`;
}

export function Avatar({ idx, size = 40, color }: { idx: number; size?: number; color?: string }) {
  const svg = avatarSvg(idx, '#efe3c6', '#2a241b', color);
  return <span className="inline-block shrink-0" style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: svg.replace('width="64" height="64"', `width="${size}" height="${size}"`) }} />;
}

export const svgDataUri = (svg: string) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
