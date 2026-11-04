// Dev tool: slims the downloaded CC0 KayKit packs into the few small .glb files the game uses.
// Usage: node scripts/build-models.mjs <dir with the cloned KayKit repos>
// It only READS data files (glTF/PNG) from the download folder, it never runs anything in it.
import { Document, NodeIO } from '@gltf-transform/core';
import { dedup, mergeDocuments, prune, quantize } from '@gltf-transform/functions';
import fs from 'node:fs';
import path from 'node:path';

const src = path.resolve(process.argv[2]);
const out = path.resolve('public/models');
fs.mkdirSync(path.join(out, 'characters'), { recursive: true });
const io = new NodeIO();
const find = (repo, ...p) => {
  const base = path.join(src, repo, 'addons');
  const sub = fs.readdirSync(base)[0];
  return path.join(base, sub, ...p);
};

// ---- characters: keep only the clips and props the game uses
const KEEP_CLIPS = ['Idle', 'Walking_A', 'Running_A', 'Cheer', 'Hit_A', 'Death_A', 'Jump_Full_Short', 'Interact', 'Sit_Floor_Idle'];
const KEEP_PROPS = { Knight: ['1H_Sword', 'Round_Shield'], Barbarian: ['1H_Axe'], Mage: ['1H_Wand'], Rogue_Hooded: ['Knife'] };
const CHARS = ['Knight', 'Barbarian', 'Mage', 'Rogue_Hooded'];
const clipInfo = {};
for (const name of CHARS) {
  const doc = await io.read(find('KayKit-Character-Pack-Adventures-1.0', 'Characters', 'gltf', `${name}.glb`));
  const root = doc.getRoot();
  for (const anim of root.listAnimations()) if (!KEEP_CLIPS.includes(anim.getName())) anim.dispose();
  const keep = KEEP_PROPS[name] ?? [];
  for (const node of root.listNodes()) {
    const n = node.getName();
    if (node.getMesh() && /^(1H_|2H_|Badge_|Rectangle_|Round_|Spike_|Barbarian_Round|Mug|Spellbook|Knife|Throwable)/.test(n) && !keep.includes(n)) node.dispose();
  }
  await doc.transform(prune(), dedup(), quantize());
  await io.write(path.join(out, 'characters', `${name}.glb`), doc);
  clipInfo[name] = root.listAnimations().map(a => a.getName());
}
console.log('clips kept', JSON.stringify(clipInfo));

// ---- props: pack several source models into ONE glb with one shared texture
async function pack(outName, repo, names) {
  const doc = new Document();
  const scene = doc.createScene('props');
  for (const n of names) {
    const sdoc = await io.read(find(repo, 'Assets', 'gltf', `${n}.gltf`));
    const map = mergeDocuments(doc, sdoc);
    for (const s of sdoc.getRoot().listScenes()) for (const child of s.listChildren()) {
      const mapped = map.get(child);
      if (mapped) { mapped.setName(n); scene.addChild(mapped); }
    }
    for (const s of doc.getRoot().listScenes()) if (s !== scene) s.dispose();
  }
  const bufs = doc.getRoot().listBuffers();
  for (const a of doc.getRoot().listAccessors()) a.setBuffer(bufs[0]);
  bufs.slice(1).forEach(b => b.dispose());
  await doc.transform(prune(), dedup(), quantize());
  fs.writeFileSync(path.join(out, outName), Buffer.from(await io.writeBinary(doc)));
}
const city = ['building_A', 'building_B', 'building_C', 'building_D', 'building_E', 'building_F', 'building_G', 'building_H',
  'building_A_withoutBase', 'building_B_withoutBase', 'building_C_withoutBase', 'building_D_withoutBase', 'building_E_withoutBase', 'building_F_withoutBase', 'building_G_withoutBase', 'building_H_withoutBase',
  'watertower', 'streetlight', 'bush', 'car_taxi', 'car_sedan', 'car_stationwagon', 'dumpster', 'firehydrant', 'trafficlight_A', 'box_A', 'box_B', 'bench', 'road_straight', 'road_corner', 'base'];
await pack('city.glb', 'KayKit-City-Builder-Bits-1.0', city);
const space = ['windturbine_low', 'windturbine_tall', 'solarpanel', 'containers_A', 'containers_B', 'cargo_A', 'cargo_B', 'structure_tall', 'structure_low', 'drill_structure', 'cargodepot_A', 'cargodepot_B',
  'basemodule_A', 'basemodule_B', 'basemodule_C', 'landingpad_small', 'landingpad_large', 'roofmodule_solarpanels', 'lights', 'spacetruck', 'spacetruck_trailer', 'rock_A', 'rocks_A'];
await pack('industry.glb', 'KayKit-Space-Base-Bits-1.0', space);
for (const f of ['city.glb', 'industry.glb', ...CHARS.map(c => `characters/${c}.glb`)]) console.log(f, (fs.statSync(path.join(out, f)).size / 1024).toFixed(0) + ' KB');
