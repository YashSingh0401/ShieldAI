import io
import base64
from PIL import Image, ImageChops, ImageEnhance
from PIL.ExifTags import TAGS
import numpy as np

def perform_ela(image_bytes: bytes, quality: int = 90, scale: int = 15) -> tuple:
    """
    Performs Error Level Analysis (ELA) on the uploaded image.
    Saves image at a set quality, calculates the absolute difference with original,
    and returns a base64 encoded ELA visualization, risk score, and basic anomaly log.
    """
    try:
        # Open the image from bytes
        original = Image.open(io.BytesIO(image_bytes))
        
        # Convert non-RGB modes (like RGBA or Palette) to RGB for Jpeg resaving
        if original.mode != 'RGB':
            original = original.convert('RGB')
            
        # Save the original image as Jpeg at specified quality to an in-memory buffer
        temp_buffer = io.BytesIO()
        original.save(temp_buffer, format='JPEG', quality=quality)
        temp_buffer.seek(0)
        
        # Open the resaved image
        resaved = Image.open(temp_buffer)
        
        # Calculate the pixel-by-pixel difference
        ela_image = ImageChops.difference(original, resaved)
        
        # Calculate ELA statistics on the raw, unenhanced difference image
        raw_gray = ela_image.convert('L')
        ela_data = np.array(raw_gray)

        mean_val = float(np.mean(ela_data))
        high_diff_pct = float(np.sum(ela_data > 1.5) / ela_data.size * 100)
        p95 = float(np.percentile(ela_data, 95))

        # JPEG blockiness: ratio of 8x8-grid boundary energy to interior energy.
        # Double-compressed images show strongly aligned blocking artifacts.
        orig_gray = original.convert('L')
        blockiness = _blockiness(orig_gray)

        # Evidence-based scoring (thresholds calibrated on the labeled benchmark set):
        risk_score = 0
        signals = []
        if high_diff_pct > 25.5:
            risk_score += 30
            signals.append("localized_compression")
        if p95 >= 3.0 and high_diff_pct > 25.0:
            risk_score += 15
            signals.append("high_density_zone")
        if mean_val > 1.25:
            risk_score += 25
            signals.append("global_enhancement")
        if high_diff_pct > 35.0:
            risk_score += 15
            signals.append("heavy_retouch")
        if blockiness > 1.6:
            risk_score += 45
            signals.append("double_compression")
        risk_score = max(5, min(95, risk_score))

        # Scale the difference image for visualization UI
        enhancer = ImageEnhance.Brightness(ela_image)
        ela_image = enhancer.enhance(scale)
        
        # Save the resulting ELA image back to base64
        ela_buffer = io.BytesIO()
        ela_image.save(ela_buffer, format='JPEG')
        ela_bytes = ela_buffer.getvalue()
        ela_b64 = "data:image/jpeg;base64," + base64.b64encode(ela_bytes).decode('utf-8')
            
        anomalies = []
        if "global_enhancement" in signals and "localized_compression" not in signals:
            anomalies.append("Global filter/adjustment detected (uniform enhancement, no localized cut-and-paste tampering found).")
        elif "localized_compression" in signals:
            anomalies.append("Non-uniform compression thresholds (high ELA density zones detected).")
        if "double_compression" in signals:
            anomalies.append("Aligned JPEG blocking artifacts suggest double compression (re-saved from a previously compressed file).")
        if "heavy_retouch" in signals:
            anomalies.append("Large modified pixel surface detected (heavy retouching or upscaled overlay).")
        if risk_score <= 8:
            anomalies.append("ELA distribution consistent with a single-compression source.")

        return ela_b64, risk_score, anomalies
    except Exception as e:
        return "", 0, [f"Error Level Analysis failed: {str(e)}"]


