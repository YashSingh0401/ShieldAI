import os
import struct
import subprocess
import tempfile

import numpy as np

FFMPEG_EXE = None


def _ffmpeg_binary():
    """Locate an ffmpeg binary: system PATH first, then the binary bundled with imageio-ffmpeg."""
    global FFMPEG_EXE
    if FFMPEG_EXE:
        return FFMPEG_EXE
    try:
        import shutil

        exe = shutil.which("ffmpeg")
        if not exe:
            from imageio_ffmpeg import get_ffmpeg_exe
            exe = get_ffmpeg_exe()
        if exe and os.path.exists(exe):
            FFMPEG_EXE = exe
            return exe
    except Exception:
        pass
    return None


def _decode_pcm(file_bytes: bytes, ext: str):
    """
    Decodes any supported audio container to 16-bit mono PCM at 16 kHz using ffmpeg.
    Returns (samples, None) on success or (None, error_message) on failure.
    """
    exe = _ffmpeg_binary()
    if not exe:
        return None, "ffmpeg not available on this system"
    fd, path = tempfile.mkstemp(suffix=ext or ".wav")
    os.close(fd)
    try:
        with open(path, "wb") as f:
            f.write(file_bytes)
        proc = subprocess.run(
            [
                exe,
                "-v", "error",
                "-i", path,
                "-f", "s16le",
                "-ac", "1",
                "-ar", "16000",
                "-",
            ],
            capture_output=True,
            timeout=30,
        )
        if proc.returncode != 0 or not proc.stdout:
            detail = proc.stderr[:300].decode("utf-8", errors="ignore") or "empty decode output"
            return None, detail.splitlines()[-1] if detail.splitlines() else detail
        samples = np.frombuffer(proc.stdout, dtype="<i2").astype(np.float32)
        if samples.size == 0:
            return None, "no audio frames decoded"
        return samples, None
    except Exception as e:
        return None, str(e)
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass


