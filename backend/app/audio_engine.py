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

    if file_size_kb > 10000:
        compression_warnings.append(f"Large file ({file_size_kb:.0f} KB) — may contain hidden data streams.")

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
    }
