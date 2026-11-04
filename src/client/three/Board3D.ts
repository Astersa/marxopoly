import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { GROUPS, SPACES } from '../../shared/board';
import { localizedSpace, t as tr, type Lang } from '../../shared/i18n';
import type { GameEvent, PublicGameState } from '../../shared/types';
import { PLAYER_COLORS } from '../avatars';
import type { BoardApi } from '../boardRef';
import {
  DIE_FACE_NUMBERS, GROUP_STYLE, HALF, TILE, ZONE, diceEuler, levelFootprint, levelMaxHeight, levelPlan, localToWorld, outward, ownerBadgeText, pickClip, readableInk, stepDuration, tileCenter, tileSide, walkPath, type Moment,
} from './layout3d';

export type Quality = 'high' | 'low';
export interface Board3DOptions { quality: Quality; lang: Lang; onProgress?: (fraction: number) => void }

const BASE = (import.meta.env?.BASE_URL ?? '/') as string;
const CHAR_FILES = ['Knight', 'Barbarian', 'Mage', 'Rogue_Hooded'];
export const CHAR_HEIGHT = 3.3;
const TILE_Y = 0.22;
const COLORS = { coal: 0x16130f, coal2: 0x201b15, coal3: 0x2c261d, paper: 0xefe3c6, ink: 0x1d1a14, red: 0xd63a1f, brass: 0xc9962b };
const SLOT_LOCAL = [{ x: -0.5, z: 0.1 }, { x: 0.5, z: 0.1 }, { x: -0.5, z: 0.4 }, { x: 0.5, z: 0.4 }];

type Tween = { t: number; dur: number; fn: (k: number) => void; done?: () => void };
const easeInOut = (k: number) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
const easeOutBack = (k: number) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); };

interface Proto { obj: THREE.Object3D; h: number }
interface Char {
  id: string; root: THREE.Group; model: THREE.Object3D; mixer: THREE.AnimationMixer; actions: Map<string, THREE.AnimationAction>;
  clipNames: string[]; current: string | null; tile: number; order: number; color: number; bankrupt: boolean; busy: boolean; marker: THREE.Mesh;
}
interface Stage { group: THREE.Group; level: number; mortgaged: boolean; owner: string | null; saved: Map<THREE.Mesh, THREE.Material | THREE.Material[]>; spin: THREE.Object3D[]; sign: THREE.Sprite | null; top: number }

export class Board3D implements BoardApi {
  private parent: HTMLElement;
  private opts: Board3DOptions;
  private lang: Lang;
  private renderer!: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(26, 1, 0.5, 220);
  private tweens: Tween[] = [];
  private raf = 0;
  private destroyed = false;
  private disposables: { dispose(): void }[] = [];
  private protos = new Map<string, Proto>();
  private charProtos: { scene: THREE.Object3D; clips: THREE.AnimationClip[] }[] = [];
  private state: PublicGameState | null = null;
  private busy = 0;
  private selected: number | null = null;
  private clickCb: ((id: number) => void) | null = null;
  private hits: THREE.Mesh[] = [];
  private rotors: THREE.Group[] = [];
  private labels: { mesh: THREE.Mesh; id: number }[] = [];
  private stages: Stage[] = [];
  private markers: THREE.Group[] = [];
  private badges: (THREE.Sprite | null)[] = [];
  private badgeMats = new Map<string, THREE.SpriteMaterial>();
  private synced = false;
  private chars = new Map<string, Char>();
  private diceGroup = new THREE.Group();
  private dice: THREE.Mesh[] = [];
  private centerMesh!: THREE.Mesh;
  private centerGroup = new THREE.Group();
  private selFrame!: THREE.Mesh;
  private smoke: { s: THREE.Sprite; v: number; life: number; max: number }[] = [];
  private smokeSources: THREE.Vector3[] = [];
  private tooltip: HTMLDivElement;
  private yawTarget = 0; private yaw = 0; private yawDrag = 0; private pitch = 1.0; private dist = 30; private lookZ = 0;
  private focus = new THREE.Vector3(); private focusTarget = new THREE.Vector3();
  private follow: THREE.Vector3 | null = null;
  private dragging: { x: number; y: number; moved: boolean; yaw0: number; pitch0: number } | null = null;
  private lastFrame = 0;
  private frames = 0; private fpsAt = 0; private fps = 0;
  private onLost: (() => void) | null = null;
  private ro: ResizeObserver;
  private cleanups: (() => void)[] = [];
  private mortMats = new Map<string, THREE.MeshStandardMaterial>();
  private signTex!: THREE.CanvasTexture;
  private diceScale = 1;
  private charScale = 1;
  private logoSize = { w: 11, h: 4.6 };

  private constructor(parent: HTMLElement, opts: Board3DOptions) {
    this.parent = parent; this.opts = opts; this.lang = opts.lang;
    this.tooltip = document.createElement('div');
    this.tooltip.setAttribute('data-testid', 'tile-tooltip');
    Object.assign(this.tooltip.style, { position: 'absolute', pointerEvents: 'none', display: 'none', background: '#efe3c6', color: '#1d1a14', border: '2px solid #1d1a14', padding: '2px 8px', font: '700 14px "Barlow Condensed", sans-serif', textTransform: 'uppercase', letterSpacing: '0.06em', zIndex: '5', whiteSpace: 'nowrap', boxShadow: '3px 3px 0 #d63a1f' });
    this.ro = new ResizeObserver(() => this.resize());
  }

  /** Create the board. Throws if WebGL or assets are not available so the caller can fall back to the 2D board. */
  static async create(parent: HTMLElement, opts: Board3DOptions): Promise<Board3D> {
    try {
      await Promise.all([
        document.fonts.load('700 28px "Barlow Condensed"', 'Ệ ầ ơ ư AB'),
        document.fonts.load('400 28px "Anton"', 'Ệ ầ ơ ư AB'),
      ]);
    } catch { /* best effort */ }
    const b = new Board3D(parent, opts);
    try { await b.init(); } catch (e) { b.destroy(); throw e; }
    return b;
  }

  // ------------------------------------------------------------------ init
  private async init() {
    const low = this.opts.quality === 'low';
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (!gl) throw new Error('WebGL is not available');
    this.renderer = new THREE.WebGLRenderer({ canvas, context: gl as WebGL2RenderingContext, antialias: !low, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, low ? 1.25 : 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.3;
    this.renderer.shadowMap.enabled = !low;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:pan-y;outline:none';
    canvas.setAttribute('data-testid', 'board3d-canvas');
    this.parent.style.position = this.parent.style.position || 'relative';
    this.parent.appendChild(canvas);
    this.parent.appendChild(this.tooltip);
    const lost = (e: Event) => { e.preventDefault(); this.onLost?.(); };
    canvas.addEventListener('webglcontextlost', lost);
    this.cleanups.push(() => canvas.removeEventListener('webglcontextlost', lost));

    await this.loadAssets();
    this.buildScene();
    this.bindInput(canvas);
    this.ro.observe(this.parent);
    this.resize();
    this.lastFrame = performance.now();
    (window as unknown as { __board3d?: Board3D }).__board3d = this; // debug / test hook
    this.raf = requestAnimationFrame(t => this.loop(t));
  }

  onContextLost(cb: () => void) { this.onLost = cb; }

  /** Download all model files, reporting real progress in bytes. */
  private async loadAssets() {
    const files = ['city.glb', 'industry.glb', ...CHAR_FILES.map(c => `characters/${c}.glb`)];
    // approximate sizes so the bar is meaningful before the response headers arrive; replaced by the real Content-Length
    const EXPECTED: Record<string, number> = { 'city.glb': 919744, 'industry.glb': 471216, 'characters/Barbarian.glb': 2312164, 'characters/Knight.glb': 2326552, 'characters/Mage.glb': 2303716, 'characters/Rogue_Hooded.glb': 2286976 };
    const sizes = new Map<string, number>(files.map(f => [f, EXPECTED[f] ?? 1_000_000]));
    const got = new Map<string, number>();
    const report = () => {
      let total = 0, loaded = 0;
      for (const f of files) { total += sizes.get(f) ?? 0; loaded += got.get(f) ?? 0; }
      this.opts.onProgress?.(total > 0 ? Math.min(1, loaded / total) : 0);
    };
    const fetchBuf = async (f: string): Promise<ArrayBuffer> => {
      const res = await fetch(`${BASE}models/${f}`);
      if (!res.ok || !res.body) throw new Error(`model ${f}: HTTP ${res.status}`);
      sizes.set(f, Number(res.headers.get('content-length')) || 1_000_000);
      report();
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let n = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value); n += value.length;
        got.set(f, n); report();
      }
      sizes.set(f, n); got.set(f, n); report();
      const out = new Uint8Array(n);
      let o = 0; for (const c of chunks) { out.set(c, o); o += c.length; }
      return out.buffer;
    };
    const bufs = await Promise.all(files.map(fetchBuf));
    const loader = new GLTFLoader();
    const parsed: GLTF[] = await Promise.all(bufs.map(b => loader.parseAsync(b, '')));
    const [city, industry, ...chars] = parsed;
    for (const g of [city, industry]) {
      for (const child of [...g.scene.children]) {
        const box = new THREE.Box3().setFromObject(child);
        const size = box.getSize(new THREE.Vector3());
        const wrap = new THREE.Group();
        const inner = child.clone();
        inner.position.set(child.position.x - (box.min.x + box.max.x) / 2, child.position.y - box.min.y, child.position.z - (box.min.z + box.max.z) / 2);
        const s = 1 / Math.max(size.x, size.z, 0.0001);
        wrap.add(inner);
        wrap.scale.setScalar(s);
        const holder = new THREE.Group();
        holder.add(wrap);
        this.protos.set(child.name, { obj: holder, h: size.y * s });
      }
    }
    for (const c of chars) {
      const root = c.scene;
      const box = new THREE.Box3().setFromObject(root);
      const h = box.max.y - box.min.y || 1;
      const holder = new THREE.Group();
      root.scale.setScalar(CHAR_HEIGHT / h);
      holder.add(root);
      this.charProtos.push({ scene: holder, clips: c.animations });
    }
    if (this.charProtos.some(c => c.clips.length === 0)) throw new Error('character animations missing');
    this.opts.onProgress?.(1);
  }

