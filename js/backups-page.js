// The Score Backups page (web 1.1.0): Back up (save a sealed file of everything
// the game has saved in this browser) and Restore (read one back, asking first
// whether to combine it with this device's play or replace it).

import { makeBackup, readBackup, describe, combine, replacement, savedPlay, writePlay, backupFileName } from './backup.js';

const $ = (id) => document.getElementById(id);
let pending = null;   // the backup read from a chosen file, waiting for the choice

function say(text) { $('backup-status').textContent = text; }

async function backUp(share) {
  let text;
  try {
    text = await makeBackup();
  } catch (e) {
    say('Your saved play could not be read from this browser just now, so no backup was made. Try again later.');
    return;
  }
  const name = backupFileName();
  const file = new File([text], name, { type: 'application/json' });
  if (share && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Endless Labyrinth backup' });
      say(`Backup shared: ${name}. Keep it somewhere safe, such as Files, iCloud Drive or Google Drive.`);
      return;
    } catch (e) {
      if (e && e.name === 'AbortError') { say('Sharing was cancelled. Nothing was changed.'); return; }
      // Fall through to a download.
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  say(`Backup file made: ${name}. Your browser saves it to its downloads, or asks where to put it. Keep it somewhere safe, such as Files, iCloud Drive or Google Drive.`);
}

async function chose(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  let text;
  try { text = await file.text(); } catch (e) { say('That file could not be read.'); return; }
  const backup = await readBackup(text);
  if (backup.error) { say(backup.error); $('restore-choice').hidden = true; pending = null; return; }
  pending = backup;
  $('backup-summary').textContent = describe(backup) + ' Combine it with the play saved on this device, keeping the better of everything? Or replace what is saved here with the backup? Nothing changes until you choose.';
  $('restore-choice').hidden = false;
  say('');
  $('combine').focus();
}

function finish(how) {
  if (!pending) return;
  let play;
  try {
    play = how === 'combine' ? combine(savedPlay(), pending) : replacement(pending);
    writePlay(play);
  } catch (e) {
    say('The backup could not be restored: your browser is not allowing the game to save. Nothing was changed.');
    return;
  }
  $('restore-choice').hidden = true;
  pending = null;
  $('restore-file').value = '';
  say(how === 'combine'
    ? 'Done. The backup has been combined with the play saved on this device: the better best on every board, the larger total of every stat, and the better run in every event. Your settings are unchanged.'
    : 'Done. The play saved on this device has been replaced with the backup, settings included.');
}

function cancel() {
  pending = null;
  $('restore-choice').hidden = true;
  $('restore-file').value = '';
  say('Cancelled. Nothing was changed.');
}

if (typeof document !== 'undefined' && $('backup-status')) {
  $('back-up').addEventListener('click', () => backUp(false));
  const share = $('share-backup');
  if (navigator.share && navigator.canShare) share.addEventListener('click', () => backUp(true));
  else share.hidden = true;
  $('restore-file').addEventListener('change', (e) => chose(e.target));
  $('combine').addEventListener('click', () => finish('combine'));
  $('replace').addEventListener('click', () => finish('replace'));
  $('cancel').addEventListener('click', cancel);
}

// For the tests.
export { backUp, chose, finish, cancel };
