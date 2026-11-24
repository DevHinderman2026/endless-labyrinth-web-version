// The Museum's lines as a recording list for tools/voice/record.py (web 7.2.0).
//
//   node tools/museum/catalog.mjs > /tmp/museum-catalog.json
//
// Each line of js/data/museum-lines.json, with its character's Kokoro voice and its
// phonemes turned into the model's token ids (js/bella-words.js toTokens), under the
// kind 'cast' (the safe zone characters' loudness).
import { readFileSync } from 'node:fs';
import { toTokens, MAX_TOKENS } from '../../js/bella-words.js';

const lines = JSON.parse(readFileSync(new URL('../../js/data/museum-lines.json', import.meta.url), 'utf8')).lines;
const cast = JSON.parse(readFileSync(new URL('../../js/data/safe-zone-cast.json', import.meta.url), 'utf8')).characters;
const voice = Object.fromEntries(cast.map((c) => [c.id, c.voice]));
const out = lines.map((l) => {
  const ids = toTokens(l.phonemes);
  if (ids.length >= MAX_TOKENS) throw new Error('too long: ' + l.id);
  return { name: 'vc_' + l.id, id: l.id, voice: voice[l.character], phonemes: l.phonemes, text: l.text, ids };
});
process.stdout.write(JSON.stringify({ bella: [], guide: [], cast: out }));
