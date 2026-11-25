// Space-side banter: what a hull transmits as it comes apart.
// Pure data (node-importable).
export const LAST_WORDS = {
  pirate: ['Tell me mum I was a LEGITIMATE trader!', 'This is a rental!', 'I KNEW we should\'ve gone for the freighter!', 'Abandon ship! Not you, Kevin, you owe me money!',
    'Arrr— no, hang on, that\'s all the "arr" we had.', 'We surrender! Is surrendering still on the table? Hello?', 'The parrot gets the ship! THE PARROT GETS THE—',
    'You\'ll never find me treasure! It\'s under the— oh, clever. Very clever.', 'Worth it. Not sure what "it" was. Worth it.', 'I\'d like to speak to your quartermaster about a refund.'],
  rival: ['Per my last transmission—', 'This will be reflected in your credit rating.', 'Legal has been notified. Legal is also on fire.', 'Please hold. Your destruction is important to us.',
    'Synergy... failing...', 'I\'m putting this in the quarterly report!', 'Let\'s circle back on this. Let\'s— *static*', 'Our lawyers will hear of— we ARE the lawyers.'],
  rustborn: ['She was held together by hope and one bolt. You found the bolt.', 'Dibs on me own wreckage!', 'Don\'t scratch the salvage!', 'That hull was vintage! VINTAGE!',
    'Good parts in here... tell someone... good parts...', 'Reduce, reuse, re— *bang*'],
  covenant: ['The Hollow Star sees this. It is taking notes.', 'We return to the song. Off-key.', 'You only delay the chorus.', 'Our hull forgives you. We do not.',
    'The star is hollow... and so, now, are we.', 'This was foretold. The prophecy was annoyingly specific.'],
  brood: ['*indignant whale noise*', '*a long, disappointed bellow*', '*sounds like a tuba falling down stairs*', '*offended trumpeting, fading*', '*one last, deeply sarcastic honk*'],
  silent: ['...', '... ... ...', '[the machine says nothing, pointedly]', '[a single tone, like a disappointed sigh]', '[silence, but somehow smug]'],
};
export function lastWords(faction, rnd = Math.random) {
  const pool = LAST_WORDS[faction];
  return pool ? pool[Math.floor(rnd() * pool.length) % pool.length] : null;
}