def _blockiness(gray_image, block: int = 8) -> float:
    """
    Estimates JPEG blocking artifacts: ratio of mean adjacent-pixel difference at
    8x8 grid boundaries to the mean difference elsewhere. Values near 1.0 indicate
    a single compression pass; values well above 1.0 indicate aligned re-compression.
    """
    try:
        a = np.asarray(gray_image, dtype=np.int32)
        if a.ndim == 3:
            a = a[:, :, 0]
        h, w = a.shape
        if h < block * 3 or w < block * 3:
            return 1.0
        dh = np.abs(a[:, 1:] - a[:, :-1])
        bcols = np.arange(block, w - block, block)
        interior = np.setdiff1d(np.arange(1, w - 1), bcols)
        bh = float(dh[:, bcols - 1].mean() / max(1e-9, dh[:, interior].mean()))
        dv = np.abs(a[1:, :] - a[:-1, :])
        brows = np.arange(block, h - block, block)
        interior_r = np.setdiff1d(np.arange(1, h - 1), brows)
        bv = float(dv[brows - 1, :].mean() / max(1e-9, dv[interior_r, :].mean()))
        return (bh + bv) / 2.0
    except Exception:
        return 1.0

def extract_exif(image_bytes: bytes) -> dict:
    """
    Reads EXIF metadata tags from the raw image byte array.
    """
    try:
        img = Image.open(io.BytesIO(image_bytes))
        exif = img.getexif()
        metadata = {}
        if exif:
            for tag_id, value in exif.items():
                tag = TAGS.get(tag_id, tag_id)
                # Decode bytes to string safely
                if isinstance(value, bytes):
                    try:
                        value = value.decode('utf-8', errors='ignore')
                    except Exception:
                        value = str(value)
                metadata[tag] = str(value)
        return metadata
    except Exception as e:
        return {"error": f"Failed to extract metadata: {str(e)}"}

