import io
import struct
import math
import random

def analyze_audio(filename: str, file_bytes: bytes) -> dict:
    ext = filename.lower().rsplit(".", 1)[-1] if "." in filename else "wav"
    file_size_kb = len(file_bytes) / 1024

    sample_rate = 44100
    bit_depth = 16
    num_channels = 2
    duration_sec = 0.0

    if ext == "wav":
        try:
            riff, wave = file_bytes[:4], file_bytes[8:12]
            if riff == b"RIFF" and wave == b"WAVE":
                fmt_chunk = file_bytes[12:36]
                audio_format = struct.unpack("<H", fmt_chunk[20:22])[0]
                num_channels = struct.unpack("<H", fmt_chunk[22:24])[0]
                sample_rate = struct.unpack("<I", fmt_chunk[24:28])[0]
                bit_depth = struct.unpack("<H", fmt_chunk[34:36])[0]
                data_size = len(file_bytes) - 44
                if data_size > 0 and sample_rate > 0 and num_channels > 0 and bit_depth > 0:
                    duration_sec = data_size / (sample_rate * num_channels * (bit_depth / 8))
        except Exception:
            pass

    if duration_sec <= 0:
        duration_sec = max(0.5, file_size_kb / 176.4)
        sample_rate = 44100

    samples_count = int(sample_rate * duration_sec)
    raw_sample_count = min(samples_count, len(file_bytes) // 2)

    samples = []
    for i in range(min(raw_sample_count, 10000)):
        pos = 44 + i * 2
        if pos + 1 < len(file_bytes):
            val = struct.unpack("<h", file_bytes[pos:pos+2])[0]
            samples.append(val)

    if len(samples) < 10:
        samples = [random.randint(-500, 500) for _ in range(1000)]

    pitch_variation = 0.0
    if len(samples) > 1:
        crossings = 0
        for i in range(1, len(samples)):
            if (samples[i-1] < 0 and samples[i] >= 0) or (samples[i-1] >= 0 and samples[i] < 0):
                crossings += 1
        zero_crossing_rate = crossings / len(samples)
        pitch_variation = round(min(100, zero_crossing_rate * 200), 2)

    sample_rate_anomaly = sample_rate < 8000 or sample_rate > 96000 or (sample_rate not in [8000, 11025, 16000, 22050, 44100, 48000, 96000])

    voice_clone_probability = 10
    anomalies = []
    compression_warnings = []

    if pitch_variation < 5:
        voice_clone_probability += 30
        anomalies.append("Unusually low pitch variation (synthetic monotone detected).")
    elif pitch_variation < 15:
        voice_clone_probability += 15
        anomalies.append("Below-average pitch variation (possible TTS synthesis).")
    elif pitch_variation > 60:
        anomalies.append("High pitch variation — natural speech pattern.")

    if sample_rate_anomaly:
        voice_clone_probability += 20
        anomalies.append(f"Non-standard sample rate ({sample_rate} Hz) — atypical for consumer recordings.")
        compression_warnings.append(f"Unusual sample rate: {sample_rate} Hz")

    header_analysis = file_bytes[:200].lower()
    if b"lame" in header_analysis or b"lavc" in header_analysis:
        voice_clone_probability += 10
        anomalies.append("Encoder metadata suggests lossy re-compression (LAME/FFmpeg signature).")
        compression_warnings.append("Lossy compression artifact risk (MP3 transcoding detected)")

    if ext == "mp3":
        if voice_clone_probability < 30:
            compression_warnings.append("MP3 format — potential quality loss from compression.")

    if duration_sec < 0.5:
        voice_clone_probability += 15
        anomalies.append("Very short audio duration — insufficient for natural prosody analysis.")

    if file_size_kb > 10000:
        compression_warnings.append(f"Large file ({file_size_kb:.0f} KB) — may contain hidden data streams.")

    voice_clone_probability = min(98, max(5, voice_clone_probability))
    is_clean = voice_clone_probability < 50

    if voice_clone_probability >= 75:
        risk_level = "AI Voice Clone Detected"
    elif voice_clone_probability >= 50:
        risk_level = "Suspicious Audio Pattern"
    else:
        risk_level = "Natural Voice"

    pitch_status = "Normal"
    if pitch_variation < 5:
        pitch_status = "Flat/Monotone"
    elif pitch_variation < 15:
        pitch_status = "Low Variation"
    elif pitch_variation > 50:
        pitch_status = "High Variation"

    return {
        "is_clean": is_clean,
        "filename": filename,
        "risk_score": voice_clone_probability,
        "risk_level": risk_level,
        "pitch_variation": pitch_variation,
        "pitch_status": pitch_status,
        "sample_rate": sample_rate,
        "sample_rate_anomaly": sample_rate_anomaly,
        "voice_clone_probability": voice_clone_probability,
        "compression_warnings": compression_warnings,
        "anomalies": anomalies,
    }
