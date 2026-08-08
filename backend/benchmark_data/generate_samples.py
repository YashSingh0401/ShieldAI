"""
Generates a labeled synthetic benchmark dataset for shieldAI's four engines.

IMPORTANT (honesty note): This is a *synthetic* dataset. Images are procedural
scenes, videos are generated test patterns, and audio is synthesized
speech-like/tonal audio (not real human recordings). It is designed to exercise
the exact signal types each engine claims to detect (ELA compression artifacts,
re-encoding, splicing, prosody, lexical URL patterns). Results are indicative
for engine calibration; real-world validation with genuine samples is a
separate, follow-up task.

Usage:  python generate_samples.py   (from the backend/ directory)
"""
import json
import os
import random
import subprocess
import wave

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)))
SEED = 42
np_random = np.random.default_rng(SEED)


def _ffmpeg():
    import shutil
    exe = shutil.which("ffmpeg")
    if not exe:
        from imageio_ffmpeg import get_ffmpeg_exe
        exe = get_ffmpeg_exe()
    return exe


def _run_ffmpeg(args: list):
    proc = subprocess.run(args, capture_output=True, timeout=120)
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg failed: {proc.stderr[:500].decode(errors='ignore')}")
    return proc


# ─── Images ───────────────────────────────────────────────────────────────────