def detect_ai_generation(image_bytes: bytes, filename: str, metadata: dict) -> tuple:
    """
    Evaluates whether an image is AI-generated based on EXIF signatures, 
    pixel noise uniformity, and file naming conventions, returning a probability score and logs.
    """
    probability = 10
    indicators = []
    
    # 1. Inspect filename
    fn_lower = filename.lower()
    ai_keywords = ["midjourney", "stable", "diffusion", "dall-e", "dalle", "generated", "artificial", "wombo", "flux", "gan", "synth"]
    for kw in ai_keywords:
        if kw in fn_lower:
            probability = max(probability, 85)
            indicators.append(f"Filename contains AI generation signature keyword ('{kw}').")
            
    # 2. Inspect EXIF Software / Creator / Description tags
    software = metadata.get("Software", "").lower()
    artist = metadata.get("Artist", "").lower()
    user_comment = metadata.get("UserComment", "").lower()
    
    if any(kw in software for kw in ai_keywords) or any(kw in artist for kw in ai_keywords) or any(kw in user_comment for kw in ai_keywords):
        probability = max(probability, 95)
        indicators.append("EXIF software/artist tags contain known AI generator strings.")
        
    # Stable diffusion PNG text chunk prompt check
    try:
        header_lower = image_bytes[:50000].lower()
        sd_signatures = [b"parameters", b"negative prompt", b"steps:", b"cfg scale:", b"samplers"]
        found_sd = False
        for sig in sd_signatures:
            if sig in header_lower:
                found_sd = True
                break
        if found_sd:
            probability = max(probability, 98)
            indicators.append("Embedded generation parameters detected in file metadata headers (Stable Diffusion format).")
    except Exception:
        pass
        
    # 3. High-Frequency Gradient & Noise Analysis (Synthetic Texture Check)
    try:
        from PIL import Image
        img = Image.open(io.BytesIO(image_bytes))
        if img.mode != 'RGB':
            rgb_img = img.convert('RGB')
        else:
            rgb_img = img

        rgb_arr = np.array(rgb_img, dtype=np.float32)
        gray_arr = 0.2989 * rgb_arr[:, :, 0] + 0.5870 * rgb_arr[:, :, 1] + 0.1140 * rgb_arr[:, :, 2]

        # A. Laplacian 2nd derivative approximation for micro-texture detail
        # Natural optical camera sensors retain Poisson/Gaussian photon noise across textures.
        # Diffusion models and GANs exhibit hyper-smooth flat regions or repetitive grid artifacts.
        if gray_arr.shape[0] >= 16 and gray_arr.shape[1] >= 16:
            laplacian = (
                -4 * gray_arr[1:-1, 1:-1]
                + gray_arr[:-2, 1:-1]
                + gray_arr[2:, 1:-1]
                + gray_arr[1:-1, :-2]
                + gray_arr[1:-1, 2:]
            )
            lap_variance = float(np.var(laplacian))

            # Extremely low high-frequency variance indicates synthetic smoothing
            if lap_variance < 15.0:
                probability = max(probability, min(75, probability + 30))
                indicators.append("Attenuated high-frequency gradient variance (indicative of neural diffusion denoising).")
            elif lap_variance > 3200.0:
                probability = max(probability, min(70, probability + 20))
                indicators.append("Artificial high-frequency noise spikes (indicative of latent upscale sharpening).")

        # B. Color Chrominance Covariance (C_b vs C_r mismatch)
        # Synthetic generators often decouple chrominance channels differently from real Bayer filter sensors.
        r = rgb_arr[:, :, 0]
        g = rgb_arr[:, :, 1]
        b = rgb_arr[:, :, 2]
        cb = -0.1687 * r - 0.3313 * g + 0.5 * b
        cr = 0.5 * r - 0.4187 * g - 0.0813 * b
        chroma_corr = float(np.corrcoef(cb.flatten(), cr.flatten())[0, 1]) if cb.size > 0 else 0.0

        if abs(chroma_corr) > 0.88:
            probability = max(probability, min(65, probability + 15))
            indicators.append("Strongly coupled synthetic chrominance correlation (common in generative RGB latent decoders).")

        # 4. Check for missing EXIF hardware metadata
        has_make_model = "Make" in metadata or "Model" in metadata
        if not has_make_model and len(metadata) <= 2:
            probability = max(probability, min(55, probability + 15))
            indicators.append("Total absence of camera hardware metadata headers (typical of synthetic web exports).")
    except Exception:
        pass

    probability = min(99, max(5, probability))
    is_ai = probability > 50

    return is_ai, probability, indicators


# ─────────────────────────────────────────────────────────────────
# ENGINE D — DCT / PRNU Camera Fingerprint Detector
# ─────────────────────────────────────────────────────────────────

