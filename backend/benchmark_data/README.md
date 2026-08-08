# Benchmark Dataset (Synthetic, Seeded)

Labeled samples for calibrating and measuring the four shieldAI engines.
Regenerate at any time: `python benchmark_data/generate_samples.py` (deterministic, seed 42).

## Structure

| Directory | Clean samples | Modified samples | Tamper types |
|---|---|---|---|
| `image/` | 10 `.jpg` (single-pass procedural photos) | 10 `.jpg` | splice, heavy re-encode (q55→q70), global filter, textured overlay |
| `video/` | 6 `.mp4` (single-encode test patterns) | 6 `.mp4` | splice (textured segment), uniform re-encode (crf18→crf32), static micro-overlay |
| `audio/` | 8 `.wav` (speech-like synthesis) | 6 `.wav` | monotone TTS-like tone, MP3 re-encode, truncated short clip |
| `urls.json` | 12 safe URLs | 12 phishing URLs | typosquat, bad TLD, keyword stuffing, insecure protocol |

## Honesty constraints

- This is a **synthetic** dataset: procedural images, generated test patterns, synthesized speech.
  It exercises the *signal types* each engine claims (ELA compression artifacts, JPEG blockiness,
  relative frame elevation, prosody statistics, lexical URL patterns).
- Results are **calibration indicators only**. Real-world validation (genuine camera photos vs
  AI images, known deepfakes, real voice recordings vs TTS/voice clones, live phishing domains)
  is a separate, required follow-up before any public accuracy claims.
- Known deliberately-hard cases are included so the benchmark shows honest limits:
  - uniform video re-encode (invisible to relative ELA)
  - static micro-overlays (spatial signal drowned by content structure)
  - lossy MP3 re-encode of speech (invisible to prosody features)
  - truncated short clips (engine deliberately reports "insufficient data", not suspicion)