def _render_scene(rng: random.Random, size=(900, 600)) -> Image.Image:
    """Deterministic procedural 'photograph': gradient sky, sun, mountain ridges, noise."""
    w, h = size
    img = Image.new("RGB", (w, h))
    px = img.load()
    sky_top = tuple(rng.randint(20, 90) for _ in range(3))
    sky_bot = tuple(rng.randint(120, 220) for _ in range(3))
    for y in range(h):
        t = y / h
        row = tuple(int(sky_top[c] + (sky_bot[c] - sky_top[c]) * t) for c in range(3))
        for x in range(w):
            px[x, y] = row
    draw = ImageDraw.Draw(img)
    sun = (rng.randint(100, w - 100), rng.randint(60, 180))
    draw.ellipse([sun[0] - 40, sun[1] - 40, sun[0] + 40, sun[1] + 40], fill=(245, 230, 160))
    horizon = int(h * rng.uniform(0.55, 0.7))
    ridge = [horizon]
    for _ in range(6):
        ridge.append(horizon - rng.randint(40, 160))
    ridge.append(horizon)
    pts = [(0, h)]
    for i, y in enumerate(ridge):
        pts.append(((w // 5) * (i + 1), y))
    pts.append((w, h))
    draw.polygon(pts, fill=(45 + rng.randint(0, 30), 55 + rng.randint(0, 30), 40 + rng.randint(0, 20)))
    noise = np.array(img, dtype=np.int16)
    noise += np_random.integers(-12, 12, size=noise.shape, dtype=np.int16)
    return Image.fromarray(np.clip(noise, 0, 255).astype("uint8"), "RGB")


def _texture_patch(rng: random.Random, size=(260, 180), cell: int = 8) -> Image.Image:
    """High-contrast checkerboard patch with edge blur — simulates real edited content."""
    w, h = size
    arr = np.zeros((h, w, 3), dtype=np.uint8)
    shades = [(rng.randint(160, 235), rng.randint(160, 235), rng.randint(160, 235)),
              (rng.randint(15, 70), rng.randint(15, 70), rng.randint(15, 70))]
    for y in range(h):
        for x in range(w):
            arr[y, x] = shades[((x // cell) + (y // cell)) % 2]
    img = Image.fromarray(arr, "RGB")
    return img.filter(ImageFilter.GaussianBlur(0.6))


def _gen_images():
    rng = random.Random(SEED)
    clean_dir = os.path.join(DATA_DIR, "image", "clean")
    mod_dir = os.path.join(DATA_DIR, "image", "modified")
    os.makedirs(clean_dir, exist_ok=True)
    os.makedirs(mod_dir, exist_ok=True)

    # Clean: rendered scene, saved once at high quality (simulates camera output).
    for i in range(10):
        img = _render_scene(rng)
        img.save(os.path.join(clean_dir, f"clean_{i:02d}.jpg"), quality=92)

    # Modified variants:
    for i in range(10):
        base = _render_scene(rng)
        kind = i % 4
        out = os.path.join(mod_dir, f"modified_{i:02d}_{['splice', 'resave', 'filter', 'overlay'][kind]}.jpg")
        if kind == 0:  # splice: paste a textured donor region (real localized tamper)
            donor = _texture_patch(rng)
            box = (rng.randint(50, 350), rng.randint(50, 250))
            base.paste(donor, box)
            base.save(out, quality=92)
        elif kind == 1:  # aggressive re-encode chain
            base.save(out, quality=55)
            Image.open(out).save(out, quality=70)
        elif kind == 2:  # global contrast/brightness filter
            base = ImageEnhance.Contrast(base).enhance(rng.uniform(1.25, 1.6))
            base = ImageEnhance.Brightness(base).enhance(rng.uniform(0.8, 1.2))
            base.save(out, quality=92)
        else:  # localized textured overlay (text-like block)
            patch = _texture_patch(rng, size=(rng.randint(140, 240), rng.randint(50, 90)))
            base.paste(patch, (rng.randint(100, 500), rng.randint(100, 350)))
            base.save(out, quality=92)


# ─── Videos ───────────────────────────────────────────────────────────────────

def _gen_videos():
    ff = _ffmpeg()
    clean_dir = os.path.join(DATA_DIR, "video", "clean")
    mod_dir = os.path.join(DATA_DIR, "video", "modified")
    os.makedirs(clean_dir, exist_ok=True)
    os.makedirs(mod_dir, exist_ok=True)

    # Clean: single-encode test pattern (baseline stream).
    for i in range(6):
        src = ["testsrc2", "smptebars", "mandelbrot"][i % 3]
        out = os.path.join(clean_dir, f"clean_{i:02d}.mp4")
        _run_ffmpeg([ff, "-y", "-v", "error", "-f", "lavfi", "-i",
                     f"{src}=size=640x360:rate=30", "-t", "3",
                     "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", out])

    # Modified:
    noise_clip = os.path.join(DATA_DIR, "_tmp_noise.mp4")
    _run_ffmpeg([ff, "-y", "-v", "error", "-f", "lavfi", "-i", "nullsrc=s=640x360:r=30",
                 "-vf", "noise=alls=60:allf=t+u", "-t", "1.5",
                 "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", noise_clip])
    src2_clip = os.path.join(DATA_DIR, "_tmp_testsrc2.mp4")
    _run_ffmpeg([ff, "-y", "-v", "error", "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=30",
                 "-t", "1.5", "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", src2_clip])
    box_clip = os.path.join(DATA_DIR, "_tmp_box.mp4")
    checker_png = os.path.join(DATA_DIR, "_tmp_checker.png")
    checker = np.zeros((360, 640, 3), dtype=np.uint8)
    dark = np.array([25, 25, 25], dtype=np.uint8)
    light = np.array([235, 235, 235], dtype=np.uint8)
    for y in range(120, 210):
        for x in range(220, 420):
            checker[y, x] = light if ((x // 8) + (y // 8)) % 2 else dark
    Image.fromarray(checker, "RGB").save(checker_png)
    _run_ffmpeg([ff, "-y", "-v", "error", "-loop", "1", "-i", checker_png,
                 "-t", "3", "-r", "30", "-c:v", "libx264", "-crf", "18",
                 "-pix_fmt", "yuv420p", box_clip])
    for i in range(6):
        kind = i % 3
        if kind == 0:  # re-encode chain (double compression)
            src = os.path.join(clean_dir, f"clean_{i % 6:02d}.mp4")
            out = os.path.join(mod_dir, f"modified_{i:02d}_reencode.mp4")
            _run_ffmpeg([ff, "-y", "-v", "error", "-i", src,
                         "-c:v", "libx264", "-crf", "32", "-pix_fmt", "yuv420p", out])
        elif kind == 1:  # spliced concatenation: clean pattern + high-texture noise clip
            out = os.path.join(mod_dir, f"modified_{i:02d}_splice.mp4")
            list_path = os.path.join(DATA_DIR, "_tmp_concat.txt")
            with open(list_path, "w", encoding="utf-8") as lst:
                lst.write(f"file '{src2_clip.replace(os.sep, '/')}'\n")
                lst.write(f"file '{noise_clip.replace(os.sep, '/')}'\n")
            _run_ffmpeg([ff, "-y", "-v", "error", "-f", "concat", "-safe", "0",
                         "-i", list_path, "-c:v", "libx264", "-crf", "18",
                         "-pix_fmt", "yuv420p", out])
            os.unlink(list_path)
        else:  # localized textured overlay box (noise-filled rectangle)
            src = os.path.join(clean_dir, f"clean_{(i + 2) % 6:02d}.mp4")
            out = os.path.join(mod_dir, f"modified_{i:02d}_overlay.mp4")
            _run_ffmpeg([ff, "-y", "-v", "error", "-i", src, "-i", box_clip,
                         "-filter_complex", "[1:v]format=yuv420p[box];[0:v][box]overlay=x=220:y=120[out]",
                         "-map", "[out]", "-c:v", "libx264", "-crf", "18",
                         "-pix_fmt", "yuv420p", out])
    os.unlink(noise_clip)
    os.unlink(src2_clip)
    os.unlink(box_clip)


# ─── Audio ────────────────────────────────────────────────────────────────────

def _write_wav(path: str, samples: np.ndarray, rate: int = 44100):
    pcm = np.clip(samples, -1.0, 1.0)
    data = (pcm * 32767).astype("<i2")
    with wave.open(path, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(rate)
        wf.writeframes(data.tobytes())


def _natural_speech(rng: random.Random, rate: int = 44100) -> np.ndarray:
    """Speech-like synthesis: syllables with formant stacks, pitch glide, breath noise."""
    t_total = 0.0
    parts = []
    base_f0 = rng.uniform(110, 150)
    for _ in range(rng.randint(5, 7)):
        dur = rng.uniform(0.16, 0.3)
        f0 = base_f0 * rng.uniform(0.9, 1.15)
        glide = rng.uniform(-15, 15)
        n = int(dur * rate)
        t = np.arange(n) / rate
        sig = np.zeros(n)
        amps = [1.0, rng.uniform(0.35, 0.6), rng.uniform(0.15, 0.35),
                rng.uniform(0.08, 0.2), rng.uniform(0.04, 0.12), rng.uniform(0.02, 0.08)]
        for h, a in enumerate(amps, start=1):
            phase = rng.uniform(0, 2 * np.pi)
            f_inst = f0 * h * (1 + glide * h * 0.01 * np.sin(2 * np.pi * 3.2 * t + phase))
            sig += a * np.sin(2 * np.pi * f_inst * t + phase)
        env = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 1.5
        sig = sig * env
        parts.append(sig)
        t_total += dur
    voice = np.concatenate(parts) if parts else np.zeros(int(t_total * rate))
    breath = np_random.normal(0, 0.02, voice.size)
    return (voice / (np.max(np.abs(voice)) + 1e-9) * 0.8 + breath).astype(np.float32)


def _gen_audio():
    rng = random.Random(SEED)
    clean_dir = os.path.join(DATA_DIR, "audio", "clean")
    mod_dir = os.path.join(DATA_DIR, "audio", "modified")
    os.makedirs(clean_dir, exist_ok=True)
    os.makedirs(mod_dir, exist_ok=True)
    ff = _ffmpeg()

    for i in range(8):
        _write_wav(os.path.join(clean_dir, f"clean_{i:02d}.wav"), _natural_speech(rng))

    # Modified variants:
    for i in range(6):
        kind = i % 3
        out_base = os.path.join(mod_dir, f"modified_{i:02d}_")
        if kind == 0:  # TTS-like monotone tone
            t = np.arange(int(2.0 * 44100)) / 44100
            _write_wav(out_base + "monotone.wav", 0.6 * np.sin(2 * np.pi * 220 * t))
        elif kind == 1:  # lossy MP3 re-encode of a natural clip
            src = os.path.join(clean_dir, f"clean_{i % 8:02d}.wav")
            mp3 = out_base + "tmp.mp3"
            out = out_base + "mp3_reencode.wav"
            _run_ffmpeg([ff, "-y", "-v", "error", "-i", src, "-codec:a", "libmp3lame",
                         "-b:a", "64k", mp3])
            _run_ffmpeg([ff, "-y", "-v", "error", "-i", mp3, out])
            os.unlink(mp3)
        else:  # truncated short clip (insufficient data)
            src = os.path.join(clean_dir, f"clean_{(i + 1) % 8:02d}.wav")
            with wave.open(src, "rb") as wf:
                frames = wf.readframes(wf.getnframes())
            with wave.open(out_base + "short.wav", "wb") as wf:
                wf.setnchannels(1)
                wf.setsampwidth(2)
                wf.setframerate(44100)
                wf.writeframes(frames[: int(0.4 * 44100) * 2])


# ─── URLs ─────────────────────────────────────────────────────────────────────

def _gen_urls():
    urls = [
        {"url": "https://www.google.com", "malicious": False},
        {"url": "https://github.com", "malicious": False},
        {"url": "https://www.wikipedia.org", "malicious": False},
        {"url": "https://www.linkedin.com", "malicious": False},
        {"url": "https://www.amazon.com", "malicious": False},
        {"url": "https://stackoverflow.com", "malicious": False},
        {"url": "https://www.youtube.com", "malicious": False},
        {"url": "https://news.ycombinator.com", "malicious": False},
        {"url": "https://paypal.com", "malicious": False},
        {"url": "https://netflix.com", "malicious": False},
        {"url": "https://www.reddit.com", "malicious": False},
        {"url": "https://mail.google.com", "malicious": False},

        {"url": "http://paytm-kyc-verify-update.in/auth", "malicious": True},
        {"url": "http://google-secure-login.xyz", "malicious": True},
        {"url": "http://paypal-account-verify.tk", "malicious": True},
        {"url": "https://amazon-free-gift.club", "malicious": True},
        {"url": "http://netflix-billing-update.info", "malicious": True},
        {"url": "http://fb-secure-login.cc", "malicious": True},
        {"url": "http://icici-bank-verify.work", "malicious": True},
        {"url": "https://sbi-kyc-update.online", "malicious": True},
        {"url": "http://fedex-delivery-support.top", "malicious": True},
        {"url": "http://free-gift-card.ml", "malicious": True},
        {"url": "https://paytm-wallet-verify.cf", "malicious": True},
        {"url": "http://hdfc-netbanking-auth.gq", "malicious": True},
    ]
    with open(os.path.join(DATA_DIR, "urls.json"), "w", encoding="utf-8") as f:
        json.dump(urls, f, indent=2)


def main():
    print("Generating benchmark dataset in:", DATA_DIR)
    _gen_images()
    print("  [OK] images (10 clean + 10 modified)")
    _gen_videos()
    print("  [OK] videos (6 clean + 6 modified)")
    _gen_audio()
    print("  [OK] audio (8 clean + 6 modified)")
    _gen_urls()
    print("  [OK] urls (12 safe + 12 phishing)")


if __name__ == "__main__":
    main()