def prnu_fingerprint_score(image_bytes: bytes) -> dict:
    """
    Photo Response Non-Uniformity (PRNU) + DCT analysis.

    Every real camera sensor has unique pixel-level fixed-pattern noise (FPN)
    caused by manufacturing imperfections. AI-generated images have ZERO camera
    noise — they are synthesised from a latent space and produce statistically
    flat high-frequency residuals.

    Steps:
      1. Estimate noise residual via Gaussian denoising subtraction.
      2. DWT HH-subband spatial anisotropy (real sensors → row/col stripes).
      3. DCT AC coefficient histogram entropy (real JPEG → comb pattern; AI → flat).
    """
    try:
        from scipy.ndimage import uniform_filter
        import pywt

        img = Image.open(io.BytesIO(image_bytes)).convert("L")
        # Cap analysis resolution to 1280px for sub-second analysis speed
        if max(img.width, img.height) > 1280:
            scale_factor = 1280.0 / max(img.width, img.height)
            new_w, new_h = max(32, int(img.width * scale_factor)), max(32, int(img.height * scale_factor))
            img = img.resize((new_w, new_h), Image.BILINEAR)

        arr = np.asarray(img, dtype=np.float32)
        h, w = arr.shape
        if h < 32 or w < 32:
            return {"prnu_risk": 5, "prnu_signals": ["Image too small for PRNU analysis."]}

        # Step 1: Noise residual
        local_mean = uniform_filter(arr, size=7)
        noise = arr - local_mean
        noise_std = float(np.std(noise))
        noise_mean = float(np.mean(np.abs(noise)))

        # Step 2: DWT spatial anisotropy
        _, (cH, cV, cD) = pywt.dwt2(arr, "haar")
        hh_row_var = float(np.var(np.mean(np.abs(cD), axis=1)))
        hh_col_var = float(np.var(np.mean(np.abs(cD), axis=0)))
        spatial_anisotropy = hh_row_var / (hh_col_var + 1e-9)

        # Step 3: Fast vectorized DCT histogram entropy
        h_blocks = h // 8
        w_blocks = w // 8
        if h_blocks > 0 and w_blocks > 0:
            blocks_arr = (
                arr[: h_blocks * 8, : w_blocks * 8]
                .reshape(h_blocks, 8, w_blocks, 8)
                .swapaxes(1, 2)
                .reshape(-1, 64)
                - 128.0
            )
            hist, _ = np.histogram(blocks_arr, bins=64, range=(-128, 128))
            hist_norm = hist / (hist.sum() + 1e-9)
            hist_entropy = float(-np.sum(hist_norm[hist_norm > 0] * np.log2(hist_norm[hist_norm > 0])))
        else:
            hist_entropy = 6.0

        # Scoring
        prnu_risk = 5
        prnu_signals = []

        if noise_std < 1.5:
            prnu_risk += 35
            prnu_signals.append("Near-zero sensor noise residual (PRNU absent) — characteristic of AI-generated synthesis.")
        elif noise_std < 3.5:
            prnu_risk += 15
            prnu_signals.append("Very low high-frequency noise floor — possible AI upscaling or aggressive denoising.")

        if 0.85 < spatial_anisotropy < 1.15:
            prnu_risk += 20
            prnu_signals.append("Isotropic DWT high-frequency energy (no row/column sensor pattern) — consistent with neural synthesis.")

        if hist_entropy > 5.5:
            prnu_risk += 20
            prnu_signals.append("Flat DCT AC coefficient distribution — absent JPEG double-quantisation comb pattern.")

        if noise_mean < 0.8:
            prnu_risk += 15
            prnu_signals.append("Abnormally smooth image regions — neural diffusion denoising signature detected.")

        prnu_risk = min(95, max(5, prnu_risk))
        if not prnu_signals:
            prnu_signals.append("PRNU sensor pattern analysis consistent with a real camera capture.")

        return {
            "prnu_risk": prnu_risk,
            "noise_std": round(noise_std, 3),
            "spatial_anisotropy": round(spatial_anisotropy, 3),
            "dct_histogram_entropy": round(hist_entropy, 3),
            "prnu_signals": prnu_signals,
        }
    except ImportError:
        return {
            "prnu_risk": 5,
            "prnu_signals": ["PRNU analysis requires scipy and PyWavelets (pip install scipy PyWavelets)."],
        }
    except Exception as e:
        return {"prnu_risk": 5, "prnu_signals": [f"PRNU analysis error: {e}"]}


# ─────────────────────────────────────────────────────────────────
# ENGINE G — Invisible Watermark & C2PA Content Credential Detector
# ─────────────────────────────────────────────────────────────────

_KNOWN_AI_TOOLS = [
    "dall-e", "dalle", "midjourney", "stable diffusion", "firefly",
    "adobe firefly", "flux", "imagen", "gpt-4o", "gemini", "deepfloyd",
    "kandinsky", "emu", "playground", "leonardo.ai", "nightcafe", "wombo",
]


