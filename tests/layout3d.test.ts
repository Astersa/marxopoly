import { describe, expect, it } from 'vitest';
import { GROUP_SPACES, SPACES } from '../src/shared/board';
import { DIE_FACE_NUMBERS, GROUP_STYLE, diceEuler, gridCell, levelPlan, outward, passesGo, pickClip, slotOffset, stepDuration, tileCenter, tileSide, walkPath } from '../src/client/three/layout3d';

describe('3D layout', () => {
  it('has exactly 40 unique tile positions on the outer ring', () => {
    const pos = Array.from({ length: 40 }, (_, i) => tileCenter(i));
    expect(new Set(pos.map(p => `${p.x},${p.z}`)).size).toBe(40);
    for (let i = 0; i < 40; i++) { const g = gridCell(i); expect(g.col === 0 || g.col === 10 || g.row === 0 || g.row === 10).toBe(true); }
  });
  it('GO is top-left and the order is clockwise', () => {
    const go = tileCenter(0);
    expect(go.x).toBeLessThan(0); expect(go.z).toBeLessThan(0);
    expect(tileCenter(10).x).toBeGreaterThan(0); expect(tileCenter(10).z).toBeLessThan(0);
    expect(tileCenter(20).x).toBeGreaterThan(0); expect(tileCenter(20).z).toBeGreaterThan(0);
    expect(tileCenter(30).x).toBeLessThan(0); expect(tileCenter(30).z).toBeGreaterThan(0);
    // seen from above with +z towards the viewer, clockwise means angle (atan2(z, x)) increases monotonically with the id
    let prev = Math.atan2(tileCenter(0).z, tileCenter(0).x);
    let turned = 0;
    for (let i = 1; i <= 40; i++) {
      const c = tileCenter(i % 40);
      const a = Math.atan2(c.z, c.x);
      let d = a - prev;
      while (d < -Math.PI) d += 2 * Math.PI;
      while (d > Math.PI) d -= 2 * Math.PI;
      expect(d).toBeGreaterThan(0);
      turned += d; prev = a;
    }
    expect(turned).toBeCloseTo(2 * Math.PI, 5);
  });
  it('neighbouring spaces are one tile apart and corners are at the corners', () => {
    for (let i = 0; i < 40; i++) {
      const a = tileCenter(i), b = tileCenter((i + 1) % 40);
      expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeCloseTo(2.5, 5);
    }
    for (const c of [0, 10, 20, 30]) expect(tileSide(c)).toBe('corner');
    expect(outward(5)).toEqual({ x: 0, z: -1 });
    expect(outward(25)).toEqual({ x: 0, z: 1 });
  });
  it('paths walk space by space and wrap through GO', () => {
    expect(walkPath(3, 4)).toEqual([4, 5, 6, 7]);
    expect(walkPath(38, 5)).toEqual([39, 0, 1, 2, 3]);
    expect(walkPath(2, -3)).toEqual([1, 0, 39]);
    expect(passesGo(38, 5)).toBe(true);
    expect(passesGo(3, 4)).toBe(false);
    expect(passesGo(36, 4)).toBe(true);
    expect(passesGo(5, -3)).toBe(false);
  });
  it('characters sharing a tile get four distinct slots', () => {
    const s = [0, 1, 2, 3].map(o => slotOffset(o, 'top'));
    expect(new Set(s.map(v => `${v.x},${v.z}`)).size).toBe(4);
  });
  it('maps level to a growing building plan and every group has a style', () => {
    let prev = 0;
    for (let l = 0; l <= 5; l++) { const p = levelPlan(l); expect(p.main).toBeGreaterThan(prev); prev = p.main; expect(p.star).toBe(l === 5); }
    expect(levelPlan(0).kind).toBe('shed');
    expect(levelPlan(5).kind).toBe('campus');
    expect(levelPlan(99)).toEqual(levelPlan(5));
    expect(levelPlan(-2)).toEqual(levelPlan(0));
    expect(Object.keys(GROUP_STYLE)).toHaveLength(8);
    for (const g of Object.keys(GROUP_SPACES)) expect(GROUP_STYLE[g as keyof typeof GROUP_STYLE].extra.length).toBeGreaterThanOrEqual(3);
    expect(SPACES.length).toBe(40);
  });
  it('dice faces map to distinct orientations that put the right face up', () => {
    expect(new Set(DIE_FACE_NUMBERS).size).toBe(6);
    const e = [1, 2, 3, 4, 5, 6].map(f => diceEuler(f).map(v => v.toFixed(4)).join(','));
    expect(new Set(e).size).toBe(6);
    // rotate the face normal that carries `face` with the euler (XYZ order) and check it points to +y
    const normals: Record<number, [number, number, number]> = { 2: [1, 0, 0], 5: [-1, 0, 0], 1: [0, 1, 0], 6: [0, -1, 0], 3: [0, 0, 1], 4: [0, 0, -1] };
    for (let f = 1; f <= 6; f++) {
      const [ex, ey, ez] = diceEuler(f);
      let [x, y, z] = normals[f];
      // three.js Euler 'XYZ': matrix = Rx * Ry * Rz, so apply Rz first, then Ry, then Rx
      [x, y] = [x * Math.cos(ez) - y * Math.sin(ez), x * Math.sin(ez) + y * Math.cos(ez)];
      [x, z] = [x * Math.cos(ey) + z * Math.sin(ey), -x * Math.sin(ey) + z * Math.cos(ey)];
      [y, z] = [y * Math.cos(ex) - z * Math.sin(ex), y * Math.sin(ex) + z * Math.cos(ex)];
      expect(y, `face ${f}`).toBeCloseTo(1, 5);
    }
  });
  it('picks animation clips with fallbacks and never crashes without clips', () => {
    const kay = ['Idle', 'Walking_A', 'Running_A', 'Cheer', 'Hit_A', 'Death_A', 'Jump_Full_Short', 'Interact'];
    expect(pickClip('idle', kay)).toBe('Idle');
    expect(pickClip('walk', kay)).toBe('Walking_A');
    expect(pickClip('celebrate', kay)).toBe('Cheer');
    expect(pickClip('celebrate', ['Jump_Full_Short', 'Idle'])).toBe('Jump_Full_Short');
    expect(pickClip('celebrate', ['Idle'])).toBe('Idle');
    expect(pickClip('sad', ['Death_A'])).toBe('Death_A');
    expect(pickClip('walk', [])).toBeNull();
    expect(pickClip('fall', ['Foo'])).toBeNull();
  });
  it('keeps the walking time of a move inside the queue budget', () => {
    for (const steps of [1, 2, 6, 12, 24, 39]) {
      expect(stepDuration(steps, false) * steps).toBeLessThanOrEqual(4500 - 600 + 1);
      expect(stepDuration(steps, true) * steps).toBeLessThanOrEqual(1500 + 1);
    }
  });
});

