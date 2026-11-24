// Captain talents: one point per commander rank, spent across four trees.
// Numeric effects become ship stats (via game.statProviders); special ones are read where
// they apply (weapon mods, ability cooldowns, Last Stand).
export const TREES = [
  { k: 'gunnery', name: 'Gunnery', color: '#ff7a6a' },
  { k: 'defense', name: 'Defense', color: '#58b8ff' },
  { k: 'navigation', name: 'Navigation', color: '#4ade80' },
  { k: 'command', name: 'Command', color: '#b46bff' },
];

export const TALENTS = [
  // gunnery
  { k: 'gunDrill', tree: 'gunnery', name: 'Gun Drill', max: 5, req: 1, icon: 'cannon', stat: { dmg: 0.04 }, desc: '+4% weapon damage per rank.' },
  { k: 'reload', tree: 'gunnery', name: 'Rapid Reload', max: 5, req: 3, icon: 'reactor', desc: '+3% rate of fire per rank.' },
  { k: 'deadeye', tree: 'gunnery', name: 'Deadeye', max: 5, req: 6, icon: 'sensor', stat: { crit: 0.02, critDmg: 0.05 }, desc: '+2% critical chance and +5% critical damage per rank.' },
  { k: 'homing', tree: 'gunnery', name: 'Homing Warheads', max: 1, req: 8, icon: 'missile', desc: 'Missiles and torpedoes always home in; shells and bolts curve toward the target.' },
  { k: 'broadMaster', tree: 'gunnery', name: 'Broadside Mastery', max: 3, req: 12, icon: 'broadside', desc: 'Broadside Volley cooldown -15% and damage +10% per rank.' },
  { k: 'hydra', tree: 'gunnery', name: 'Hydra Protocol', max: 1, req: 25, icon: 'flak', desc: '25% chance any shell or bolt volley splits into three.' },
  // defense
  { k: 'hullUp', tree: 'defense', name: 'Reinforced Hull', max: 5, req: 1, icon: 'armor', stat: { hull: 0.05 }, desc: '+5% hull integrity per rank.' },
  { k: 'harmonics', tree: 'defense', name: 'Shield Harmonics', max: 5, req: 3, icon: 'shield', stat: { shield: 0.05 }, desc: '+5% shield capacity per rank.' },
  { k: 'recharge', tree: 'defense', name: 'Rapid Recharge', max: 5, req: 6, icon: 'reactor', stat: { shieldRegen: 0.08 }, desc: '+8% shield regeneration per rank.' },
  { k: 'ablative', tree: 'defense', name: 'Ablative Plating', max: 5, req: 9, icon: 'armor', stat: { armor: 3 }, desc: '+3 armour per rank.' },
  { k: 'damageCtl', tree: 'defense', name: 'Damage Control', max: 3, req: 14, icon: 'repair', stat: { hullRegen: 0.002 }, desc: 'Repair 0.2% hull per second per rank.' },
  { k: 'lastStand', tree: 'defense', name: 'Last Stand', max: 1, req: 25, icon: 'shield', desc: 'Below 25% hull, every shield facing refills instantly. Once a minute.' },
  // navigation
  { k: 'helm', tree: 'navigation', name: 'Helmsmanship', max: 5, req: 1, icon: 'evasive', stat: { turn: 0.04 }, desc: '+4% turn rate per rank.' },
  { k: 'burners', tree: 'navigation', name: 'Afterburners', max: 5, req: 3, icon: 'engine', stat: { speed: 0.03 }, desc: '+3% top speed per rank.' },
  { k: 'tractor', tree: 'navigation', name: 'Tractor Mastery', max: 3, req: 5, icon: 'tractor', stat: { pickup: 0.3 }, desc: '+30% tractor range per rank.' },
  { k: 'evasivePro', tree: 'navigation', name: 'Evasive Expert', max: 3, req: 10, icon: 'evasive', desc: 'Evasive Manoeuvres cooldown -20% per rank.' },
  { k: 'slipstream', tree: 'navigation', name: 'Slipstream', max: 1, req: 15, icon: 'map', desc: 'In-system warps and jumps cost nothing and spool twice as fast.' },
  { k: 'ram', tree: 'navigation', name: 'Ramming Speed', max: 1, req: 22, icon: 'broadside', desc: 'Your prow tears into ships you plough through at speed.' },
  // command
  { k: 'tactics', tree: 'command', name: 'Fleet Tactics', max: 5, req: 1, icon: 'crew', stat: { cdr: 0.03 }, desc: '+3% ability cooldown reduction per rank.' },
  { k: 'plunder', tree: 'command', name: 'Plunderer', max: 5, req: 3, icon: 'tractor', stat: { lootFind: 0.06 }, desc: '+6% better loot per rank.' },
  { k: 'merchant', tree: 'command', name: 'Merchant Prince', max: 5, req: 5, icon: 'map', stat: { credits: 0.06 }, desc: '+6% credits found and better station prices per rank.' },
  { k: 'veteran', tree: 'command', name: 'Veteran', max: 5, req: 8, icon: 'crew', stat: { xp: 0.05 }, desc: '+5% experience per rank.' },
  { k: 'wingCmd', tree: 'command', name: 'Wing Commander', max: 2, req: 12, icon: 'hangar', desc: '+1 craft per hangar bay per rank.' },
  { k: 'admiral', tree: 'command', name: "Admiral's Presence", max: 1, req: 30, icon: 'nova', stat: { dmg: 0.1, cdr: 0.1, hull: 0.1 }, desc: '+10% damage, hull and cooldown reduction.' },
];
// capstones: need 15 points spent in their tree; each reshapes the build with a trade-off
TALENTS.push(
  { k: 'lineOfBattle', tree: 'gunnery', name: 'Line of Battle', max: 1, req: 1, treeReq: 15, icon: 'broadside', capstone: true, desc: 'Broadsides +40% damage; turrets -50%. Fight like a ship of the line.' },
  { k: 'bastion', tree: 'defense', name: 'Bastion Protocol', max: 1, req: 1, treeReq: 15, icon: 'shield', capstone: true, stat: { speed: -0.15 }, desc: 'Shields regenerate at full rate under fire; 15% slower.' },
  { k: 'clipper', tree: 'navigation', name: 'Clipper Doctrine', max: 1, req: 1, treeReq: 15, icon: 'engine', capstone: true, stat: { speed: 0.3, hull: -0.15 }, desc: '+30% speed and +25% damage above 70% speed; 15% less hull.' },
  { k: 'carrierAdmiral', tree: 'command', name: 'Carrier Admiral', max: 1, req: 1, treeReq: 15, icon: 'hangar', capstone: true, desc: '+2 craft per hangar and +50% craft damage; broadsides -20%.' },
);
export const treePoints = (data, tree) => TALENTS.filter((t) => t.tree === tree).reduce((a, t) => a + ((data.talents || {})[t.k] || 0), 0);

