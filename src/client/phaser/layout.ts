export const CANVAS = 1320;
export const CORNER = 170;
export const CELL = (CANVAS - 2 * CORNER) / 9;

export interface TileRect { x: number; y: number; w: number; h: number; side: 'top' | 'right' | 'bottom' | 'left' | 'corner' }

export function tileRect(id: number): TileRect {
  if (id === 0) return { x: 0, y: 0, w: CORNER, h: CORNER, side: 'corner' };
  if (id === 10) return { x: CANVAS - CORNER, y: 0, w: CORNER, h: CORNER, side: 'corner' };
  if (id === 20) return { x: CANVAS - CORNER, y: CANVAS - CORNER, w: CORNER, h: CORNER, side: 'corner' };
  if (id === 30) return { x: 0, y: CANVAS - CORNER, w: CORNER, h: CORNER, side: 'corner' };
  if (id < 10) return { x: CORNER + (id - 1) * CELL, y: 0, w: CELL, h: CORNER, side: 'top' };
  if (id < 20) return { x: CANVAS - CORNER, y: CORNER + (id - 11) * CELL, w: CORNER, h: CELL, side: 'right' };
  if (id < 30) return { x: CANVAS - CORNER - (id - 20) * CELL, y: CANVAS - CORNER, w: CELL, h: CORNER, side: 'bottom' };
  return { x: 0, y: CANVAS - CORNER - (id - 30) * CELL, w: CORNER, h: CELL, side: 'left' };
}

export const center = (id: number) => { const r = tileRect(id); return { x: r.x + r.w / 2, y: r.y + r.h / 2 }; };
