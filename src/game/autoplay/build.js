// The autoplay captain's talent builds: the order points are spent in, by the kind of hull flown.
// Pure data + logic (node-testable). The broadside build is the same order the balance contract's
// expected captain learns (data/talents.js STANDARD_BUILD).
import { canLearn, TALENTS, TALENT_BY_KEY, STANDARD_BUILD } from '../data/talents.js';

export const TALENT_BUILDS = {
  broadside: STANDARD_BUILD,
  carrier: ['tactics', 'hullUp', 'plunder', 'harmonics', 'merchant', 'veteran', 'wingCmd', 'carrierAdmiral', 'gunDrill', 'recharge', 'reload', 'ablative', 'deadeye', 'damageCtl', 'admiral', 'homing', 'lastStand', 'helm', 'burners', 'tractor', 'evasivePro', 'broadMaster', 'hydra', 'slipstream', 'ram'],
  bastion: ['hullUp', 'harmonics', 'gunDrill', 'recharge', 'ablative', 'reload', 'damageCtl', 'bastion', 'deadeye', 'lastStand', 'tactics', 'homing', 'broadMaster', 'veteran', 'plunder', 'helm', 'hydra', 'lineOfBattle', 'merchant', 'burners', 'tractor', 'evasivePro', 'wingCmd', 'admiral', 'slipstream', 'ram'],
};

// a build that fits the hull: carriers go Command (wings, then the Carrier Admiral capstone),
// Ironhold walls go Defense (Bastion), everything else a broadside gunnery build
export function buildFor(chassis, hangarBays = 0) {
  if (!chassis) return 'broadside';
  if (chassis.carrier || hangarBays >= 2) return 'carrier';
  if (chassis.yard === 'ironhold') return 'bastion';
  return 'broadside';
}

// The next talent to learn, or null when no point can be spent. Follows the build's order; if
// the build has nothing learnable left, any plain talent will do rather than leave a point idle
// (never a capstone the build did not ask for: those reshape the ship with a trade-off).
export function nextTalent(data, build = 'broadside') {
  const order = TALENT_BUILDS[build] || TALENT_BUILDS.broadside;
  for (const k of order) if (TALENT_BY_KEY[k] && canLearn(data, k)) return k;
  for (const t of TALENTS) if (!t.capstone && canLearn(data, t.k)) return t.k;
  return null;
}

// spend every free point; returns the keys learned, in order (mutates data.talents)
export function spendTalentPoints(data, build = 'broadside', learn = null) {
  const got = [];
  data.talents ||= {};
  for (let guard = 0; guard < 120; guard++) {
    const k = nextTalent(data, build);
    if (!k) break;
    if (learn) { if (!learn(k)) break; } else data.talents[k] = (data.talents[k] || 0) + 1;
    got.push(k);
  }
  return got;
}

// "Gun Drill 3/5, Reinforced Hull 1/5" for the log
export function describeTalents(data, keys) {
  return [...new Set(keys)].map((k) => `${TALENT_BY_KEY[k].name} ${(data.talents || {})[k] || 0}/${TALENT_BY_KEY[k].max}`).join(', ');
}
