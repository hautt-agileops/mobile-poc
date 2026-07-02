# assets.manifest.json — schema

The machine contract `gen-assets.mjs` reads. `ASSETS.md` is the human design doc;
this JSON is what actually drives generation. Keep them in sync, but the JSON wins.

## Top level

| field     | type     | required | meaning |
|-----------|----------|----------|---------|
| `project` | string   | no       | label, printed at run start |
| `style`   | string   | **yes**  | global art-style guide prepended to EVERY asset prompt — palette, line weight, era/genre, lighting, render style. This is what keeps the set coherent. |
| `outDir`  | string   | no       | where PNGs land. Default `Assets/Resources/Art`. Resolved relative to cwd (run from project root) or override with `-o`. Keep it under `Assets/Resources/`. |
| `assets`  | object[] | **yes**  | one entry per asset, generated in array order (so a `ref` target appears before the asset that refs it). |

## Per-asset

| field        | type     | required | default | meaning |
|--------------|----------|----------|---------|---------|
| `id`         | string   | **yes**  | —       | Unity-friendly stem: `[a-z0-9_]`. Becomes `<id>.png` AND the `Resources.Load`/`SpriteLoader.Get` key. |
| `type`       | string   | **yes**  | —       | `sprite` \| `spritesheet` \| `tile` \| `ui` \| `icon` \| `bg` \| `concept`. Picks the framing directive. |
| `category`   | string   | no       | —       | free label for `ASSETS.md` grouping (character / stage / ui / fx). Not used by the generator. |
| `prompt`     | string   | **yes**  | —       | the subject description. Concrete: what it is, pose/state, colors, key shapes. No need to repeat the global `style`. |
| `size`       | string   | no       | `"1K"`  | Vertex image size — `"1K"` or `"2K"` ONLY. Any other value (e.g. `"512"`) is coerced to `"1K"` (Vertex rejects it otherwise). |
| `background` | string   | no       | `transparent` for sprites | `transparent` (alpha cutout — game sprites) \| `white` (flat fill) \| `scene` (painted backdrop — for `bg`/`concept`). |
| `frames`     | number   | no       | `1`     | >1 → spritesheet: writes `<id>_0.png … <id>_{N-1}.png`, generated in one multi-turn so frames stay on-model. |
| `frameNotes` | string[] | no       | —       | per-frame pose hints for a spritesheet, indexed by frame. e.g. `["idle", "wind-up", "strike", "recover"]`. |
| `ref`        | string   | no       | —       | id of an EARLIER asset whose image is fed back as visual reference, so this asset matches its style/palette/proportions. Use to keep a roster or a move-set on-model: idle has no ref; every move frame `ref`s the idle. |

## Example

```json
{
  "project": "blood-bloom-protocol",
  "style": "gritty neon-noir pixel-art, limited 16-color palette, hard rim light, 1px black outline, 2x scale, side-on fighting-game proportions",
  "outDir": "Assets/Resources/Art",
  "assets": [
    {
      "id": "fighter_red_idle",
      "type": "sprite",
      "category": "character",
      "prompt": "lean red-clad street brawler in a fighting stance, fists up, red scarf, dark combat pants",
      "background": "transparent"
    },
    {
      "id": "fighter_red_punch",
      "type": "sprite",
      "category": "character",
      "prompt": "the same red brawler throwing a forward straight punch, arm fully extended, weight forward",
      "background": "transparent",
      "ref": "fighter_red_idle"
    },
    {
      "id": "fighter_blue_walk",
      "type": "spritesheet",
      "category": "character",
      "prompt": "blue-armored counterpart brawler, walk cycle",
      "frames": 4,
      "frameNotes": ["contact pose", "passing pose", "contact opposite", "passing opposite"],
      "background": "transparent",
      "ref": "fighter_red_idle"
    },
    {
      "id": "stage_rooftop",
      "type": "bg",
      "category": "stage",
      "prompt": "rain-slick neon rooftop at night, distant city skyline, puddle reflections, no characters",
      "background": "scene"
    },
    {
      "id": "ui_health_fill",
      "type": "ui",
      "category": "ui",
      "prompt": "horizontal health-bar fill segment, hot-red gradient with a bright top highlight",
      "background": "transparent"
    },
    {
      "id": "concept_keyart",
      "type": "concept",
      "category": "concept",
      "prompt": "key art: the red and blue brawlers clashing on the neon rooftop, dramatic backlight",
      "background": "scene"
    }
  ]
}
```

## Notes

- **Order matters for `ref`** — list the referenced asset before its dependents.
- **Ids must be unique** — a duplicate id overwrites the earlier PNG.
- **Concept boards aren't game assets** — `type: concept` exists to fix the visual
  target and to show the user; Unity doesn't have to load them. Keep them in the
  manifest so the style is captured as an image, not just prose.
