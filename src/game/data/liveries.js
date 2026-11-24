// Faction liveries: enemy paint schemes laid over a hull design language (YARDS), so a pirate
// built on a Tidewright clipper frame still reads as a pirate at play zoom, and nothing hostile
// wears a shipyard's showroom colours. Pure data, importable in node.
//   palette  overrides the YARDS fields the hull materials read (fx/materials.js): hull/trim/dark
//            textures, tint, trimTint, darkTint, tintMul, window, windowDensity, sail
//   glows    glow/engine colour variants the faction's designs pick from (data/enemies.js)
//   paint    flat livery colour for painted plates and bands (lit, not emissive)
//   mark     HDR emissive colour for stripes, chevrons and seams (markMul: intensity)
//   glyph    HDR emissive colour for insignia: skulls, logos, halos (glyphMul: intensity)
//   emblem   insignia laid on the foredeck in front of the castle (HullBuilder EMBLEMS)
//   marks    the markings HullBuilder adds (HullBuilder addLivery)
export const LIVERIES = {
  // tarred black hulls, rust-red salvage, glowing red hazard chevrons, a bone-white skull on the
  // deck, shark teeth at the bow and red sails in rags: scrap-built raiders
  pirate: {
    name: 'Black Pennant',
    palette: {
      hull: 'hull_mech', tint: 0x4a4440, tintMul: 1.0, trim: 'hull_apc', trimTint: 0xa83822, dark: 'hull_dropship', darkTint: 0x3c3634,
      window: 0xff5a30, windowDensity: 0.22, sail: 0xff2a14,
    },
    glows: [0xff2a14, 0xff4a10, 0xff1830],
    paint: 0xc8281a, paintTex: 'hull_apc', mark: 0xff2410, markMul: 2.4, glyph: 0xfff0dc, glyphMul: 0.4,
    emblem: 'skull', marks: ['hazard', 'jaws', 'patches', 'ragsails', 'pennant'], patches: 7,
  },
  // corporate security: clean charcoal hulls, white trim, broad lime company bands and a logo
  rival: {
    name: 'Company Colours',
    palette: {
      hull: 'hull_graphite', tint: 0x6a7282, tintMul: 1.0, trim: 'hull_glacier', trimTint: 0xeef4f4, dark: 'hull_graphite', darkTint: 0x50565e,
      window: 0xd8ffb0, windowDensity: 0.5, sail: 0x9aff40,
    },
    glows: [0x8cff3a, 0xb4ff40, 0x6cff6a],
    paint: 0xa8f030, paintTex: 'hull_glacier', mark: 0x9cff3a, markMul: 2.2, glyph: 0xe8ffd0, glyphMul: 0.72,
    emblem: 'logo', marks: ['bands', 'stripe'],
  },
  // wreck-welded: mismatched plates everywhere, glowing weld seams, a cog painted on the deck
  rustborn: {
    name: 'Weld Scars',
    palette: {},
    glows: [0xffa040, 0xff7020, 0xffd060],
    paint: 0xd8b040, paintTex: 'hull_apc', mark: 0xffa030, markMul: 2.8, glyph: 0xffc060, glyphMul: 0.66,
    emblem: 'gear', marks: ['patches', 'welds'], patches: 12,
  },
  // bone-white chitin under a burning choir halo, thorn rows along the back
  covenant: {
    name: 'Bone Choir',
    palette: { hull: 'hull_glacier', tint: 0xd8c8a8, tintMul: 1.0, trim: 'hull_alien', trimTint: 0x8a3040, window: 0xff3070 },
    glows: [0xff2050, 0xff3090, 0xd01848],
    paint: 0x701830, paintTex: 'hull_alien', mark: 0xff2060, markMul: 2.4, glyph: 0xffb0c8, glyphMul: 1.08,
    emblem: null, marks: ['halo', 'thorns'],
  },
  // void fauna: big bioluminescent eye-spots along the back
  brood: {
    name: 'Ocelli',
    palette: {},
    glows: [0x40ffd0, 0x60a0ff, 0xb070ff],
    paint: 0x204850, paintTex: 'hull_alien', mark: 0x40ffd0, markMul: 2.2, glyph: 0xc0fff0, glyphMul: 0.9,
    emblem: null, marks: ['eyespots'],
  },
  // black glass scored with lines of white light, a sigil on the deck
  silent: {
    name: 'White Script',
    palette: {},
    glows: [0x9ff0ff, 0xffffff, 0xa0b0ff],
    paint: 0x20242e, paintTex: 'hull_graphite', mark: 0xe8f8ff, markMul: 1.3, glyph: 0xe8f4ff, glyphMul: 0.54,
    emblem: 'sigil', marks: ['glyphs'],
  },
};
