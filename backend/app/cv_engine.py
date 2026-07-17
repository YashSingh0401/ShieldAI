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
        
        # Find the maximum pixel difference value to evaluate tampering threat
        extrema = ela_image.getextrema()
        # extrema yields tuples of (min, max) for each channel (R, G, B)
        max_diff = max([ex[1] for ex in extrema])
        
        # Calculate spatial complexity of original image to normalize ELA thresholds for textured scenes
        orig_gray = original.convert('L')
        orig_arr = np.array(orig_gray)
        grad_x = np.abs(orig_arr[:, :-1].astype(np.int16) - orig_arr[:, 1:].astype(np.int16))
        grad_y = np.abs(orig_arr[:-1, :].astype(np.int16) - orig_arr[1:, :].astype(np.int16))
        complexity = (np.mean(grad_x) + np.mean(grad_y)) / 2.0
        
        # Calculate ELA statistics on the raw, unenhanced difference image
        raw_gray = ela_image.convert('L')
        ela_data = np.array(raw_gray)
        
        mean_val = np.mean(ela_data)
        high_diff_pct = np.sum(ela_data > 1.5) / ela_data.size * 100
        
        # Normalize the statistics by image complexity (scales between 1.0 and 2.5)
        comp_factor = max(1.0, min(2.5, complexity / 6.0))
        adjusted_mean = mean_val / comp_factor
        adjusted_pct = high_diff_pct / comp_factor
        
        # Calculate risk score based on adjusted statistics
        risk_score = int(adjusted_mean * 12 + adjusted_pct * 0.8)
        risk_score = max(5, min(95, risk_score))
        
        # Distinguish between global filters (uniform ELA difference distribution) and localized splicing (outlier peaks)
        ratio = max_diff / max(1.0, mean_val)
        is_global_filter = ratio < 16.0
        
        # Scale the difference image for visualization UI
        enhancer = ImageEnhance.Brightness(ela_image)
        ela_image = enhancer.enhance(scale)
        
        # Save the resulting ELA image back to base64
        ela_buffer = io.BytesIO()
        ela_image.save(ela_buffer, format='JPEG')
        ela_bytes = ela_buffer.getvalue()
        ela_b64 = "data:image/jpeg;base64," + base64.b64encode(ela_bytes).decode('utf-8')
            
        anomalies = []
        if is_global_filter and risk_score > 35:
            risk_score = 30
            anomalies.append("Global filter/adjustment detected (no localized cut-and-paste tampering found).")
        elif risk_score > 40:
            anomalies.append("Non-uniform compression thresholds (high ELA density zones detected).")
            
        return ela_b64, risk_score, anomalies
    except Exception as e:
        return "", 0, [f"Error Level Analysis failed: {str(e)}"]

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
        
    # 3. Analyze sensor noise signature
    try:
        from PIL import Image
        img = Image.open(io.BytesIO(image_bytes))
        if img.mode != 'L':
            gray_img = img.convert('L')
        else:
            gray_img = img
            
        img_arr = np.array(gray_img)
        
        # Calculate local variance (sensor noise proxy)
        diff_h = np.abs(img_arr[:, :-1] - img_arr[:, 1:])
        std_h = np.std(diff_h)
        
        # AI images tend to have extremely low high-frequency noise variance in flat textures
        if std_h < 0.7:
            probability = max(probability, min(70, probability + 25))
            indicators.append("Extremely low sensor noise variance (indicates synthetic rendering or heavy AI filtering).")
            
        # 4. Check for missing EXIF metadata
        has_make_model = "Make" in metadata or "Model" in metadata
        if not has_make_model and len(metadata) <= 2:
            probability = max(probability, min(60, probability + 15))
            indicators.append("Total absence of camera hardware metadata headers (typical of synthetic web exports).")
    except Exception:
        pass
        
    probability = min(99, max(5, probability))
    is_ai = probability > 50
    
    return is_ai, probability, indicators