export const TALENT_BY_KEY = Object.fromEntries(TALENTS.map((t) => [t.k, t]));

export function talentPoints(data) { return Math.max(0, data.level - 1) + (data.bonusTalentPoints || 0); }
export function spentPoints(data) { return Object.values(data.talents || {}).reduce((a, b) => a + b, 0); }
export function canLearn(data, k) {
  const t = TALENT_BY_KEY[k];
  const r = (data.talents || {})[k] || 0;
  return t && r < t.max && data.level >= t.req && spentPoints(data) < talentPoints(data) && (!t.treeReq || treePoints(data, t.tree) >= t.treeReq);
}
export function rank(data, k) { return (data.talents || {})[k] || 0; }

export function talentStats(data) {
  const out = {};
  for (const [k, r] of Object.entries(data.talents || {})) {
    const t = TALENT_BY_KEY[k];
    if (!t || !t.stat) continue;
    for (const [s, v] of Object.entries(t.stat)) out[s] = (out[s] || 0) + v * r;
  }
  return out;
}

// per-weapon modifications applied in Ship.refit for the player's ship
export function talentWeaponMod(data) {
  const reload = rank(data, 'reload'), homing = rank(data, 'homing'), hydra = rank(data, 'hydra');
  const wing = rank(data, 'wingCmd'), lob = rank(data, 'lineOfBattle'), ca = rank(data, 'carrierAdmiral');
  return (ws, item, hp) => {
    if (lob && hp) { if (hp.type === 'broadside') ws.dmg *= 1.4; if (hp.type === 'turret') ws.dmg *= 0.5; }
    if (ca && hp) { if (ws.kind === 'hangar') { ws.count += 2; ws.dmg *= 1.5; } if (hp.type === 'broadside') ws.dmg *= 0.8; }
    if (reload) ws.rof *= 1 + reload * 0.03;
    if (homing) {
      if (ws.kind === 'missile' || ws.kind === 'torpedo') ws.homing = Math.max(ws.homing, 1);
      else if (ws.kind === 'shell' || ws.kind === 'bolt' || ws.kind === 'flak') ws.homing = Math.max(ws.homing, 0.3);
    }
    if (hydra && (ws.kind === 'shell' || ws.kind === 'bolt')) ws.splitChance = 0.25;
    if (wing && ws.kind === 'hangar') ws.count += wing;
  };
}