import { LEVEL_FOOTPRINT, LEVEL_MAX_HEIGHT, ZONE, TILE, levelFootprint, levelMaxHeight, localToWorld } from '../src/client/three/layout3d';
describe('3D tile zones', () => {
  it('buildings fit inside their tile and grow with the level, with a capped height', () => {
    for (let l = 1; l < 6; l++) { expect(LEVEL_FOOTPRINT[l]).toBeGreaterThan(LEVEL_FOOTPRINT[l - 1]); expect(LEVEL_MAX_HEIGHT[l]).toBeGreaterThan(LEVEL_MAX_HEIGHT[l - 1]); }
    expect(Math.max(...LEVEL_FOOTPRINT)).toBeLessThanOrEqual(TILE * 0.6);
    expect(Math.max(...LEVEL_MAX_HEIGHT)).toBeLessThanOrEqual(2.5);
    expect(levelFootprint(99)).toBe(LEVEL_FOOTPRINT[5]);
    expect(levelMaxHeight(-1)).toBe(LEVEL_MAX_HEIGHT[0]);
  });
  it('plaque, lane and building zones do not overlap inside the tile', () => {
    const half = TILE / 2;
    expect(ZONE.plaqueZ + ZONE.plaqueD / 2).toBeLessThanOrEqual(half);
    expect(ZONE.plaqueW).toBeLessThanOrEqual(TILE);
    expect(ZONE.buildingZ + levelFootprint(5) / 2).toBeLessThan(ZONE.laneZ + 0.5);
    expect(ZONE.laneZ).toBeLessThan(ZONE.plaqueZ - ZONE.plaqueD / 2 + 0.3);
    expect(ZONE.buildingZ - levelFootprint(5) / 2).toBeGreaterThanOrEqual(-half - 0.01);
  });
  it('rotates local offsets with the camera yaw', () => {
    const a = localToWorld({ x: 0, z: 1 }, 0); expect(a.x).toBeCloseTo(0); expect(a.z).toBeCloseTo(1);
    const b = localToWorld({ x: 0, z: 1 }, Math.PI / 2); expect(b.x).toBeCloseTo(1); expect(b.z).toBeCloseTo(0);
  });
});
