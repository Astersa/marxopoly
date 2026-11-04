/// <reference types="vite/client" />
declare module '@fontsource/*';

// Phaser 4 typings ask for Vector2 instances, but plain {x, y} points work at runtime.
declare namespace Phaser.GameObjects {
  interface Graphics {
    fillPoints(points: { x: number; y: number }[], closeShape?: boolean, closePath?: boolean, endIndex?: number): this;
    strokePoints(points: { x: number; y: number }[], closeShape?: boolean, closePath?: boolean, endIndex?: number): this;
  }
}