  // ------------------------------------------------------------------ helpers
  private mat(color: number, o: Partial<{ rough: number; metal: number; emissive: number; ei: number }> = {}) {
    const m = new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.8, metalness: o.metal ?? 0.05, emissive: o.emissive ?? 0, emissiveIntensity: o.ei ?? 0 });
    this.disposables.push(m);
    return m;
  }
  private box(w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0, shadow = true) {
    const g = new THREE.BoxGeometry(w, h, d);
    this.disposables.push(g);
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(x, y, z);
    mesh.castShadow = shadow && this.renderer.shadowMap.enabled; mesh.receiveShadow = this.renderer.shadowMap.enabled;
    return mesh;
  }
  private cyl(rt: number, rb: number, h: number, m: THREE.Material, seg = 16) {
    const g = new THREE.CylinderGeometry(rt, rb, h, seg);
    this.disposables.push(g);
    const mesh = new THREE.Mesh(g, m);
    mesh.castShadow = this.renderer.shadowMap.enabled; mesh.receiveShadow = this.renderer.shadowMap.enabled;
    return mesh;
  }
  private canvasTex(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d')!);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    this.disposables.push(tex);
    return tex;
  }
  /** clone a prototype scaled to a footprint, with its height capped */
  private instance(name: string, footprint: number, maxH = Infinity): THREE.Object3D | null {
    const p = this.protos.get(name);
    if (!p) return null;
    let fp = footprint;
    if (p.h * fp > maxH) fp = maxH / p.h;
    const o = p.obj.clone(true);
    o.scale.setScalar(fp);
    o.traverse(n => { const m = n as THREE.Mesh; if (m.isMesh) { m.castShadow = this.renderer.shadowMap.enabled; m.receiveShadow = this.renderer.shadowMap.enabled; } });
    return o;
  }

  // ------------------------------------------------------------------ scene
  private buildScene() {
    const low = this.opts.quality === 'low';
    this.scene.background = new THREE.Color(0x120f0b);
    this.scene.fog = new THREE.Fog(0x120f0b, 60, 120);
    this.scene.add(new THREE.HemisphereLight(0xfff1d6, 0x6a5a45, 1.9));
    const sun = new THREE.DirectionalLight(0xffe2b8, 3.1);
    sun.position.set(-14, 28, 18);
    sun.castShadow = !low;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera; sc.left = -HALF - 3; sc.right = HALF + 3; sc.top = HALF + 3; sc.bottom = -HALF - 3; sc.near = 5; sc.far = 90;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
    this.scene.add(sun);
    const rim = new THREE.DirectionalLight(0x9fb6ff, 0.45);
    rim.position.set(18, 10, -18);
    this.scene.add(rim);

    this.signTex = this.canvasTex(128, 128, ctx => {
      ctx.clearRect(0, 0, 128, 128);
      ctx.fillStyle = '#d63a1f'; ctx.beginPath(); ctx.arc(64, 64, 58, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#efe3c6'; ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(64, 64, 58, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 16; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(34, 34); ctx.lineTo(94, 94); ctx.moveTo(94, 34); ctx.lineTo(34, 94); ctx.stroke();
    });

    this.buildGround();
    for (let id = 0; id < 40; id++) this.buildTile(id);
    this.buildCenter();
    this.buildPlaza();
    this.buildDice();

    const selMat = new THREE.MeshBasicMaterial({ color: COLORS.brass, transparent: true, opacity: 0.95 });
    this.disposables.push(selMat);
    this.selFrame = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.3, 4, 1), selMat);
    this.disposables.push(this.selFrame.geometry);
    this.selFrame.rotation.x = -Math.PI / 2; this.selFrame.rotation.z = Math.PI / 4;
    this.selFrame.scale.set(1.05, 1.05, 1);
    this.selFrame.visible = false;
    this.scene.add(this.selFrame);
    if (!low) this.buildSmoke();
    this.scene.add(this.centerGroup);
    this.scene.add(this.diceGroup);
  }

  private buildGround() {
    const w = HALF * 2 + 0.7;
    this.scene.add(this.box(w + 0.6, 1.0, w + 0.6, this.mat(COLORS.coal3, { rough: 0.6 }), 0, -0.75, 0));
    this.scene.add(this.box(w, 0.3, w, this.mat(0x120f0b, { rough: 0.9 }), 0, -0.15, 0));
    const trim = this.mat(COLORS.red, { rough: 0.5 });
    const e = w / 2 + 0.3;
    this.scene.add(this.box(w + 0.8, 0.2, 0.22, trim, 0, -0.22, e), this.box(w + 0.8, 0.2, 0.22, trim, 0, -0.22, -e), this.box(0.22, 0.2, w + 0.8, trim, e, -0.22, 0), this.box(0.22, 0.2, w + 0.8, trim, -e, -0.22, 0));
    // paved ground of the district inside the ring of tiles
    const inner = TILE * 9;
    this.scene.add(this.box(inner, 0.14, inner, this.mat(0x4c4337, { rough: 0.95 }), 0, 0.07, 0, false));
    // ring road with cream curbs and a dashed centre line, all four sides connected
    const road = this.mat(0x2b2b2f, { rough: 0.9 }), curb = this.mat(COLORS.paper, { rough: 0.8 }), dash = this.mat(0xe8d9a0, { rough: 0.8 });
    const R = 9.1, W = 1.55, L = R * 2 + W;
    for (const s of [-1, 1]) {
      this.scene.add(this.box(L, 0.05, W, road, 0, 0.16, s * R, false), this.box(W, 0.05, L, road, s * R, 0.16, 0, false));
      this.scene.add(this.box(L, 0.07, 0.1, curb, 0, 0.17, s * (R + W / 2), false), this.box(L, 0.07, 0.1, curb, 0, 0.17, s * (R - W / 2), false));
      this.scene.add(this.box(0.1, 0.07, L, curb, s * (R + W / 2), 0.17, 0, false), this.box(0.1, 0.07, L, curb, s * (R - W / 2), 0.17, 0, false));
      for (let i = -7; i <= 7; i++) {
        this.scene.add(this.box(0.7, 0.06, 0.1, dash, i * 1.25, 0.19, s * R, false), this.box(0.1, 0.06, 0.7, dash, s * R, 0.19, i * 1.25, false));
      }
    }
    // two boulevards joining the ring road to the central stage
    for (const s of [-1, 1]) {
      this.scene.add(this.box(1.3, 0.05, R - 5.2, road, 0, 0.16, s * (R + 5.2) / 2, false));
      this.scene.add(this.box(R - 5.2, 0.05, 1.3, road, s * (R + 5.2) / 2, 0.16, 0, false));
    }
    // central stage: cream border, red inset, charcoal pad
    this.scene.add(this.box(10.4, 0.1, 10.4, this.mat(COLORS.paper, { rough: 0.85 }), 0, 0.17, 0, false));
    this.scene.add(this.box(9.9, 0.12, 9.9, this.mat(COLORS.red, { rough: 0.7 }), 0, 0.18, 0, false));
    this.scene.add(this.box(9.3, 0.14, 9.3, this.mat(0x2a251e, { rough: 0.9 }), 0, 0.19, 0, false));
    // parks in the four corners
    const grass = this.mat(0x4a7340, { rough: 1 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      this.scene.add(this.box(3.9, 0.1, 3.9, this.mat(COLORS.paper), sx * 7.65, 0.17, sz * 7.65, false));
      this.scene.add(this.box(3.6, 0.12, 3.6, grass, sx * 7.65, 0.18, sz * 7.65, false));
    }
  }

  private buildPlaza() {
    const put = (name: string, fp: number, x: number, z: number, ry = 0, y = 0.24, maxH = Infinity) => { const o = this.instance(name, fp, maxH); if (o) { o.position.set(x, y, z); o.rotation.y = ry; this.scene.add(o); } return o; };
    // parks: trees, benches and small props
    const park = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    park.forEach(([sx, sz], i) => {
      const cx = sx * 7.65, cz = sz * 7.65;
      put('bush', 1.2, cx - 0.9, cz - 0.7); put('bush', 1.0, cx + 0.9, cz + 0.8); put('bush', 0.9, cx + 0.8, cz - 0.9);
      if (i < 2) { put(i === 0 ? 'watertower' : 'windturbine_tall', 2.1, cx, cz + 0.2, 0, 0.24, 4.4); }
      else { put(i === 2 ? 'solarpanel' : 'bench', 1.1, cx + 0.2, cz - 0.1, i === 2 ? 0.4 : 0); }
    });
    // cars drive on the ring road, street lights stand at its corners
    put('car_taxi', 1.15, -3.2, 9.1, Math.PI / 2, 0.2); put('car_sedan', 1.15, 4.6, -9.1, -Math.PI / 2, 0.2);
    put('car_stationwagon', 1.2, 9.1, 3.3, Math.PI, 0.2); put('car_taxi', 1.15, -9.1, -4.0, 0, 0.2);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) put('streetlight', 1.0, sx * 8.2, sz * 8.2, 0, 0.2);
    put('trafficlight_A', 0.9, 1.4, 8.3, Math.PI, 0.2); put('firehydrant', 0.5, -1.4, 8.3);
    put('dumpster', 0.8, 8.0, 5.5, Math.PI / 2);
  }

  private buildTile(id: number) {
    const sp = SPACES[id];
    const c = tileCenter(id);
    const g = new THREE.Group();
    g.position.set(c.x, 0, c.z);
    this.scene.add(g);
    const side = tileSide(id);
    const slabColor = sp.kind === 'property' ? 0xece0c2 : sp.kind === 'station' ? 0xd6cfbf : sp.kind === 'utility' ? 0xded3b6 : 0xe6d8b2;
    g.add(this.box(TILE - 0.1, 0.2, TILE - 0.1, this.mat(slabColor, { rough: 0.7 }), 0, 0.1, 0));
    if (sp.group) {
      const o = outward(id);
      const horizontal = side === 'top' || side === 'bottom';
      g.add(this.box(horizontal ? TILE - 0.1 : 0.42, 0.27, horizontal ? 0.42 : TILE - 0.1, this.mat(new THREE.Color(GROUPS[sp.group].color).getHex(), { rough: 0.5 }), o.x * (TILE / 2 - 0.26), 0.135, o.z * (TILE / 2 - 0.26)));
    }
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
    const hit = new THREE.Mesh(new THREE.BoxGeometry(TILE * 0.98, 0.9, TILE * 0.98), hitMat);
    this.disposables.push(hit.geometry, hitMat);
    hit.position.set(0, 0.5, 0); hit.userData.id = id;
    g.add(hit); this.hits.push(hit);

    const marker = new THREE.Group();
    marker.position.y = 0.2; marker.visible = false;
    g.add(marker);
    this.markers[id] = marker;

    // the rotor turns with the camera so buildings, signs and plaques always face the viewer
    const rotor = new THREE.Group();
    g.add(rotor);
    this.rotors[id] = rotor;
    const stageGroup = new THREE.Group();
    stageGroup.position.set(0, TILE_Y - 0.02, ZONE.buildingZ);
    rotor.add(stageGroup);
    const st: Stage = { group: stageGroup, level: -1, mortgaged: false, owner: null, saved: new Map(), spin: [], sign: null, top: 1 };
    this.stages[id] = st;
    // Buyable land starts empty: buildings only appear once someone owns it (see sync).
    if (sp.kind !== 'property') {
      this.buildSpecial(id, st);
      if (sp.kind === 'station' || sp.kind === 'utility') stageGroup.visible = false;
    }

    const plane = new THREE.Mesh(new THREE.PlaneGeometry(ZONE.plaqueW, ZONE.plaqueD), new THREE.MeshBasicMaterial({ transparent: true }));
    this.disposables.push(plane.geometry);
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(0, TILE_Y + 0.03, ZONE.plaqueZ);
    rotor.add(plane);
    this.labels[id] = { mesh: plane, id };
    this.refreshLabel(id);
  }

  private refreshLabel(id: number) {
    const mesh = this.labels[id].mesh;
    const mm = mesh.material as THREE.MeshBasicMaterial;
    mm.map?.dispose();
    const sp = SPACES[id];
    const name = localizedSpace(this.lang, id).shortName.toUpperCase();
    let sub = '';
    if (sp.price != null) sub = `${sp.price} cr`;
    else if (sp.kind === 'tax') sub = id === 4 ? '100 cr' : tr(this.lang, 'board.tax_nw');
    else if (sp.kind === 'event' || sp.kind === 'policy') sub = tr(this.lang, 'board.draw');
    const color = sp.group ? GROUPS[sp.group].color : '#a69b84';
    const W = 768, H = Math.round(768 * ZONE.plaqueD / ZONE.plaqueW);
    mm.map = this.canvasTex(W, H, ctx => {
      ctx.fillStyle = '#f3e9cf'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = color; ctx.fillRect(0, 0, W, 22);
      ctx.strokeStyle = '#1d1a14'; ctx.lineWidth = 10; ctx.strokeRect(5, 5, W - 10, H - 10);
      ctx.fillStyle = '#1d1a14'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const subH = sub ? 96 : 0;
      const areaTop = 34, areaH = H - areaTop - subH - 14, maxW = W - 56;
      // largest font where the name fits in at most three lines
      let best: { size: number; lines: string[] } | null = null;
      const words = name.split(' ');
      for (let size = 124; size >= 30 && !best; size -= 4) {
        ctx.font = `700 ${size}px "Barlow Condensed", "Arial Narrow", sans-serif`;
        const lines: string[] = [];
        let cur = '';
        for (const w of words) {
          const t = cur ? cur + ' ' + w : w;
          if (ctx.measureText(t).width <= maxW) cur = t; else { if (cur) lines.push(cur); cur = w; }
        }
        if (cur) lines.push(cur);
        if (lines.length <= 3 && lines.every(l => ctx.measureText(l).width <= maxW) && lines.length * size * 0.92 <= areaH) best = { size, lines };
      }
      const b = best ?? { size: 30, lines: [name] };
      ctx.font = `700 ${b.size}px "Barlow Condensed", "Arial Narrow", sans-serif`;
      const gap = b.size * 0.92;
      b.lines.forEach((ln, i) => ctx.fillText(ln, W / 2, areaTop + areaH / 2 + (i - (b.lines.length - 1) / 2) * gap));
      if (sub) { ctx.fillStyle = '#d63a1f'; ctx.font = '700 84px "Barlow Condensed", sans-serif'; ctx.fillText(sub, W / 2, H - 14 - subH / 2 + 4); }
    });
    mm.needsUpdate = true;
  }

  private buildSpecial(id: number, st: Stage) {
    const sp = SPACES[id];
    const g = st.group;
    const place = (name: string, fp: number, x = 0, z = 0, ry = 0, maxH = 1.9) => { const o = this.instance(name, fp, maxH); if (o) { o.position.set(x, 0, z); o.rotation.y = ry; g.add(o); } return o; };
    switch (sp.kind) {
      case 'station':
        place('landingpad_small', 1.5, 0, 0.1, 0, 0.5);
        place(id % 20 === 5 ? 'spacetruck' : 'spacetruck_trailer', 0.9, 0, 0.05, id % 2 ? 0.4 : -0.4, 1.2);
        break;
      case 'utility':
        place(id === 9 ? 'windturbine_tall' : 'structure_tall', 1.0, 0, 0, 0, 2.3);
        place('lights', 0.5, -0.8, 0.3, 0, 0.9);
        break;
      case 'event': case 'policy': {
        const icon = this.canvasTex(256, 256, ctx => {
          ctx.clearRect(0, 0, 256, 256);
          ctx.fillStyle = sp.kind === 'event' ? '#d63a1f' : '#1d1a14';
          if (sp.kind === 'event') { ctx.translate(128, 128); ctx.rotate(Math.PI / 4); ctx.fillRect(-84, -84, 168, 168); ctx.rotate(-Math.PI / 4); ctx.translate(-128, -128); }
          else ctx.fillRect(40, 40, 176, 176);
          ctx.fillStyle = '#efe3c6'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '400 150px Anton, Impact, sans-serif';
          ctx.fillText(sp.kind === 'event' ? '?' : '§', 128, 140);
        });
        const iconMat = new THREE.MeshStandardMaterial({ map: icon, transparent: true, roughness: 0.6, side: THREE.DoubleSide, emissive: 0x333333 });
        this.disposables.push(iconMat);
        const plane = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), iconMat);
        this.disposables.push(plane.geometry);
        plane.position.y = 1.35; g.add(plane);
        const pedestal = this.cyl(0.5, 0.62, 0.5, this.mat(COLORS.brass, { metal: 0.4, rough: 0.4 }));
        pedestal.position.y = 0.25; g.add(pedestal);
        st.spin.push(plane);
        break;
      }
      case 'tax': {
        const gold = this.mat(COLORS.brass, { metal: 0.7, rough: 0.3 });
        for (let i = 0; i < 4; i++) { const c = this.cyl(0.4, 0.4, 0.13, gold, 24); c.position.set(-0.45, 0.07 + i * 0.14, 0.1); g.add(c); }
        for (let i = 0; i < 7; i++) { const c = this.cyl(0.4, 0.4, 0.13, gold, 24); c.position.set(0.5, 0.07 + i * 0.14, -0.15); g.add(c); }
        break;
      }
      case 'go': {
        const red = this.mat(COLORS.red, { rough: 0.5 });
        g.add(this.box(0.4, 2.3, 0.4, red, -0.95, 1.15, 0), this.box(0.4, 2.3, 0.4, red, 0.95, 1.15, 0), this.box(2.5, 0.5, 0.5, red, 0, 2.4, 0));
        const gotex = this.canvasTex(256, 96, ctx => { ctx.fillStyle = '#16130f'; ctx.fillRect(0, 0, 256, 96); ctx.fillStyle = '#efe3c6'; ctx.font = '400 84px Anton, Impact, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('GO', 128, 52); });
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.56), new THREE.MeshBasicMaterial({ map: gotex }));
        this.disposables.push(sign.geometry);
        sign.position.set(0, 2.4, 0.27); g.add(sign);
        break;
      }
      case 'jail': {
        place('building_E_withoutBase', 1.2, 0, -0.1, 0, 1.9);
        const bar = this.mat(0x23201a, { metal: 0.5, rough: 0.4 });
        for (let i = -3; i <= 3; i++) { const b = this.cyl(0.04, 0.04, 1, bar, 6); b.position.set(i * 0.3, 0.5, 0.65); g.add(b); }
        g.add(this.box(2.0, 0.07, 0.07, bar, 0, 1.0, 0.65));
        break;
      }
      case 'free': {
        const cols = [0xd63a1f, 0xc9962b, 0x3aa6c9, 0x2f9d6b];
        for (let i = 0; i < 4; i++) {
          const x = -0.7 + (i % 2) * 1.4, z = -0.3 + Math.floor(i / 2) * 0.65;
          g.add(this.box(0.7, 0.4, 0.4, this.mat(0xe3d4ae), x, 0.2, z));
          const roof = this.box(0.9, 0.07, 0.55, this.mat(cols[i]), x, 0.75, z); roof.rotation.x = 0.15; g.add(roof);
          g.add(this.box(0.05, 0.55, 0.05, this.mat(COLORS.ink), x - 0.38, 0.45, z + 0.18, false), this.box(0.05, 0.55, 0.05, this.mat(COLORS.ink), x + 0.38, 0.45, z + 0.18, false));
        }
        break;
      }
      case 'gotojail':
        place('building_G_withoutBase', 1.2, 0, -0.1, 0, 2.0);
        place('car_sedan', 0.75, 0.6, 0.45, 0.6, 0.7);
        break;
      default: break;
    }
  }

  /** (re)build the buildings on a property tile for a level; animate the growth if requested */
  private setStage(id: number, level: number, animate: boolean) {
    const st = this.stages[id];
    const sp = SPACES[id];
    if (!sp.group || st.level === level) return;
    const prev = st.level;
    for (const c of [...st.group.children]) st.group.remove(c);
    st.saved.clear(); st.sign = null;
    if (level < 0) {
      st.spin = []; st.top = 0; st.level = -1; st.mortgaged = false;
      st.group.scale.setScalar(1);
      if (animate) this.puff(id, 8);
      this.refreshSmokeSources();
      return;
    }
    const style = GROUP_STYLE[sp.group];
    const plan = levelPlan(level);
    const fp = levelFootprint(level), maxH = levelMaxHeight(level);
    const add = (name: string, f: number, x: number, z: number, ry = 0, mh = Infinity) => { const o = this.instance(name, f, mh); if (o) { o.position.set(x, 0, z); o.rotation.y = ry; st.group.add(o); } return o; };
    if (plan.kind === 'shed') add(style.second, fp, 0, 0, 0.3, maxH);
    else {
      add(style.main, fp, 0, 0, 0, maxH);
      if (level >= 2) add(style.second, 0.5 + 0.04 * level, 0.85, -0.2, -0.4, maxH * 0.7);
      const slots: [number, number][] = [[-0.9, -0.25], [0.9, 0.25], [-0.9, 0.3], [0.45, -0.3], [-0.45, 0.3]];
      for (let i = 0; i < Math.min(plan.extras, 5); i++) if (i >= 1) add(style.extra[i % style.extra.length], 0.42, slots[i - 1][0], slots[i - 1][1], i, 0.9);
    }
    if (plan.star) {
      const star = new THREE.Shape();
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5; const r = i % 2 ? 0.16 : 0.38; i ? star.lineTo(Math.cos(a) * r, Math.sin(a) * r) : star.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
      const geo = new THREE.ExtrudeGeometry(star, { depth: 0.08, bevelEnabled: false });
      this.disposables.push(geo);
      const m = new THREE.Mesh(geo, this.mat(COLORS.brass, { metal: 0.8, rough: 0.25, emissive: COLORS.brass, ei: 0.45 }));
      m.position.set(0, maxH + 0.45, 0);
      st.group.add(m); st.spin = [m];
    } else st.spin = [];
    st.top = maxH;
    st.level = level;
    if (st.mortgaged) { st.mortgaged = false; this.applyMortgage(id, true); }
    if (animate) {
      const grow = level > prev;
      st.group.scale.setScalar(grow ? 0.05 : 1.25);
      this.addTween(grow ? 650 : 350, k => st.group.scale.setScalar(grow ? 0.05 + 0.95 * easeOutBack(k) : 1.25 - 0.25 * k));
      this.puff(id, grow ? 14 : 8);
    } else st.group.scale.setScalar(1);
    this.refreshSmokeSources();
  }

  private applyMortgage(id: number, mortgaged: boolean) {
    const st = this.stages[id];
    if (st.mortgaged === mortgaged) return;
    st.mortgaged = mortgaged;
    st.group.traverse(n => {
      const m = n as THREE.Mesh;
      if (!m.isMesh) return;
      if (mortgaged) {
        st.saved.set(m, m.material);
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        const dark = mats.map(src => {
          const key = (src as THREE.Material).uuid;
          let d = this.mortMats.get(key);
          if (!d) { d = (src as THREE.MeshStandardMaterial).clone(); d.color.multiplyScalar(0.3); this.mortMats.set(key, d); this.disposables.push(d); }
          return d;
        });
        m.material = Array.isArray(m.material) ? dark : dark[0];
      } else if (st.saved.has(m)) m.material = st.saved.get(m)!;
    });
    if (!mortgaged) st.saved.clear();
    // a red "no entry" sign hovers above the buildings, drawn on top of everything so it is never hidden
    if (st.sign) { st.group.remove(st.sign); st.sign = null; }
    if (mortgaged) {
      const mat = new THREE.SpriteMaterial({ map: this.signTex, transparent: true, depthTest: false });
      this.disposables.push(mat);
      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(1.15, 1.15, 1);
      sprite.position.set(0, st.top + 1.5, 0); // above the owner badge
      sprite.renderOrder = 20;
      st.group.add(sprite); st.sign = sprite;
    }
  }

  private rebuildMarker(id: number, owner: string | null) {
    const marker = this.markers[id];
    while (marker.children.length) marker.remove(marker.children[0]);
    const st = this.stages[id];
    st.owner = owner;
    const badge = this.badges[id];
    if (badge) { badge.parent?.remove(badge); this.badges[id] = null; }
    if (!owner || !this.state) { marker.visible = false; return; }
    const idx = this.state.players.findIndex(p => p.id === owner);
    const color = new THREE.Color(PLAYER_COLORS[idx % 4]);
    const glow = this.mat(color.getHex(), { rough: 0.4, emissive: color.getHex(), ei: 0.8 });
    const e = TILE / 2 - 0.1, w = 0.2;
    marker.add(this.box(TILE - 0.1, 0.07, w, glow, 0, 0, e, false), this.box(TILE - 0.1, 0.07, w, glow, 0, 0, -e, false), this.box(w, 0.07, TILE - 0.1, glow, e, 0, 0, false), this.box(w, 0.07, TILE - 0.1, glow, -e, 0, 0, false));
    // the whole tile takes the owner's colour, so ownership reads at a glance from across the board
    const floor = this.mat(color.getHex(), { rough: 0.7, emissive: color.getHex(), ei: 0.25 });
    marker.add(this.box(TILE - 0.1, 0.02, TILE - 0.1, floor, 0, TILE_Y + 0.012 - marker.position.y, 0, false));
    marker.visible = true;
    // a name tag, drawn over everything: colour alone is not enough to tell owners apart
    const sprite = new THREE.Sprite(this.badgeMaterial(owner, this.state.players[idx]?.name ?? '', PLAYER_COLORS[idx % 4]));
    sprite.scale.set(2.1, 0.79, 1);
    sprite.renderOrder = 15;
    this.rotors[id].add(sprite);
    this.badges[id] = sprite;
    this.placeBadge(id);
  }

  private placeBadge(id: number) {
    this.badges[id]?.position.set(0, TILE_Y + this.stages[id].top + 0.55, ZONE.buildingZ);
  }

  /** one shared name-tag material per player */
  private badgeMaterial(playerId: string, name: string, color: string) {
    let m = this.badgeMats.get(playerId);
    if (m) return m;
    const tex = this.canvasTex(320, 120, ctx => {
      ctx.fillStyle = '#16130f';
      ctx.beginPath(); ctx.roundRect(0, 0, 320, 120, 26); ctx.fill();
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.roundRect(9, 9, 302, 102, 18); ctx.fill();
      ctx.fillStyle = readableInk(color);
      ctx.font = '700 72px "Barlow Condensed", sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(ownerBadgeText(name), 160, 64, 280);
    });
    m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    this.disposables.push(m);
    this.badgeMats.set(playerId, m);
    return m;
  }

  private buildCenter() {
    const w = this.logoSize.w, h = this.logoSize.h;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ transparent: true }));
    this.disposables.push(mesh.geometry);
    mesh.rotation.x = -Math.PI / 2; mesh.position.set(0, 0.32, 0);
    this.centerMesh = mesh;
    this.centerGroup.add(mesh);
    this.refreshCenter();
  }

  private refreshCenter() {
    const s = this.state;
    const mm = this.centerMesh.material as THREE.MeshBasicMaterial;
    mm.map?.dispose();
    const limit = s ? (s.settings.mode === 'sustainable' ? 30 : s.settings.roundLimit) : 0;
    const round = s ? (limit ? tr(this.lang, 'board.round_of', { n: s.round, limit }) : tr(this.lang, 'board.round', { n: s.round })) : '';
    const actor = s ? (s.players.find(p => p.id === s.actorId) ?? s.players[s.turn]) : null;
    const turn = s ? (s.phase === 'finished' ? tr(this.lang, 'board.game_over') : tr(this.lang, 'board.to_act', { name: (actor?.name ?? '').toUpperCase() })) : '';
    const mode = s ? tr(this.lang, `mode.${s.settings.mode}` as const).toUpperCase() : '';
    mm.map = this.canvasTex(1536, 640, ctx => {
      ctx.clearRect(0, 0, 1536, 640);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = '400 330px Anton, Impact, sans-serif';
      ctx.fillStyle = '#d63a1f'; ctx.fillText('MARXOPOLY', 786, 178);
      ctx.fillStyle = '#efe3c6'; ctx.fillText('MARXOPOLY', 768, 164);
      ctx.fillStyle = 'rgba(22,19,15,0.9)'; ctx.fillRect(168, 326, 1200, 62);
      ctx.fillStyle = '#c9962b'; ctx.font = '700 52px "Barlow Condensed", sans-serif'; ctx.fillText(tr(this.lang, 'board.subtitle'), 768, 359);
      ctx.fillStyle = '#efe3c6'; ctx.font = '400 150px Anton, Impact, sans-serif'; ctx.fillText(round, 768, 478);
      ctx.font = '700 76px "Barlow Condensed", sans-serif'; ctx.fillText(turn, 768, 570);
      ctx.fillStyle = '#c9962b'; ctx.font = '700 46px "Barlow Condensed", sans-serif'; ctx.fillText(mode, 768, 618);
    });
    mm.needsUpdate = true;
  }

  private buildDice() {
    const faces = Array.from({ length: 6 }, (_, i) => {
      const n = i + 1;
      return this.canvasTex(128, 128, ctx => {
        ctx.fillStyle = '#fbf3dc'; ctx.fillRect(0, 0, 128, 128);
        ctx.strokeStyle = '#bba97c'; ctx.lineWidth = 8; ctx.strokeRect(4, 4, 120, 120);
        ctx.fillStyle = n === 1 ? '#d63a1f' : '#111';
        const pos: Record<number, number[][]> = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] };
        for (const [x, y] of pos[n]) { ctx.beginPath(); ctx.arc(64 + x * 32, 64 + y * 32, n === 1 ? 20 : 13, 0, Math.PI * 2); ctx.fill(); }
      });
    });
    const mats = DIE_FACE_NUMBERS.map(n => { const m = new THREE.MeshStandardMaterial({ map: faces[n - 1], roughness: 0.4, emissive: 0x2a2418 }); this.disposables.push(m); return m; });
    // red mat with cream ring under the dice
    const matDisc = this.cyl(2.9, 2.9, 0.08, this.mat(COLORS.red, { rough: 0.7 }), 40); matDisc.position.set(0, 0.26, 3.1); matDisc.castShadow = false;
    const ring = this.cyl(3.1, 3.1, 0.06, this.mat(COLORS.paper, { rough: 0.8 }), 40); ring.position.set(0, 0.24, 3.1); ring.castShadow = false;
    this.diceGroup.add(ring, matDisc);
    for (let i = 0; i < 2; i++) {
      const g = new THREE.BoxGeometry(1.5, 1.5, 1.5); this.disposables.push(g);
      const d = new THREE.Mesh(g, mats);
      d.castShadow = this.renderer.shadowMap.enabled;
      d.position.set(-1.1 + i * 2.2, 1.05, 3.1);
      this.dice.push(d); this.diceGroup.add(d);
      this.setDie(i, 1 + i);
    }
  }
  private setDie(i: number, face: number) {
    const e = diceEuler(face);
    this.dice[i].rotation.set(e[0], e[1] + (i ? 0.5 : -0.4), e[2], 'YXZ');
  }

  private buildSmoke() {
    const tex = this.canvasTex(64, 64, ctx => { const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30); g.addColorStop(0, 'rgba(230,225,215,0.9)'); g.addColorStop(1, 'rgba(230,225,215,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64); });
    for (let i = 0; i < 60; i++) {
      const m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 });
      this.disposables.push(m);
      const s = new THREE.Sprite(m);
      s.visible = false;
      this.scene.add(s);
      this.smoke.push({ s, v: 0, life: 0, max: 1 });
    }
  }
  private refreshSmokeSources() {
    this.smokeSources = [];
    for (let id = 0; id < 40; id++) {
      const sp = SPACES[id];
      if (sp.group === 'G3' || sp.group === 'G6' || sp.group === 'G4') { const st = this.stages[id]; if (st && st.level >= 1) { const c = tileCenter(id); this.smokeSources.push(new THREE.Vector3(c.x + 0.2, TILE_Y + st.top + 0.2, c.z - 0.5)); } }
    }
  }
  private emit(pos: THREE.Vector3, scale: number, life: number, rise: number) {
    const p = this.smoke.find(x => !x.s.visible);
    if (!p) return;
    p.s.visible = true; p.s.position.copy(pos); p.s.scale.setScalar(scale * 0.5); p.life = 0; p.max = life; p.v = rise;
    (p.s.material as THREE.SpriteMaterial).opacity = 0.7;
    p.s.userData.base = scale;
  }
  private puff(id: number, n: number) {
    if (this.opts.quality === 'low') return;
    const c = tileCenter(id);
    for (let i = 0; i < n; i++) this.emit(new THREE.Vector3(c.x + (Math.random() - 0.5) * 1.6, TILE_Y + 0.2, c.z + (Math.random() - 0.5) * 1.2), 0.9 + Math.random() * 0.6, 0.9 + Math.random() * 0.5, 0.9);
  }

  // ------------------------------------------------------------------ characters
  private makeChar(idx: number, p: PublicGameState['players'][number]): Char {
    const proto = this.charProtos[idx % this.charProtos.length];
    const model = SkeletonUtils.clone(proto.scene);
    model.traverse(n => { const m = n as THREE.Mesh; if (m.isMesh) { m.castShadow = this.renderer.shadowMap.enabled; m.frustumCulled = false; } });
    const root = new THREE.Group();
    root.add(model);
    const color = new THREE.Color(PLAYER_COLORS[idx % 4]);
    const ringMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.1, roughness: 0.35 });
    this.disposables.push(ringMat);
    const rg = new THREE.TorusGeometry(0.72, 0.11, 12, 40); this.disposables.push(rg);
    const ring = new THREE.Mesh(rg, ringMat);
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.08;
    const dg = new THREE.CylinderGeometry(0.7, 0.72, 0.08, 28); this.disposables.push(dg);
    const dm = new THREE.MeshStandardMaterial({ color, roughness: 0.6, emissive: color, emissiveIntensity: 0.35 }); this.disposables.push(dm);
    const disc = new THREE.Mesh(dg, dm); disc.position.y = 0.03;
    const cg = new THREE.ConeGeometry(0.3, 0.6, 4); this.disposables.push(cg);
    const marker = new THREE.Mesh(cg, ringMat); marker.rotation.x = Math.PI; marker.position.y = CHAR_HEIGHT + 0.55;
    root.add(ring, disc, marker);
    this.scene.add(root);
    model.scale.setScalar(this.charScale);
    const mixer = new THREE.AnimationMixer(model);
    const actions = new Map<string, THREE.AnimationAction>();
    for (const clip of proto.clips) actions.set(clip.name, mixer.clipAction(clip));
    const ch: Char = { id: p.id, root, model, mixer, actions, clipNames: proto.clips.map(c => c.name), current: null, tile: p.position, order: 0, color: color.getHex(), bankrupt: false, busy: false, marker };
    this.moment(ch, 'idle');
    return ch;
  }

  private moment(ch: Char, m: Moment, once = false): number {
    const name = pickClip(m, ch.clipNames);
    if (!name) return 0;
    const next = ch.actions.get(name)!;
    if (ch.current !== name || once) {
      const prev = ch.current ? ch.actions.get(ch.current) : null;
      next.reset();
      next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
      next.clampWhenFinished = once;
      next.enabled = true;
      next.fadeIn(0.15).play();
      prev?.fadeOut(0.15);
      ch.current = name;
    }
    return next.getClip().duration;
  }

  /** world position of a character slot: on the walking lane in front of the buildings, behind the name plaque */
  private slotPos(tile: number, order: number): THREE.Vector3 {
    const c = tileCenter(tile);
    const l = SLOT_LOCAL[order % 4];
    const w = localToWorld({ x: l.x, z: l.z + ZONE.laneZ - 0.1 }, this.yaw);
    return new THREE.Vector3(c.x + w.x, TILE_Y, c.z + w.z);
  }
  private lanePos(tile: number): THREE.Vector3 {
    const c = tileCenter(tile);
    const w = localToWorld({ x: 0, z: ZONE.laneZ }, this.yaw);
    return new THREE.Vector3(c.x + w.x, TILE_Y, c.z + w.z);
  }
  private orderOnTile(ch: Char, tile: number): number {
    let n = 0;
    for (const o of this.chars.values()) if (o !== ch && !o.bankrupt && o.tile === tile) n++;
    return Math.min(3, n);
  }

  private moveChar(ch: Char, ids: number[], stepMs: number, hop = false): Promise<void> {
    return new Promise(resolve => {
      const path = ids.length ? ids : [ch.tile];
      let i = 0;
      ch.busy = true;
      const stepTo = () => {
        if (i >= path.length) {
          ch.busy = false; ch.tile = path[path.length - 1]; ch.order = this.orderOnTile(ch, ch.tile);
          this.moment(ch, 'idle');
          this.follow = null;
          resolve(); return;
        }
        const id = path[i++];
        const last = i === path.length;
        const from = ch.root.position.clone();
        const to = last ? this.slotPos(id, this.orderOnTile(ch, id)) : this.lanePos(id);
        const dir = to.clone().sub(from);
        if (dir.lengthSq() > 0.0001) ch.model.rotation.y = Math.atan2(dir.x, dir.z);
        this.moment(ch, hop ? 'hop' : stepMs < 120 ? 'run' : 'walk');
        const dur = hop ? 650 : stepMs;
        this.follow = to;
        this.addTween(dur, k => {
          ch.root.position.lerpVectors(from, to, easeInOut(k));
          ch.root.position.y = TILE_Y + (hop ? Math.sin(k * Math.PI) * 1.4 : Math.sin(k * Math.PI) * 0.1);
        }, () => { ch.tile = id; stepTo(); });
      };
      stepTo();
    });
  }

  private reactChar(ch: Char, m: Moment, ms: number): Promise<void> {
    return new Promise(resolve => {
      const dur = this.moment(ch, m, true);
      if (!dur) {
        const y0 = ch.model.position.y, s0 = ch.model.scale.y;
        this.addTween(ms, k => { ch.model.position.y = y0 + (m === 'celebrate' ? Math.abs(Math.sin(k * Math.PI * 2)) * 0.35 : 0); ch.model.scale.y = s0 * (m === 'sad' ? 1 - Math.sin(k * Math.PI) * 0.12 : 1); }, () => { ch.model.position.y = y0; ch.model.scale.y = s0; resolve(); });
        return;
      }
      this.addTween(Math.min(ms, dur * 1000), () => undefined, () => { this.moment(ch, 'idle'); resolve(); });
    });
  }

  // ------------------------------------------------------------------ tweens / loop
  private addTween(dur: number, fn: (k: number) => void, done?: () => void) { this.tweens.push({ t: 0, dur: Math.max(1, dur), fn, done }); }
  private stepTweens(dtMs: number) {
    for (const tw of [...this.tweens]) {
      tw.t += dtMs;
      const k = Math.min(1, tw.t / tw.dur);
      tw.fn(k);
      if (k >= 1) { this.tweens.splice(this.tweens.indexOf(tw), 1); tw.done?.(); }
    }
  }

  private loop(now: number) {
    if (this.destroyed) return;
    this.raf = requestAnimationFrame(t => this.loop(t));
    if (document.hidden) { this.lastFrame = now; return; }
    const minGap = this.opts.quality === 'low' ? 1000 / 30 : 0;
    if (now - this.lastFrame < minGap - 1) return;
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    this.stepTweens(dt * 1000);
    for (const ch of this.chars.values()) ch.mixer.update(dt);
    const t = now / 1000;
    for (const st of this.stages) if (st) for (const o of st.spin) {
      o.rotation.y = t * 1.4;
      if (o.userData.bob === undefined) o.userData.bob = o.position.y;
      o.position.y = (o.userData.bob as number) + Math.sin(t * 2) * 0.08;
    }
    if (this.selected != null && this.selFrame.visible) { const k = 1 + Math.sin(t * 4) * 0.04; this.selFrame.scale.set(1.05 * k, 1.05 * k, 1); }
    this.updateSmoke(dt, t);
    this.updateCamera(dt);
    // idle characters keep their slot as the view turns and face the viewer
    for (const ch of this.chars.values()) {
      ch.marker.position.y = CHAR_HEIGHT + 0.55 + Math.sin(t * 3 + ch.order) * 0.12;
      ch.marker.rotation.y = t * 2;
      if (!ch.busy && !ch.bankrupt) { ch.root.position.copy(this.slotPos(ch.tile, ch.order)); ch.model.rotation.y = this.yaw; }
    }
    this.renderer.render(this.scene, this.camera);
    this.frames++;
    if (now - this.fpsAt >= 1000) { this.fps = this.frames * 1000 / (now - this.fpsAt); this.frames = 0; this.fpsAt = now; this.parent.dataset.fps = this.fps.toFixed(1); }
  }

  private updateSmoke(dt: number, t: number) {
    if (!this.smoke.length) return;
    if (this.smokeSources.length && Math.floor(t * 4) !== Math.floor((t - dt) * 4)) this.emit(this.smokeSources[Math.floor(Math.random() * this.smokeSources.length)].clone(), 0.55, 2.2, 0.55);
    for (const p of this.smoke) {
      if (!p.s.visible) continue;
      p.life += dt;
      const k = p.life / p.max;
      if (k >= 1) { p.s.visible = false; continue; }
      p.s.position.y += p.v * dt; p.s.position.x += 0.12 * dt;
      p.s.scale.setScalar((p.s.userData.base ?? 0.6) * (0.5 + k * 1.2));
      (p.s.material as THREE.SpriteMaterial).opacity = 0.55 * (1 - k);
    }
  }

  // ------------------------------------------------------------------ camera & input
  private resize() {
    const w = Math.max(1, this.parent.clientWidth), h = Math.max(1, this.parent.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.fit();
    // on phones the whole board is ~350 px wide, so the characters are drawn larger to stay visible
    this.charScale = w < 640 ? 1.45 : 1;
    for (const ch of this.chars.values()) ch.model.scale.setScalar(this.charScale);
  }

  /** Choose distance and look-at offset so the whole board fills the frame at the current pitch. */
  private fit() {
    const R = HALF + 0.55;
    const pts = [[-R, 0, -R], [R, 0, -R], [-R, 0, R], [R, 0, R], [-R, 3.2, -R], [R, 3.2, -R]].map(p => new THREE.Vector3(p[0], p[1], p[2]));
    const cam = this.camera.clone();
    let dist = 60, lookZ = 0;
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    for (let i = 0; i < 18; i++) {
      cam.position.set(0, sp * dist, cp * dist + lookZ);
      cam.lookAt(0, 0.3, lookZ);
      cam.updateMatrixWorld(true);
      let maxX = 0, minY = 9, maxY = -9;
      for (const p of pts) { const v = p.clone().project(cam); maxX = Math.max(maxX, Math.abs(v.x)); minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y); }
      const need = Math.max(maxX, (maxY - minY) / 2) / 0.985;
      dist *= 0.5 + 0.5 * need;
      lookZ -= ((minY + maxY) / 2) * dist * 0.22;
    }
    this.dist = dist; this.lookZ = lookZ;
  }

  private updateCamera(dt: number) {
    const k = 1 - Math.pow(0.0015, dt);
    this.yaw += (this.yawTarget + this.yawDrag - this.yaw) * k;
    if (this.follow) this.focusTarget.set(this.follow.x * 0.1, 0, this.follow.z * 0.1); else this.focusTarget.set(0, 0, 0);
    this.focus.lerp(this.focusTarget, 1 - Math.pow(0.02, dt));
    const d = this.dist;
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const tx = this.focus.x + Math.sin(this.yaw) * this.lookZ, tz = this.focus.z + Math.cos(this.yaw) * this.lookZ;
    this.camera.position.set(tx + Math.sin(this.yaw) * cp * d, this.focus.y + sp * d, tz + Math.cos(this.yaw) * cp * d);
    this.camera.lookAt(tx, 0.3, tz);
    for (const r of this.rotors) if (r) r.rotation.y = this.yaw;
    this.centerGroup.rotation.y = this.yaw;
    this.centerGroup.position.set(-Math.sin(this.yaw) * 2.15, 0, -Math.cos(this.yaw) * 2.15);
    this.diceGroup.rotation.y = this.yaw;
  }

  rotateView() { this.yawTarget += Math.PI / 2; }

  private bindInput(canvas: HTMLCanvasElement) {
    const ray = new THREE.Raycaster();
    const pt = new THREE.Vector2();
    const pick = (cx: number, cy: number): number | null => {
      const r = canvas.getBoundingClientRect();
      pt.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(pt, this.camera);
      const hit = ray.intersectObjects(this.hits, false)[0];
      return hit ? (hit.object.userData.id as number) : null;
    };
    const down = (e: PointerEvent) => { this.dragging = { x: e.clientX, y: e.clientY, moved: false, yaw0: this.yawDrag, pitch0: this.pitch }; };
    const move = (e: PointerEvent) => {
      const d = this.dragging;
      if (d && e.buttons) {
        const dx = e.clientX - d.x, dy = e.clientY - d.y;
        if (Math.abs(dx) + Math.abs(dy) > 7) d.moved = true;
        if (d.moved) {
          this.yawDrag = Math.max(-0.6, Math.min(0.6, d.yaw0 - dx * 0.004));
          if (e.pointerType === 'mouse') { this.pitch = Math.max(0.7, Math.min(1.25, d.pitch0 + dy * 0.004)); this.fit(); }
        }
        return;
      }
      if (e.pointerType !== 'mouse') return;
      const id = pick(e.clientX, e.clientY);
      if (id == null) { this.tooltip.style.display = 'none'; canvas.style.cursor = 'default'; return; }
      const r = this.parent.getBoundingClientRect();
      this.tooltip.textContent = localizedSpace(this.lang, id).name;
      this.tooltip.style.display = 'block';
      this.tooltip.style.left = `${Math.min(r.width - 220, e.clientX - r.left + 14)}px`;
      this.tooltip.style.top = `${e.clientY - r.top + 14}px`;
      canvas.style.cursor = 'pointer';
    };
    const up = (e: PointerEvent) => {
      const d = this.dragging; this.dragging = null;
      if (d && !d.moved) { const id = pick(e.clientX, e.clientY); if (id != null) this.clickCb?.(id); }
    };
    const leave = () => { this.tooltip.style.display = 'none'; };
    canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move); window.addEventListener('pointerup', up); canvas.addEventListener('pointerleave', leave);
    this.cleanups.push(() => { canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); canvas.removeEventListener('pointerleave', leave); });
  }

  // ------------------------------------------------------------------ BoardApi
  onSpaceClick(cb: (id: number) => void) { this.clickCb = cb; }

  setSelected(id: number | null) {
    this.selected = id;
    if (id == null) { this.selFrame.visible = false; return; }
    const c = tileCenter(id);
    this.selFrame.position.set(c.x, TILE_Y + 0.04, c.z);
    this.selFrame.visible = true;
  }

  setLang(lang: Lang) {
    if (lang === this.lang) return;
    this.lang = lang;
    for (let id = 0; id < 40; id++) this.refreshLabel(id);
    this.refreshCenter();
  }

  sync(state: PublicGameState) {
    this.state = state;
    state.players.forEach((p, i) => {
      let ch = this.chars.get(p.id);
      if (!ch) { ch = this.makeChar(i, p); this.chars.set(p.id, ch); ch.root.position.copy(this.slotPos(p.position, 0)); }
      if (p.bankrupt && !ch.bankrupt) {
        ch.bankrupt = true;
        void this.reactChar(ch, 'fall', 900).then(() => this.addTween(500, k => ch!.root.scale.setScalar(1 - k), () => { ch!.root.visible = false; }));
      }
    });
    for (const [idStr, pr] of Object.entries(state.props)) {
      const id = Number(idStr);
      const st = this.stages[id];
      const animate = this.synced && this.busy === 0 && !document.hidden;
      if (SPACES[id].kind === 'property') this.setStage(id, pr.owner ? pr.level : -1, animate);
      else if (st.group.visible !== !!pr.owner) {
        st.group.visible = !!pr.owner;
        if (pr.owner && animate) {
          st.group.scale.setScalar(0.05);
          this.addTween(650, k => st.group.scale.setScalar(0.05 + 0.95 * easeOutBack(k)));
          this.puff(id, 14);
        }
      }
      this.applyMortgage(id, pr.mortgaged);
      if (st.owner !== pr.owner || (st.owner && this.markers[id].children.length === 0)) this.rebuildMarker(id, pr.owner);
      this.placeBadge(id);
    }
    this.synced = true;
    if (this.busy === 0) {
      const counts = new Map<number, number>();
      for (const p of state.players) {
        const ch = this.chars.get(p.id)!;
        if (p.bankrupt || ch.busy) continue;
        const order = counts.get(p.position) ?? 0; counts.set(p.position, order + 1);
        ch.order = order;
        if (ch.tile !== p.position) {
          if (document.hidden) { ch.tile = p.position; ch.root.position.copy(this.slotPos(p.position, order)); }
          else { void this.moveChar(ch, [p.position], 0, true); }
        }
      }
      this.setDie(0, state.dice[0]); this.setDie(1, state.dice[1]);
    }
    this.refreshCenter();
    this.refreshSmokeSources();
  }

  async play(events: GameEvent[], fast: boolean): Promise<void> {
    if (document.hidden || this.destroyed) return;
    this.busy++;
    try {
      for (const e of events) {
        if (this.destroyed) return;
        if (e.type === 'dice') await this.rollDice(e.dice, fast);
        else if (e.type === 'move') {
          const ch = this.chars.get(e.playerId);
          if (!ch) continue;
          if (e.direct || e.steps <= 0) await this.moveChar(ch, [e.to], 0, true);
          else await this.moveChar(ch, walkPath(e.from, e.steps), stepDuration(e.steps, fast));
        } else if (e.type === 'cash' && e.reason.key === 'reason.purchase' && e.delta < 0) {
          const ch = this.chars.get(e.playerId); if (ch) await this.reactChar(ch, 'celebrate', fast ? 300 : 1100);
        } else if (e.type === 'cash' && e.reason.key === 'reason.rent' && e.delta < 0) {
          const ch = this.chars.get(e.playerId); if (ch) await this.reactChar(ch, 'sad', fast ? 250 : 800);
        } else if (e.type === 'jail') {
          const ch = this.chars.get(e.playerId); if (ch) { await this.moveChar(ch, [10], 0, true); await this.reactChar(ch, 'sad', fast ? 200 : 700); }
        }
      }
    } finally { this.busy--; }
  }

  private rollDice(final: [number, number], fast: boolean): Promise<void> {
    const dur = fast ? 350 : 900;
    return new Promise(resolve => {
      const base = this.dice.map(d => d.position.clone());
      const spins = this.dice.map(() => new THREE.Vector3((Math.random() - 0.5) * 22, (Math.random() - 0.5) * 22, (Math.random() - 0.5) * 22));
      const targets = final.map((f, i) => { const e = diceEuler(f); return new THREE.Quaternion().setFromEuler(new THREE.Euler(e[0], e[1] + (i ? 0.5 : -0.4), e[2], 'YXZ')); });
      const starts = this.dice.map(d => d.quaternion.clone());
      this.addTween(dur, k => {
        this.diceScale = 1 + Math.sin(k * Math.PI) * 0.35;
        this.dice.forEach((d, i) => {
          d.scale.setScalar(this.diceScale);
          d.position.set(base[i].x + Math.sin(k * 3 + i) * 0.5 * (1 - k), base[i].y + Math.abs(Math.sin(k * Math.PI * 2.2)) * 2.6 * (1 - k), base[i].z - (1 - k) * 1.0);
          if (k < 0.8) { d.rotation.x += spins[i].x * 0.016; d.rotation.y += spins[i].y * 0.016; d.rotation.z += spins[i].z * 0.016; }
          else { d.quaternion.slerpQuaternions(starts[i].clone().copy(d.quaternion), targets[i], easeInOut((k - 0.8) / 0.2)); }
        });
      }, () => {
        this.dice.forEach((d, i) => { d.position.copy(base[i]); d.quaternion.copy(targets[i]); d.scale.setScalar(1); });
        resolve();
      });
    });
  }

  // ------------------------------------------------------------------ measurements (tests and reports)
  /** true when the camera is at rest (no follow, no easing, no animation), so projected positions are stable */
  isSettled(): boolean {
    return this.tweens.length === 0 && this.follow === null && this.busy === 0 && Math.abs(this.yaw - this.yawTarget - this.yawDrag) < 0.002 && this.focus.length() < 0.02;
  }

  /** client coordinates of a tile centre (used by tests to click a tile) */
  tileScreen(id: number) {
    const c = tileCenter(id);
    const v = new THREE.Vector3(c.x, TILE_Y + 0.15, c.z).project(this.camera);
    const r = this.renderer.domElement.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  }

  /** pixel measurements of what is on screen, in canvas CSS pixels */
  measure() {
    const r = this.renderer.domElement.getBoundingClientRect();
    const px = (x: number, y: number, z: number) => { const v = new THREE.Vector3(x, y, z).project(this.camera); return { x: ((v.x + 1) / 2) * r.width, y: ((1 - v.y) / 2) * r.height }; };
    const half = TILE / 2;
    const ring = [px(-HALF, 0, -HALF), px(HALF, 0, -HALF), px(-HALF, 0, HALF), px(HALF, 0, HALF)];
    const xs = ring.map(p => p.x);
    const tileW = (id: number) => { const c = tileCenter(id); const a = px(c.x - half, TILE_Y, c.z), b = px(c.x + half, TILE_Y, c.z); return Math.abs(b.x - a.x); };
    const plaqueW = (id: number) => { const c = tileCenter(id); const a = px(c.x - ZONE.plaqueW / 2, TILE_Y, c.z + ZONE.plaqueZ), b = px(c.x + ZONE.plaqueW / 2, TILE_Y, c.z + ZONE.plaqueZ); return Math.abs(b.x - a.x); };
    const chars = [...this.chars.values()].map(c => { const p = c.root.position; const f = px(p.x, TILE_Y, p.z), h = px(p.x, TILE_Y + CHAR_HEIGHT * this.charScale, p.z); return Math.abs(f.y - h.y); });
    const dice = this.dice.map(d => { const p = d.position; const a = px(p.x - 0.75, p.y, p.z), b = px(p.x + 0.75, p.y, p.z); return Math.abs(b.x - a.x); });
    const logo = (() => { const a = px(-this.logoSize.w / 2, 0.3, -2.15), b = px(this.logoSize.w / 2, 0.3, -2.15); return Math.abs(b.x - a.x); })();
    return {
      canvas: { w: r.width, h: r.height },
      boardWidthFraction: (Math.max(...xs) - Math.min(...xs)) / r.width,
      tileWidthFarRowPx: tileW(5), tileWidthNearRowPx: tileW(25), plaqueWidthNearRowPx: plaqueW(25), plaqueWidthFarRowPx: plaqueW(5),
      characterHeightPx: chars, diceSizePx: dice, logoWidthPx: logo,
    };
  }

  debugChars() { return [...this.chars.values()].map(c => { const b = new THREE.Box3().setFromObject(c.root); return { id: c.id, pos: c.root.position.toArray(), size: b.getSize(new THREE.Vector3()).toArray(), visible: c.root.visible, clips: c.clipNames.length, cur: c.current }; }); }
  getFps() { return this.fps; }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    for (const c of this.cleanups) c();
    for (const ch of this.chars.values()) ch.mixer.stopAllAction();
    this.scene.traverse(o => {
      const m = o as THREE.Mesh;
      if (m.isMesh) { m.geometry?.dispose(); const mats = Array.isArray(m.material) ? m.material : [m.material]; for (const mt of mats) { (mt as THREE.MeshStandardMaterial)?.map?.dispose(); mt?.dispose(); } }
    });
    for (const d of this.disposables) { try { d.dispose(); } catch { /* already disposed */ } }
    this.tooltip.remove();
    if (this.renderer) { this.renderer.dispose(); this.renderer.forceContextLoss?.(); this.renderer.domElement.remove(); }
  }
}
