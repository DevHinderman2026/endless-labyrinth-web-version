"""Make the game's voice recordings (web 6.1.0 / Windows 4.0.0) with Kokoro.

Run in Claude's workspace (Russell does not run it), after tools/voice/catalog.mjs:

    python3 tools/voice/record.py <catalog.json> <kokoro-v1.0.onnx> <voices-v1.0.bin> <out folder> [bella|guide|cast ...]

The model and the voices are Kokoro v1.0 (hexgrad/Kokoro-82M, Apache 2.0), the
same files the Windows game downloaded (the kokoro-onnx project's model-files-v1.0
release). Each recording is made straight from its hand-written phonemes (the
catalog's token ids), shaped as the game used to shape a line made live (silence
trimmed to a breath, set to one loudness, never over the top, eased in and out:
js/bella.js shape(), 6.0.0), and written as Ogg Vorbis, one channel, 24000 samples a
second. A recording is named by a fingerprint of what made it (voice, phonemes,
loudness), so making the list again only makes what changed.
"""
import hashlib
import json
import os
import subprocess
import sys
import time
import wave

import numpy as np
import onnxruntime as ort

RATE = 24000
# The loudness (RMS) of each kind, as 6.0.0 set them by ear (js/bella.js): the
# game's voice about 5% over a usual device voice, the guide and the characters at it.
RMS = {'bella': 0.11 * 1.05, 'guide': 0.11, 'cast': 0.11}
QUALITY = '1'          # Vorbis quality: speech at 24 kHz, about 40 kbit/s
SENTENCE_GAP = 0.18    # between sentences of a line made in parts (a line too long for one go)
MAKER = 'kokoro-v1.0 fp32, shape 6.0.0, vorbis q' + QUALITY


def shape(x, rms):
    peak = float(np.max(np.abs(x))) if len(x) else 0.0
    if not peak > 0:
        return None
    floor = 0.02 * peak
    loud = np.nonzero(np.abs(x) > floor)[0]
    a, b = int(loud[0]), int(loud[-1])
    pad = int(round(0.03 * RATE))
    a = max(0, a - pad)
    b = min(len(x) - 1, b + pad)
    y = x[a:b + 1].astype(np.float64)
    now = float(np.sqrt(np.mean(y * y)))
    if not now > 1e-6:
        return None
    g = rms / now
    if peak * g > 0.97:
        g = 0.97 / peak
    edge = min(len(y) // 2, int(round(0.005 * RATE)))
    env = np.ones(len(y))
    if edge > 0:
        env[:edge] = np.arange(edge) / edge
        env[len(y) - edge:] = (len(y) - 1 - np.arange(len(y) - edge, len(y))) / edge
    return (y * g * env).astype(np.float32)


def fingerprint(kind, c):
    h = hashlib.sha1(f"{MAKER}|{kind}|{c['voice']}|{c['phonemes']}|{RMS[kind]:.5f}".encode('utf-8')).hexdigest()
    return h[:16]


def main():
    cat_path, model_path, voices_path, out_dir = sys.argv[1:5]
    kinds = sys.argv[5:] or ['bella', 'guide', 'cast']
    cat = json.load(open(cat_path, encoding='utf-8'))
    os.makedirs(out_dir, exist_ok=True)
    so = ort.SessionOptions()
    so.intra_op_num_threads = os.cpu_count() or 2
    sess = ort.InferenceSession(model_path, so, providers=['CPUExecutionProvider'])
    voices = np.load(voices_path)
    names = [i.name for i in sess.get_inputs()]
    made = 0
    t0 = time.time()
    audio_s = 0.0
    for kind in kinds:
        for c in cat[kind]:
            fp = fingerprint(kind, c)
            ogg = os.path.join(out_dir, fp + '.ogg')
            if os.path.exists(ogg):
                continue
            style_table = voices[c['voice']]
            parts = [c['ids']]
            if c.get('long'):
                raise SystemExit('a line too long for one go: ' + c['name'])
            pieces = []
            for ids in parts:
                toks = np.array([[0] + list(ids) + [0]], dtype=np.int64)
                style = style_table[min(len(ids), len(style_table) - 1)].reshape(1, -1).astype(np.float32)
                feed = {names[0]: toks, names[1]: style, names[2]: np.array([1.0], dtype=np.float32)}
                wav = sess.run(None, feed)[0].reshape(-1)
                pieces.append(wav)
            y = shape(np.concatenate(pieces), RMS[kind])
            if y is None:
                raise SystemExit('silence made for ' + c['name'])
            audio_s += len(y) / RATE
            tmp = ogg + '.wav'
            with wave.open(tmp, 'wb') as w:
                w.setnchannels(1)
                w.setsampwidth(2)
                w.setframerate(RATE)
                w.writeframes((np.clip(y, -1, 1) * 32767).astype('<i2').tobytes())
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', tmp, '-c:a', 'libvorbis', '-q:a', QUALITY,
                            '-map_metadata', '-1', '-fflags', '+bitexact', '-flags:a', '+bitexact', '-f', 'ogg', ogg + '.part'], check=True)
            os.replace(ogg + '.part', ogg)
            os.remove(tmp)
            made += 1
            if made % 50 == 0:
                el = time.time() - t0
                print(f'{kind}: {made} made, {audio_s:.0f} s of speech in {el:.0f} s', flush=True)
    print(f'done: {made} made, {audio_s:.0f} s of speech in {time.time() - t0:.0f} s', flush=True)


if __name__ == '__main__':
    main()
