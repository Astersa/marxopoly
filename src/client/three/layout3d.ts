/** Pure helpers for the 3D board. No three.js import here, so they are unit-testable in node. */
import type { GroupId } from '../../shared/types';

export const TILE = 2.5;
export const GRID = 11;
/** world half-extent of the playable ring */
export const HALF = (GRID * TILE) / 2;

export interface Vec2 { x: number; z: number }

/** grid cell of a space: GO at (0,0) top-left, clockwise, row 0 is the far edge for the default camera */
export function gridCell(id: number): { col: number; row: number } {
  if (id <= 10) return { col: id, row: 0 };
  if (id <= 20) return { col: 10, row: id - 10 };
  if (id <= 30) return { col: 10 - (id - 20), row: 10 };
  return { col: 0, row: 10 - (id - 30) };
}

export function tileCenter(id: number): Vec2 {
  const { col, row } = gridCell(id);
  return { x: (col - 5) * TILE, z: (row - 5) * TILE };
}

/** side of the board a space is on; used for the colour band and for facing outwards */
export function tileSide(id: number): 'top' | 'right' | 'bottom' | 'left' | 'corner' {
  if (id % 10 === 0) return 'corner';
  if (id < 10) return 'top';
  if (id < 20) return 'right';
  if (id < 30) return 'bottom';
  return 'left';
}

/** unit vector pointing from the board centre outwards for a side */
export function outward(id: number): Vec2 {
  const s = tileSide(id);
  if (s === 'top') return { x: 0, z: -1 };
  if (s === 'bottom') return { x: 0, z: 1 };
  if (s === 'left') return { x: -1, z: 0 };
  if (s === 'right') return { x: 1, z: 0 };
  const c = tileCenter(id);
  const l = Math.hypot(c.x, c.z) || 1;
  return { x: c.x / l, z: c.z / l };
}

/** Spaces visited when moving `steps` forward from `from` (excludes the start). Negative steps walk backwards. */
export function walkPath(from: number, steps: number): number[] {
  const out: number[] = [];
  const dir = steps >= 0 ? 1 : -1;
  for (let i = 1; i <= Math.abs(steps); i++) out.push(((from + dir * i) % 40 + 40) % 40);
  return out;
}

/** does a forward walk pass over (or land on) GO? */
export const passesGo = (from: number, steps: number) => steps > 0 && from + steps >= 40;

/** Slots so several characters on one tile do not overlap. order 0..3 */
export function slotOffset(order: number, side: ReturnType<typeof tileSide>): Vec2 {
  const dx = order % 2 === 0 ? -0.55 : 0.55;
  const dz = order < 2 ? -0.35 : 0.45;
  void side;
  return { x: dx, z: dz };
}

// ---------- buildings ----------
export type StageKind = 'shed' | 'small' | 'medium' | 'large' | 'complex' | 'campus';
export interface LevelPlan { kind: StageKind; main: number; extras: number; star: boolean }

/** property level 0..5 -> what to build; main is the scale of the group's main model */
export function levelPlan(level: number): LevelPlan {
  const l = Math.max(0, Math.min(5, Math.floor(level)));
  return [
    { kind: 'shed', main: 0.38, extras: 0, star: false },
    { kind: 'small', main: 0.55, extras: 1, star: false },
    { kind: 'medium', main: 0.7, extras: 2, star: false },
    { kind: 'large', main: 0.85, extras: 3, star: false },
    { kind: 'complex', main: 1.0, extras: 4, star: false },
    { kind: 'campus', main: 1.25, extras: 5, star: true },
  ][l] as LevelPlan;
}

export interface GroupStyle { main: string; second: string; extra: string[] }
/** model names inside city.glb / industry.glb per group */
export const GROUP_STYLE: Record<GroupId, GroupStyle> = {
  G1: { main: 'building_A_withoutBase', second: 'box_A', extra: ['box_B', 'box_A', 'bench'] },
  G2: { main: 'building_B_withoutBase', second: 'containers_A', extra: ['cargo_A', 'cargo_B', 'box_B'] },
  G3: { main: 'structure_low', second: 'drill_structure', extra: ['watertower', 'containers_B', 'structure_tall'] },
  G4: { main: 'building_D_withoutBase', second: 'building_E_withoutBase', extra: ['car_sedan', 'streetlight', 'trafficlight_A'] },
  G5: { main: 'building_F_withoutBase', second: 'building_G_withoutBase', extra: ['car_taxi', 'streetlight', 'dumpster'] },
  G6: { main: 'basemodule_B', second: 'structure_tall', extra: ['basemodule_C', 'lights', 'cargodepot_A'] },
  G7: { main: 'building_C_withoutBase', second: 'windturbine_low', extra: ['bush', 'solarpanel', 'bush'] },
  G8: { main: 'building_H_withoutBase', second: 'solarpanel', extra: ['windturbine_tall', 'roofmodule_solarpanels', 'lights'] },
};