def _pcm_stats(samples: np.ndarray) -> dict:
    """Compute real signal statistics from decoded PCM samples."""
    n = int(samples.size)
    sign = np.signbit(samples).astype(np.int8)

    # Global zero-crossing rate (speech typically 0.03-0.15 at 16 kHz)
    zcr = float(np.mean(np.abs(np.diff(sign))))

    # Prosodic variation: coefficient of variation of short-window ZCR (100 ms windows)
    window = 1600
    n_windows = max(1, n // window)
    usable = n_windows * window
    frames = samples[:usable].reshape(n_windows, window)
    zcrs = np.mean(np.abs(np.diff(np.signbit(frames).astype(np.int8), axis=1)), axis=1)
    rms_windows = np.sqrt(np.mean(frames.astype(np.float64) ** 2, axis=1))
    zcr_cv = float(np.std(zcrs) / max(1e-6, np.mean(zcrs)))
    rms_cv = float(np.std(rms_windows) / max(1e-6, np.mean(rms_windows)))

    # Spectral flatness: geometric mean / arithmetic mean of magnitude spectrum.
    # Near 1.0 = noise-like (natural breath/noise), near 0.0 = strong tonal (synthetic).
    frame = 400
    hop = 200
    n_frames = min(60, max(1, (n - frame) // hop))
    flats = []
    dom_freqs = []
    for i in range(n_frames):
        start = i * hop
        seg = samples[start:start + frame] * np.hanning(frame)
        mag = np.abs(np.fft.rfft(seg)) + 1e-12
        flats.append(float(np.exp(np.mean(np.log(mag))) / max(np.mean(mag), 1e-12)))
        dom_freqs.append(float(np.argmax(mag)))
    spectral_flatness = float(np.mean(flats)) if flats else 0.5
    dom_freqs = np.array(dom_freqs, dtype=float) * (16000.0 / frame)
    dom_cv = float(np.std(dom_freqs) / max(1e-6, np.mean(dom_freqs))) if dom_freqs.size else 1.0

    return {
        "n": n,
        "duration_sec": n / 16000.0,
        "zcr": zcr,
        "zcr_cv": zcr_cv,
        "rms_cv": rms_cv,
        "silence_ratio": float(np.mean(np.abs(samples) < 200)),
        "spectral_flatness": spectral_flatness,
        "dom_cv": dom_cv,
        # ── Phase 3: High-band spectral flatness (8-16 kHz) ───────────────────
        # MP3/AAC encoding either hard-cuts or smears high frequencies.
        # Natural speech:  SFM_highband ~0.15-0.45 (mixed noise + harmonics)
        # Hard MP3 cutoff: SFM_highband < 0.05 (near-silent flat floor)
        # MP3 noise floor: SFM_highband > 0.70 (noise-like smear above cutoff)
        # Single measure catches both patterns.
        "sfm_highband": _sfm_highband(samples, sr=16000),
    }


# ─────────────────────────────────────────────────────────────────
# ENGINE C — AASIST-Inspired Voice Clone & Vocoder Detector (pure DSP)
# ─────────────────────────────────────────────────────────────────


def _sfm_highband(samples: np.ndarray, sr: int = 16000) -> float:
    """
    Spectral flatness measure for the high-frequency band (8 kHz – Nyquist).

    MP3/AAC re-encoding leaves two characteristic fingerprints:
      - Hard cutoff variant:  energy above cutoff freq → near-zero SFM (silent floor).
      - Noise-floor variant:  smeared quantisation noise → SFM close to 1.0 (noise-like).
    Natural speech sits in the middle (~0.15–0.45).

    Returns a float in [0, 1]. Values < 0.05 or > 0.70 are anomalous.
    Returns 0.25 (neutral) if the signal is too short or SR too low.
    """
    try:
        n = samples.size
        if n < 2048 or sr < 16000:
            return 0.25  # neutral — not enough data or too low SR for 8 kHz band
        # Use the full signal for FFT stability
        mag = np.abs(np.fft.rfft(samples.astype(np.float64))) + 1e-12
        freqs = np.fft.rfftfreq(n, d=1.0 / sr)
        # Isolate 8 kHz – Nyquist
        mask = freqs >= 8000
        if mask.sum() < 16:
            return 0.25  # band too narrow — neutral
        band = mag[mask]
        sfm = float(np.exp(np.mean(np.log(band))) / (np.mean(band) + 1e-12))
        return float(np.clip(sfm, 0.0, 1.0))
    except Exception:
        return 0.25

def detect_voice_clone_advanced(samples: np.ndarray, sample_rate: int = 16000) -> dict:
    """
    AASIST-inspired pure-DSP voice clone detector (no external model weights).

    Layers:
      1. Cepstral Liftering Residual — vocoders produce unnaturally smooth MFCC trajectories.
      2. Harmonic-to-Noise Ratio (HNR) — real voice 15-25 dB; vocoders >30 or <8.
      3. Sub-band Energy Distribution — TTS over-generates 6-8 kHz.
      4. Glottal Pulse Irregularity (jitter) — real 0.3-1.5%, vocoders ~0.

    Returns {voice_clone_risk, hnr_db, cepstral_delta_variance, subband_highfreq_ratio, jitter_pct, vocoder_signals[]}
    """
    try:
        if samples is None or samples.size < 1600:
            return {
                "voice_clone_risk": 5,
                "hnr_db": 0.0,
                "cepstral_delta_variance": 0.0,
                "subband_highfreq_ratio": 0.0,
                "jitter_pct": 0.0,
                "vocoder_signals": ["Insufficient samples for voice clone analysis."],
            }

        # Normalise to float -1..1 for DSP
        s = samples.astype(np.float64)
        if np.max(np.abs(s)) > 1.0:
            s = s / 32768.0
        n = s.size
        sr = int(sample_rate) if sample_rate else 16000

        # ── 1. Cepstral delta variance (manual MFCC proxy) ─────────
        frame = 512
        hop = 256
        n_frames = max(1, (n - frame) // hop)
        n_frames = min(n_frames, 80)
        cepstra = []
        for i in range(n_frames):
            seg = s[i*hop:i*hop+frame] * np.hanning(frame)
            mag = np.abs(np.fft.rfft(seg, n=512)) + 1e-12
            log_mag = np.log(mag)
            # DCT-II as cepstral transform (keep 20 coeffs)
            cep = np.fft.rfft(log_mag).real[:20]
            cepstra.append(cep)
        cepstra = np.array(cepstra)  # [T, 20]
        # Delta variance in mid bands (coeffs 2-8 ~ 2-4 kHz proxy)
        if cepstra.shape[0] >= 3:
            deltas = np.diff(cepstra, axis=0)
            mid_deltas = deltas[:, 2:9] if deltas.shape[1] >= 9 else deltas[:, 2:]
            cepstral_delta_variance = float(np.mean(np.var(mid_deltas, axis=0))) if mid_deltas.size else 0.0
        else:
            cepstral_delta_variance = 0.0

        # ── 2. HNR via autocorrelation peak ─────────────────────────
        # Use middle 1-2 sec for stability
        mid = s[max(0, n//2 - sr): min(n, n//2 + sr)]
        if mid.size < sr//2:
            mid = s
        mid = mid - np.mean(mid)
        mid = mid / (np.max(np.abs(mid)) + 1e-9)
        # Normalized autocorrelation
        try:
            corr = np.correlate(mid, mid, mode='full')
            corr = corr[len(corr)//2:]
            corr = corr / (corr[0] + 1e-12)
            # Search pitch lag 40..400 samples (40-400 Hz at 16kHz)
            lo, hi = max(40, sr//400), min(400, sr//40, len(corr)-1)
            if hi > lo:
                peak = float(np.max(corr[lo:hi]))
                peak = np.clip(peak, 1e-4, 0.9999)
                hnr_db = float(10 * np.log10(peak / (1 - peak + 1e-12)))
                hnr_db = np.clip(hnr_db, -10, 40)
            else:
                hnr_db = 15.0
                peak = 0.5
        except Exception:
            hnr_db = 15.0
            peak = 0.5

        # ── 3. Sub-band energy 6-8 kHz ratio ──────────────────────
        try:
            # Zero-pad to next pow2 for stable bins
            mag_full = np.abs(np.fft.rfft(s * np.hanning(n))) ** 2 + 1e-12
            freqs = np.fft.rfftfreq(n, d=1.0/sr)
            total_energy = float(np.sum(mag_full))
            mask_high = (freqs >= 6000) & (freqs <= 8000)
            high_energy = float(np.sum(mag_full[mask_high]))
            subband_highfreq_ratio = float(high_energy / (total_energy + 1e-12))
        except Exception:
            subband_highfreq_ratio = 0.05

        # ── 4. Glottal jitter (pulse interval irregularity) ───────
        try:
            # Find positive peaks above 0.25*max
            thresh = 0.25 * np.max(np.abs(s))
            # Simple peak picker: local maxima
            # Use 5ms min spacing (80 samples @16k)
            min_dist = max(40, sr // 200)
            peaks = []
            for i in range(1, n-1):
                if s[i] > thresh and s[i] > s[i-1] and s[i] > s[i+1]:
                    if not peaks or (i - peaks[-1]) >= min_dist:
                        peaks.append(i)
                    elif s[i] > s[peaks[-1]]:
                        peaks[-1] = i
            if len(peaks) >= 4:
                intervals = np.diff(np.array(peaks, dtype=float))
                mean_iv = float(np.mean(intervals))
                if mean_iv > 1e-6:
                    jitter_pct = float(np.std(intervals) / mean_iv * 100.0)
                else:
                    jitter_pct = 0.0
                jitter_pct = float(np.clip(jitter_pct, 0, 10))
            else:
                # Fallback: zero-cross interval jitter
                zc = np.where(np.diff(np.signbit(s).astype(int)) != 0)[0]
                if len(zc) >= 6:
                    iv = np.diff(zc.astype(float))
                    jitter_pct = float(np.std(iv) / (np.mean(iv)+1e-9) * 100.0)
                    jitter_pct = float(np.clip(jitter_pct, 0, 10))
                else:
                    jitter_pct = 0.0
        except Exception:
            jitter_pct = 0.0

        # ── Scoring ───────────────────────────────────────────────
        vocoder_signals = []
        risk = 5

        # Cepstral liftering: synthetic -> near-zero delta variance
        if cepstral_delta_variance < 0.002:
            risk += 35
            vocoder_signals.append(f"Near-zero cepstral delta variance ({cepstral_delta_variance:.4f}) — vocoder smooth trajectory (ElevenLabs/XTTS signature).")
        elif cepstral_delta_variance < 0.008:
            risk += 18
            vocoder_signals.append(f"Low cepstral delta variance ({cepstral_delta_variance:.4f}) — possible neural vocoder smoothing.")
        else:
            vocoder_signals.append(f"Natural cepstral trajectory variation ({cepstral_delta_variance:.4f}).")

        # HNR
        if hnr_db > 30:
            risk += 25
            vocoder_signals.append(f"Excessive HNR ({hnr_db:.1f} dB) — too-perfect harmonic structure (neural synthesis).")
        elif hnr_db < 8:
            risk += 20
            vocoder_signals.append(f"Degraded HNR ({hnr_db:.1f} dB) — noisy synthesis (GAN artifact).")
        elif 15 <= hnr_db <= 25:
            vocoder_signals.append(f"Natural HNR ({hnr_db:.1f} dB) — human phonation range.")
        else:
            vocoder_signals.append(f"HNR {hnr_db:.1f} dB — borderline natural range.")

        # Sub-band
        if subband_highfreq_ratio > 0.18:
            risk += 20
            vocoder_signals.append(f"Elevated 6-8 kHz energy ratio ({subband_highfreq_ratio:.3f}) — TTS articulation over-generation.")
        elif subband_highfreq_ratio > 0.12:
            risk += 10
            vocoder_signals.append(f"Moderate high-frequency boost ({subband_highfreq_ratio:.3f}).")
        else:
            vocoder_signals.append(f"Natural high-frequency roll-off ({subband_highfreq_ratio:.3f}).")

        # Jitter
        if jitter_pct < 0.20:
            risk += 20
            vocoder_signals.append(f"Near-zero glottal jitter ({jitter_pct:.3f}%) — perfectly periodic (vocoder).")
        elif jitter_pct < 0.30:
            risk += 10
            vocoder_signals.append(f"Low jitter ({jitter_pct:.3f}%) — below human micro-tremor range (0.3-1.5%).")
        elif 0.3 <= jitter_pct <= 1.5:
            vocoder_signals.append(f"Natural glottal jitter ({jitter_pct:.3f}%) — human muscle tremor signature.")
        else:
            # >1.5 can be natural expressive or GAN glitch — mild flag if >4
            if jitter_pct > 4.0:
                risk += 8
                vocoder_signals.append(f"High jitter ({jitter_pct:.3f}%) — irregular phonation (possible GAN artifact).")

        risk = int(np.clip(risk, 5, 95))

        return {
            "voice_clone_risk": risk,
            "hnr_db": round(float(hnr_db), 2),
            "cepstral_delta_variance": round(float(cepstral_delta_variance), 5),
            "subband_highfreq_ratio": round(float(subband_highfreq_ratio), 4),
            "jitter_pct": round(float(jitter_pct), 3),
            "vocoder_signals": vocoder_signals,
        }
    except Exception as e:
        return {
            "voice_clone_risk": 5,
            "hnr_db": 0.0,
            "cepstral_delta_variance": 0.0,
            "subband_highfreq_ratio": 0.0,
            "jitter_pct": 0.0,
            "vocoder_signals": [f"Voice clone analysis error: {e}"],
        }


def analyze_audio(filename: str, file_bytes: bytes) -> dict:
    """
    Analyzes audio using real decoded PCM data (never synthesized samples).
    If decoding is unavailable, only container-level metadata is reported.
    """
    ext = filename.lower().rsplit(".", 1)[-1] if "." in filename else "wav"
    file_size_kb = len(file_bytes) / 1024

    header_sample_rate = 0
    if ext == "wav" and len(file_bytes) > 44:
        try:
            if file_bytes[:4] == b"RIFF" and file_bytes[8:12] == b"WAVE":
                header_sample_rate = struct.unpack("<I", file_bytes[24:28])[0]
        except Exception:
            pass

    header_low = file_bytes[:200].lower()
    reencoded = b"lame" in header_low or b"lavf" in header_low or b"lame3" in header_low

    samples, decode_error = _decode_pcm(file_bytes, "." + ext)

    if samples is None:
        # Honest metadata-only fallback: we cannot analyze frames we do not have.
        risk = 5
        anomalies = [
            f"Audio decoding unavailable ({decode_error}). No frame analysis performed — "
            "this result reflects container metadata only."
        ]
        compression_warnings = []
        if reencoded:
            risk += 10
            anomalies.append("Encoder metadata suggests lossy re-compression (LAME/FFmpeg signature).")
            compression_warnings.append("Lossy compression artifact risk (MP3 transcoding detected)")
        risk = min(98, max(5, risk))
        is_clean = risk < 50
        return {
            "is_clean": is_clean,
            "filename": filename,
            "risk_score": risk,
            "risk_level": "Analysis Unavailable" if risk < 50 else "Suspicious Audio Pattern",
            "pitch_variation": 0.0,
            "pitch_status": "Unknown",
            "sample_rate": header_sample_rate or 16000,
            "sample_rate_anomaly": False,
            "voice_clone_probability": float(risk),
            "compression_warnings": compression_warnings,
            "anomalies": anomalies,
            "voice_clone_risk": int(risk),
            "hnr_db": 0.0,
            "cepstral_delta_variance": 0.0,
            "subband_highfreq_ratio": 0.0,
            "jitter_pct": 0.0,
            "vocoder_signals": ["Analysis unavailable — decoding failed."],
        }

    stats = _pcm_stats(samples)
    duration_sec = stats["duration_sec"]
    sample_rate = header_sample_rate or 16000
    sample_rate_anomaly = header_sample_rate not in (0, 8000, 11025, 16000, 22050, 44100, 48000, 96000)

    # Prosody proxy: how much the zero-crossing rate varies over time (0-100 scale).
    pitch_variation = round(min(100.0, max(2.0, stats["zcr_cv"] * 110.0)), 2)

    risk = 10
    anomalies = []
    compression_warnings = []

    if duration_sec < 0.7:
        risk += 20
        anomalies.append("Very short audio duration — insufficient for natural prosody analysis.")

    if stats["zcr_cv"] < 0.25:
        risk += 25
        anomalies.append("Unusually flat prosody (near-constant zero-crossing rate) — synthetic monotone profile.")
    elif stats["zcr_cv"] < 0.5:
        risk += 12
        anomalies.append("Below-average prosodic variation — possible TTS synthesis.")
    else:
        anomalies.append("Natural modulation: prosody varies across the clip.")

    if stats["rms_cv"] < 0.15:
        risk += 10
        anomalies.append("Flat energy envelope — no natural amplitude modulation (typical of synthetic rendering).")

    if stats["spectral_flatness"] < 0.08:
        risk += 15
        anomalies.append(
            "Strong tonal character (very low spectral flatness) — consistent with synthesized tones rather than speech."
        )

    if reencoded:
        risk += 10
        anomalies.append("Encoder metadata suggests lossy re-compression (LAME/FFmpeg signature).")
        compression_warnings.append("Lossy compression artifact risk (MP3 transcoding detected)")

    if sample_rate_anomaly:
        risk += 20
        anomalies.append(f"Non-standard sample rate ({sample_rate} Hz) — atypical for consumer recordings.")
        compression_warnings.append(f"Unusual sample rate: {sample_rate} Hz")

    # ── Phase 3: High-band SFM — MP3/AAC re-encode detection ─────────────────
    sfm_hb = stats.get("sfm_highband", 0.25)
    if sfm_hb < 0.05:
        risk += 25
        anomalies.append(
            f"High-frequency band cutoff detected (SFM_highband={sfm_hb:.3f} < 0.05) — "
            "characteristic hard cutoff consistent with MP3/AAC lossy re-encoding. "
            "Original high-frequency content has been discarded and replaced with a noise floor."
        )
        compression_warnings.append("MP3/AAC high-frequency cutoff detected (SFM_highband < 0.05)")
    elif sfm_hb > 0.70:
        risk += 20
        anomalies.append(
            f"High-frequency noise smear detected (SFM_highband={sfm_hb:.3f} > 0.70) — "
            "quantisation noise above the encoding cutoff frequency, consistent with "
            "lossy re-compression (MP3/AAC) applied to a previously compressed source."
        )
        compression_warnings.append("High-band quantisation noise (SFM_highband > 0.70)")
    elif sfm_hb < 0.10:
        risk += 12
        anomalies.append(
            f"Slightly suppressed high-frequency content (SFM_highband={sfm_hb:.3f}) — "
            "borderline lossy compression artifact."
        )
    # ── end Phase 3 ───────────────────────────────────────────────────────────

    if file_size_kb > 10000:
        compression_warnings.append(f"Large file ({file_size_kb:.0f} KB) — may contain hidden data streams.")

    # ── Engine C — Voice clone advanced ──────────────────────────
    try:
        vc = detect_voice_clone_advanced(samples, 16000)
        # Fuse vc risk as secondary (weighted, does not fully override prosody risk)
        fused_risk = min(98, max(5, int(round(risk * 0.7 + vc["voice_clone_risk"] * 0.3))))
        # Append vocoder signals to anomalies for transparency
        for sig in vc.get("vocoder_signals", []):
            if "Natural" not in sig:
                anomalies.append(sig)
        risk = fused_risk
    except Exception as e:
        vc = {"voice_clone_risk": 5, "hnr_db": 0.0, "cepstral_delta_variance": 0.0, "subband_highfreq_ratio": 0.0, "jitter_pct": 0.0, "vocoder_signals": [f"VC fusion error: {e}"]}

    risk = min(98, max(5, risk))
    is_clean = risk < 50
    if risk >= 75:
        risk_level = "Synthetic Voice Suspect"
    elif risk >= 50:
        risk_level = "Suspicious Audio Pattern"
    else:
        risk_level = "Natural Voice"

    if pitch_variation < 5:
        pitch_status = "Flat/Monotone"
    elif pitch_variation < 15:
        pitch_status = "Low Variation"
    elif pitch_variation > 50:
        pitch_status = "High Variation"
    else:
        pitch_status = "Moderate Variation"

    return {
        "is_clean": is_clean,
        "filename": filename,
        "risk_score": risk,
        "risk_level": risk_level,
        "pitch_variation": pitch_variation,
        "pitch_status": pitch_status,
        "sample_rate": sample_rate,
        "sample_rate_anomaly": sample_rate_anomaly,
        "voice_clone_probability": float(risk),
        "compression_warnings": compression_warnings,
        "anomalies": anomalies,
        "voice_clone_risk": int(vc.get("voice_clone_risk", 5)),
        "hnr_db": float(vc.get("hnr_db", 0.0)),
        "cepstral_delta_variance": float(vc.get("cepstral_delta_variance", 0.0)),
        "subband_highfreq_ratio": float(vc.get("subband_highfreq_ratio", 0.0)),
        "jitter_pct": float(vc.get("jitter_pct", 0.0)),
        "vocoder_signals": list(vc.get("vocoder_signals", [])),
    }
