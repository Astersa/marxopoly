# 3D assets

All 3D models come from Kay Lousberg (KayKit) and are **CC0 1.0** (public domain dedication). Credit is not required, it is given here anyway. For each pack the licence file inside the downloaded repository was opened and read before any file was copied; a copy of each is in `public/models/licenses/`.

| Pack | Source | Licence file (first lines read) | Used for |
|---|---|---|---|
| KayKit Adventurers Character Pack 1.0 | https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0 | `LICENSE.txt`: "License: (Creative Commons Zero, CC0) ... free to use in personal, educational and commercial projects" | the four player characters (Knight, Barbarian, Mage, Rogue Hooded): rigged and animated |
| KayKit City Builder Bits 1.0 | https://github.com/KayKit-Game-Assets/KayKit-City-Builder-Bits-1.0 | `LICENSE.txt`: same CC0 text | buildings A to H, water tower, street lights, cars, bushes, road, bench, crates |
| KayKit Space Base Bits 1.0 | https://github.com/KayKit-Game-Assets/KayKit-Space-Base-Bits-1.0 | `LICENSE.txt`: same CC0 text | industrial structures, containers, cargo, wind turbines, solar panels, landing pads, space trucks used as trains and ports |

## Why these packs

`docs/PLAN-3D.md` names Kenney packs first. kenney.nl answered the automated download with HTTP 403 (a bot check). That check was not bypassed. The plan allows another source from the same table or the author's official GitHub, so the KayKit packs were taken from KayKit's official GitHub organisation (the City Builder Bits pack is the one the plan lists; the Adventurers and Space Base packs are by the same author, with the same licence). The characters are therefore fantasy adventurers rather than factory workers, and the "industrial" look comes from KayKit space-base and city modules recoloured by lighting. No model in the repository is hand-made except simple boxes, cylinders, coins, gates and signs built in code.

## Pipeline

The downloaded repositories were cloned into a scratch folder outside the project and only read as data. `scripts/build-models.mjs` (uses `@gltf-transform/core` and `@gltf-transform/functions`, dev dependencies) turns them into the files below:

- characters: 76 animation clips each in the source, **9 kept**; unused weapons removed; geometry quantized.
- props: many glTF files merged into one `.glb` per pack, one shared texture, deduplicated and quantized.

| File | Size |
|---|---|
| `public/models/city.glb` | 898 KB |
| `public/models/industry.glb` | 460 KB |
| `public/models/characters/Knight.glb` | 2272 KB |
| `public/models/characters/Barbarian.glb` | 2258 KB |
| `public/models/characters/Mage.glb` | 2250 KB |
| `public/models/characters/Rogue_Hooded.glb` | 2233 KB |
| **Total** | **10.13 MB** (target 15 MB, limit 25 MB) |

## Animation clips

Real clip names in the character files (source had 76; these 9 are kept): `Idle`, `Walking_A`, `Running_A`, `Cheer`, `Hit_A`, `Death_A`, `Jump_Full_Short`, `Interact`, `Sit_Floor_Idle`.

Mapping (`pickClip` in `src/client/three/layout3d.ts`, with fall-backs, and a code-driven bob if a clip is missing):

| Moment | Clips tried in order |
|---|---|
| idle | Idle, Unarmed_Idle, Sit_Floor_Idle |
| walk | Walking_A, Walking_B, Running_A, Idle |
| run (fast queue) | Running_A, Running_B, Walking_A, Idle |
| buy | Cheer, Jump_Full_Short, Interact, Idle |
| pay rent | Hit_A, Hit_B, Death_A, Idle |
| bankrupt | Death_A, Death_B, Hit_A, Idle |
| go to the Labor Strike / hop | Jump_Full_Short, Cheer, Idle |
