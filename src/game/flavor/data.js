// Space-side flavour: what a hull transmits as it comes apart.
// Pure data (node-importable).
export const LAST_WORDS = {
  pirate: ['Reactor\'s gone. Cut the channel, they don\'t need to hear this.', 'Tell the Roost we took one with us. Tell them anyway.', 'Hull\'s open to the stars. Nobody aft is answering.',
    'I should have taken the amnesty when they offered it.', 'Mayday, mayday— belay that. No one is coming.', 'Burn the logs. Don\'t let them read the logs.',
    'Hold the line, damn you— who\'s still on the guns?', 'Drive core breach. Ten seconds. It was a good run, lads.', 'You\'ll hang for this, every one of you.', 'All hands, abandon ship. God keep you, all of you.'],
  rival: ['Asset loss logged. Forwarding position to Fleet Security.', 'This sector is under contract. You will answer for this.', 'Command, we are lost. Strike our registry and notify next of kin.', 'Bridge is venting. Transmitting flight recorder now.',
    'Contract terms breached by hostile action. Invoking the indemnity clause.', 'My crew were salaried. Remember that when the Board comes for you.', 'Shields gone, reactor critical. Requesting— *static*', 'Lodging the engagement record. Your name will be on it.'],
  rustborn: ['Strip her clean, clan. Don\'t let them have the parts.', 'Forty years of welds, and you cut her open in a minute.', 'Tell the yard-mothers the bones are theirs.', 'Reactor\'s loose. Clear the drift, everybody clear the drift.',
    'She was my father\'s hull. And his father\'s.', 'Mark the wreck. Someone will come for what\'s left.'],
  covenant: ['The Hollow Star sees this. It will remember you.', 'We return to the song.', 'You only delay the chorus.', 'Our hull forgives you. We do not.',
    'The star is hollow, and so, now, are we.', 'Sing us down, sisters. Sing us down into the dark.'],
  brood: ['*a long, falling call, felt through the hull as much as heard*', '*the creature\'s bioluminescence gutters out in slow pulses*', '*a low pressure-wave moan, answered from somewhere far off*', '*erratic radio bursts from its nerve-mass, then nothing*', '*a final shudder ripples down its length; the glow dies tail-first*'],
  silent: ['...', '[carrier wave drops to zero]', '[one compressed data burst, aimed at no star we know]', '[a single sustained tone, then silence]', '[its emitters dim in sequence, bow to stern]'],
};
export function lastWords(faction, rnd = Math.random) {
  const pool = LAST_WORDS[faction];
  return pool ? pool[Math.floor(rnd() * pool.length) % pool.length] : null;
}