// ---------- dice ----------
/** Orientation (euler x,y,z in radians) that puts `face` (1..6) on top. Faces: +y=1, -y=6, +x=2, -x=5, +z=3, -z=4. */
export function diceEuler(face: number): [number, number, number] {
  const h = Math.PI / 2;
  switch (face) {
    case 1: return [0, 0, 0];
    case 6: return [Math.PI, 0, 0];
    case 2: return [0, 0, h]; // +x rotated up
    case 5: return [0, 0, -h];
    case 3: return [-h, 0, 0]; // +z rotated up
    case 4: return [h, 0, 0];
    default: return [0, 0, 0];
  }
}
/** which face index (0..5 in BoxGeometry material order +x,-x,+y,-y,+z,-z) shows which number */
export const DIE_FACE_NUMBERS = [2, 5, 1, 6, 3, 4];

// ---------- animation clip mapping ----------
export type Moment = 'idle' | 'walk' | 'run' | 'celebrate' | 'sad' | 'fall' | 'jail' | 'hop';
const CLIP_PREFS: Record<Moment, string[]> = {
  idle: ['Idle', 'Unarmed_Idle', 'Sit_Floor_Idle'],
  walk: ['Walking_A', 'Walking_B', 'Running_A', 'Idle'],
  run: ['Running_A', 'Running_B', 'Walking_A', 'Idle'],
  celebrate: ['Cheer', 'Jump_Full_Short', 'Interact', 'Idle'],
  sad: ['Hit_A', 'Hit_B', 'Death_A', 'Idle'],
  fall: ['Death_A', 'Death_B', 'Hit_A', 'Idle'],
  jail: ['Sit_Floor_Idle', 'Hit_A', 'Idle'],
  hop: ['Jump_Full_Short', 'Cheer', 'Idle'],
};
/** first available clip for a moment, or null (the caller then animates by code) */
export function pickClip(moment: Moment, available: Iterable<string>): string | null {
  const set = new Set(available);
  for (const c of CLIP_PREFS[moment]) if (set.has(c)) return c;
  return null;
}

/** Duration plan: total walking time for a move must stay inside the queue budget. */
export function stepDuration(steps: number, fast: boolean): number {
  const budget = fast ? 1300 : 3600; // ms; the store races play() against 1500/4500
  const per = Math.min(fast ? 110 : 260, budget / Math.max(1, steps));
  return Math.max(30, per);
}

/** Building footprint (world units, tile is TILE wide) and height cap per level, so nothing spills over its tile. */
export const LEVEL_FOOTPRINT = [0.8, 0.95, 1.1, 1.2, 1.3, 1.4];
export const LEVEL_MAX_HEIGHT = [0.9, 1.2, 1.5, 1.8, 2.1, 2.5];
export const levelFootprint = (level: number) => LEVEL_FOOTPRINT[Math.max(0, Math.min(5, Math.floor(level)))];
export const levelMaxHeight = (level: number) => LEVEL_MAX_HEIGHT[Math.max(0, Math.min(5, Math.floor(level)))];

/** Text on an owner's name tag: upper case, at most 8 characters (by code point, so Vietnamese letters stay whole). */
export function ownerBadgeText(name: string): string {
  const chars = Array.from(name.trim().toUpperCase());
  return chars.length > 8 ? chars.slice(0, 7).join('') + '…' : chars.join('');
}

/** Dark or light text, whichever is readable on a #rrggbb background. */
export function readableInk(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const luminance = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return luminance > 0.55 ? '#16130f' : '#ffffff';
}

/** Zones inside a tile in the viewer's frame (z grows towards the viewer): buildings at the back, walking lane in the middle, name plaque in front. */
export const ZONE = { buildingZ: -0.55, laneZ: 0.15, plaqueZ: 0.69, plaqueW: 2.42, plaqueD: 1.1 };

/** rotate a tile-local offset (viewer frame) into world space for a camera yaw */
export function localToWorld(local: Vec2, yaw: number): Vec2 {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return { x: local.x * c + local.z * s, z: -local.x * s + local.z * c };
}
