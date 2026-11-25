// Story Mode's lines as a recording list for tools/voice/record.py (web 7.3.0).
//
//   node tools/story/catalog.mjs > /tmp/story-catalog.json
//
// Bella (af_bella) says every line of js/storymode-lines.js. Each sentence is
// recorded on its own (a line can be longer than the model takes in one go), under
// the kind 'bella' (the game's voice's loudness); tools/story/pack_lines.py joins a
// line's sentences back together. Years are said as people say them ("twenty
// twenty-six"), not as numbers ("two thousand twenty-six").
import { STORY_LINES } from '../../js/storymode-lines.js';
import { toPhonemes, toTokens, sentences, MAX_TOKENS } from '../../js/bella-words.js';

const spoken = (t) => t.replace(/\b20(\d\d)\b/g, (m, y) => 'twenty ' + (y[0] === '0' ? 'oh ' + y[1] : y.replace(/^(\d)(\d)$/, (a, b, c) => ({ 1: 'ten', 2: 'twenty' }[b] || '') + (c !== '0' ? '-' + ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'][c] : ''))));
const bella = [];
const lines = [];
for (const [id, text] of Object.entries(STORY_LINES)) {
  const parts = [];
  sentences(spoken(text)).forEach((s, k) => {
    const { phonemes, missing } = toPhonemes(s);
    if (!phonemes) throw new Error(`${id}: no pronunciation for ${missing.join(', ')}`);
    const ids = toTokens(phonemes);
    if (ids.length >= MAX_TOKENS) throw new Error('too long: ' + id);
    const name = `${id}#${k + 1}`;
    bella.push({ name, id, voice: 'af_bella', phonemes, text: s, ids });
    parts.push(name);
  });
  lines.push({ id, parts });
}
process.stdout.write(JSON.stringify({ bella, guide: [], cast: [], lines }));
