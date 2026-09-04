"""
Engine A — CLIP Semantic Coherence Detector
============================================
Uses OpenAI CLIP (ViT-B/32) to measure semantic coherence of an image.

AI-generated images are pixel-perfect but semantically incoherent:
  - Hands with wrong number of fingers
  - Garbled, unreadable text
  - Physically impossible shadows or reflections
  - Objects that don't belong together

CLIP embeds the image into a 512-dim semantic space and compares it
against "sanity probe" text descriptions. Low cosine similarity across
probes → high incoherence → likely AI-generated.

Graceful fallback: if open-clip-torch is not installed, returns a
neutral score with a descriptive warning rather than raising an error.
"""

import io
import numpy as np
from PIL import Image

# Probe texts — semantic properties real photographs reliably exhibit
_COHERENCE_PROBES = [
    "a realistic photograph of a real scene",
    "natural lighting with consistent shadows",
    "a real human hand with five fingers",
    "text that is legible and readable",
    "physically plausible objects and environment",
    "natural skin texture and pores",
    "coherent background and foreground depth",
]

_INCOHERENCE_PROBES = [
    "an AI-generated image",
    "a digitally synthesized scene",
    "artificial or dream-like imagery",
    "impossible or surreal composition",
]

# Lazy-loaded module-level state
_clip_model = None
_clip_preprocess = None
_clip_tokenizer = None
_clip_unavailable = False


def _load_clip():
    """Load CLIP model once, lazily. Sets _clip_unavailable if not installed."""
    global _clip_model, _clip_preprocess, _clip_tokenizer, _clip_unavailable
    if _clip_unavailable or _clip_model is not None:
        return _clip_model is not None
    try:
        import open_clip
        import torch
        model, _, preprocess = open_clip.create_model_and_transforms(
            "ViT-B-32", pretrained="openai"
        )
        model.eval()
        tokenizer = open_clip.get_tokenizer("ViT-B-32")
        _clip_model = model
        _clip_preprocess = preprocess
        _clip_tokenizer = tokenizer
        return True
    except ImportError:
        _clip_unavailable = True
        return False
    except Exception:
        _clip_unavailable = True
        return False


def clip_coherence_score(image_bytes: bytes) -> dict:
    """
    Compute semantic coherence score for an image using CLIP.

    Returns:
        dict with keys:
          - coherence_score: float 0.0–1.0 (higher = more coherent = more real)
          - incoherence_risk: int 0–100 (higher = more likely AI-generated)
          - is_incoherent: bool
          - probe_results: list of {probe, similarity} dicts
          - clip_signals: list of human-readable findings
          - clip_available: bool (False if open-clip-torch not installed)
    """
    if not _load_clip():
        return {
            "coherence_score": 0.5,
            "incoherence_risk": 5,
            "is_incoherent": False,
            "probe_results": [],
            "clip_signals": [
                "CLIP semantic analysis unavailable "
                "(pip install open-clip-torch to enable)."
            ],
            "clip_available": False,
        }

    try:
        import torch

        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        img_tensor = _clip_preprocess(img).unsqueeze(0)

        all_probes = _COHERENCE_PROBES + _INCOHERENCE_PROBES
        text_tokens = _clip_tokenizer(all_probes)

        with torch.no_grad():
            img_features = _clip_model.encode_image(img_tensor)
            txt_features = _clip_model.encode_text(text_tokens)

            # Normalize
            img_features = img_features / img_features.norm(dim=-1, keepdim=True)
            txt_features = txt_features / txt_features.norm(dim=-1, keepdim=True)

            # Cosine similarities
            similarities = (img_features @ txt_features.T).squeeze(0).tolist()

        coherence_sims = similarities[: len(_COHERENCE_PROBES)]
        incoherence_sims = similarities[len(_COHERENCE_PROBES) :]

        mean_coherence = float(np.mean(coherence_sims))
        mean_incoherence = float(np.mean(incoherence_sims))

        # Normalise to 0–1 range (CLIP similarities are typically -1 to 1)
        coherence_score = float(np.clip((mean_coherence + 1) / 2, 0.0, 1.0))
        incoherence_score = float(np.clip((mean_incoherence + 1) / 2, 0.0, 1.0))

        # Risk: high incoherence similarity + low coherence similarity → AI
        incoherence_risk = int(np.clip(
            (incoherence_score * 60) + ((1 - coherence_score) * 40), 0, 95
        ))

        # Build per-probe table
        probe_results = []
        for probe, sim in zip(_COHERENCE_PROBES, coherence_sims):
            probe_results.append({
                "probe": probe,
                "similarity": round(float(sim), 4),
                "type": "coherence",
            })
        for probe, sim in zip(_INCOHERENCE_PROBES, incoherence_sims):
            probe_results.append({
                "probe": probe,
                "similarity": round(float(sim), 4),
                "type": "incoherence",
            })

        # Signals
        clip_signals = []
        if coherence_score < 0.45:
            clip_signals.append(
                f"Low semantic coherence score ({coherence_score:.2f}) — "
                "image does not match typical real-world photographic patterns."
            )
        if incoherence_score > 0.55:
            clip_signals.append(
                f"High AI-generation similarity ({incoherence_score:.2f}) — "
                "CLIP embedding closely matches known synthetic/generated imagery."
            )
        # Find the weakest coherence probes
        weakest = sorted(
            zip(_COHERENCE_PROBES, coherence_sims), key=lambda x: x[1]
        )[:2]
        for probe, sim in weakest:
            if sim < 0.2:
                clip_signals.append(
                    f"Semantic probe failed: '{probe}' (similarity={sim:.3f})."
                )

        is_incoherent = incoherence_risk > 50
        if not clip_signals:
            clip_signals.append(
                f"CLIP semantic coherence analysis passed "
                f"(coherence={coherence_score:.2f}, ai_similarity={incoherence_score:.2f})."
            )

        return {
            "coherence_score": round(coherence_score, 4),
            "incoherence_risk": incoherence_risk,
            "is_incoherent": is_incoherent,
            "probe_results": probe_results,
            "clip_signals": clip_signals,
            "clip_available": True,
        }

    except Exception as e:
        return {
            "coherence_score": 0.5,
            "incoherence_risk": 5,
            "is_incoherent": False,
            "probe_results": [],
            "clip_signals": [f"CLIP analysis error: {e}"],
            "clip_available": True,
        }
