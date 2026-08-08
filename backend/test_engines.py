"""Unit tests for the four detection engines.

These tests are offline: URL analysis is lexical, cv_engine runs on generated
PIL images, and audio/video engines are exercised through their honest
metadata-only fallback paths (no ffmpeg required in CI).
"""
import io

import numpy as np
import pytest
from PIL import Image

from app import audio_engine, video_engine
from app.cv_engine import perform_ela, _blockiness, detect_ai_generation
from app.url_engine import analyze_url, calculate_shannon_entropy


# ─── URL Engine (lexical, fully offline) ─────────────────────────────────────

def test_url_clean_site_is_safe():
    result = analyze_url("https://example.com")
    assert result["risk_score"] == 5
    assert result["risk_level"] == "Low Risk (Safe)"


def test_url_insecure_http_adds_risk():
    result = analyze_url("http://example.com")
    assert result["risk_score"] >= 25


def test_url_typosquatting_is_high_risk():
    result = analyze_url("http://paytm-kyc-verify-update.in/auth")
    assert result["risk_score"] >= 70
    assert result["risk_level"] == "High Risk (Phishing Suspect)"
    assert any(flag["type"] == "danger" for flag in result["flags"])


def test_url_suspicious_tld():
    result = analyze_url("https://free-gift-coupon.xyz")
    assert result["risk_score"] >= 20


def test_url_entropy_is_stable():
    assert calculate_shannon_entropy("a") == 0.0
    assert calculate_shannon_entropy("ab") == 1.0


# ─── Image / cv_engine ───────────────────────────────────────────────────────

def _image_bytes(img):
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


@pytest.fixture()
def clean_image_bytes():
    img = Image.fromarray(np.linspace(0, 255, 256 * 256, dtype=np.uint8).reshape(256, 256))
    return _image_bytes(img.convert("RGB"))


def test_clean_image_low_risk(clean_image_bytes):
    _, risk_score, anomalies = perform_ela(clean_image_bytes)
    assert risk_score <= 20
    assert any("single-compression" in a for a in anomalies)


def test_tampered_image_high_risk():
    rng = np.random.default_rng(42)
    base = rng.integers(0, 255, size=(256, 256, 3), dtype=np.uint8)
    patch = np.dstack([np.indices((64, 64)).sum(axis=0) % 255] * 3).astype(np.uint8)
    base[96:160, 96:160] = patch
    tampered = _image_bytes(Image.fromarray(base, "RGB"))
    _, risk_score, anomalies = perform_ela(tampered)
    assert risk_score >= 40
    assert any("Non-uniform" in a or "localized" in a for a in anomalies)


def test_blockiness_orders_images():
    grid = np.arange(32 * 32, dtype=np.uint8).reshape(32, 32) % 64
    blocks = np.kron(grid, np.ones((8, 8), dtype=np.uint8))
    smooth = np.tile(np.linspace(0, 255, 256, dtype=np.uint8), (256, 1))
    assert _blockiness(Image.fromarray(blocks)) > _blockiness(Image.fromarray(smooth))


def test_detect_ai_generation_returns_structured_output(clean_image_bytes):
    is_ai, probability, indicators = detect_ai_generation(clean_image_bytes, "photo.png", {})
    assert isinstance(is_ai, bool)
    assert 0 <= probability <= 100


# ─── Audio Engine (fallback path, no ffmpeg) ─────────────────────────────────

def test_audio_fallback_is_honest_when_ffmpeg_missing(monkeypatch):
    monkeypatch.setattr(audio_engine, "_ffmpeg_binary", lambda: None)
    result = audio_engine.analyze_audio("clip.wav", b"RIFFxxxxWAVEjunk")
    assert result["is_clean"] is True
    assert result["risk_score"] == 5
    assert result["risk_level"] == "Analysis Unavailable"
    assert any("no frame analysis" in a.lower() for a in result["anomalies"])


def test_audio_pcm_stats_isolate_prosody():
    rng = np.random.default_rng(7)
    quiet_monotone = np.sin(2 * np.pi * 440 * np.arange(16000 * 2) / 16000).astype(np.float32) * 0.3
    varied_speech = (rng.normal(size=16000 * 2) * 0.5).astype(np.float32)
    quiet_stats = audio_engine._pcm_stats(quiet_monotone)
    varied_stats = audio_engine._pcm_stats(varied_speech)
    assert quiet_stats["zcr_cv"] < varied_stats["zcr_cv"]


# ─── Video Engine (fallback path, no ffmpeg) ─────────────────────────────────

def test_video_fallback_is_honest_when_ffmpeg_missing(monkeypatch):
    monkeypatch.setattr(video_engine, "_check_ffmpeg", lambda: False)
    result = video_engine.analyze_video("clip.mp4", b"\x00\x00\x00\x18ftypmp42")
    assert result["is_clean"] is True
    assert result["risk_score"] == 5
    assert result["risk_level"] == "Analysis Unavailable"
    assert len(result["timeline"]) == 20
    assert all(item["status"] == "clean" for item in result["timeline"])