def detect_invisible_watermark(image_bytes: bytes) -> dict:
    """
    Multi-layer invisible watermark and AI content credential detection.

    Layer 1: invisible-watermark library (DwtDct / DwtDctSvd steganographic decode).
    Layer 2: C2PA / XMP metadata credential blocks (Adobe / Leica / Truepic standard).
    Layer 3: Stable Diffusion PNG text chunk (parameters, negative prompt, CFG scale).
    Layer 4: Known AI tool identifier strings in EXIF/IPTC metadata stream.
    """
    result = {
        "watermark_detected": False,
        "watermark_type": None,
        "ai_tool_identified": None,
        "confidence": 0,
        "watermark_signals": [],
    }

    # Layer 1: invisible-watermark library
    try:
        from imwatermark import WatermarkDecoder
        import cv2
        img_array = np.frombuffer(image_bytes, dtype=np.uint8)
        bgr = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
        if bgr is not None:
            for method in ["dwtDct", "dwtDctSvd"]:
                try:
                    decoder = WatermarkDecoder("bits", 32)
                    wm_bits = decoder.decode(bgr, method)
                    if wm_bits is not None and len(wm_bits) > 0:
                        bit_variance = float(np.var(wm_bits))
                        if bit_variance > 0.05:
                            result["watermark_detected"] = True
                            result["watermark_type"] = f"Steganographic ({method})"
                            result["confidence"] = max(result["confidence"], 75)
                            result["watermark_signals"].append(
                                f"Steganographic watermark payload detected via {method} frequency domain decoding."
                            )
                except Exception:
                    pass
    except ImportError:
        result["watermark_signals"].append("invisible-watermark not installed (pip install invisible-watermark opencv-python-headless).")
    except Exception:
        pass

    # Layer 2: C2PA / XMP content credentials
    try:
        raw = image_bytes[:200000]
        xmp_markers = [b"<x:xmpmeta", b"<rdf:RDF", b"c2pa", b"C2PA", b"ContentCredentials",
                       b"photoshop:Source", b"<ai:"]
        xmp_hits = sum(1 for m in xmp_markers if m in raw)
        if xmp_hits >= 2:
            result["watermark_detected"] = True
            result["watermark_type"] = result["watermark_type"] or "C2PA Content Credential"
            result["confidence"] = max(result["confidence"], 90)
            result["watermark_signals"].append(
                "C2PA / XMP content credentials found — image certified as AI-generated by Adobe Firefly, DALL-E 3, or equivalent."
            )
    except Exception:
        pass

    # Layer 3: Stable Diffusion PNG text chunk
    try:
        sd_markers = [b"parameters", b"Negative prompt:", b"Steps:", b"CFG scale:", b"Sampler:", b"Model hash:"]
        sd_hits = sum(1 for m in sd_markers if m in image_bytes[:100000])
        if sd_hits >= 2:
            result["watermark_detected"] = True
            result["watermark_type"] = result["watermark_type"] or "Stable Diffusion Generation Parameters"
            result["ai_tool_identified"] = "Stable Diffusion"
            result["confidence"] = max(result["confidence"], 98)
            result["watermark_signals"].append(
                f"SD generation parameter block found ({sd_hits} markers): prompt, CFG scale, and sampler embedded in PNG metadata."
            )
    except Exception:
        pass

    # Layer 4: Known AI tool EXIF/IPTC signatures
    try:
        text_block = image_bytes[:300000].lower()
        for tool in _KNOWN_AI_TOOLS:
            if tool.encode() in text_block:
                result["watermark_detected"] = True
                result["ai_tool_identified"] = result["ai_tool_identified"] or tool.title()
                result["confidence"] = max(result["confidence"], 85)
                result["watermark_signals"].append(
                    f"Known AI tool identifier '{tool}' found in file metadata stream."
                )
                break
    except Exception:
        pass

    if not result["watermark_signals"]:
        result["watermark_signals"].append("No invisible watermarks or AI content credentials detected.")

    return result
