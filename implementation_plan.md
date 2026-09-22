# Implementation Plan — Fix `application/octet-stream` Rejection on `/verify/image`

> Detailed plan persisted at `.opencode/plans/fix-octet-stream-image-validation.md` (canonical). This file is the `implementation_plan.md` entry-point required by OpenCode.

## Issue Summary

Upload / drag-and-drop / clipboard paste on `/verify-image` fails with:

`400 Unsupported file type: application/octet-stream. Allowed: {'image/jpeg', 'image/png', ...}`

Browser sends `application/octet-stream` when `File.name` lacks extension (clipboard `blob`, `image`, temp files, archive-manager drags). Backend compared `image/*` whitelist against client-supplied `file.content_type` without inspecting bytes.

**Resolution (spec):** Server-side magic-byte + Pillow inspection, not trusting `Content-Type`.

## Already Implemented (commit `96f6c1a`)

### `backend/app/main.py:185-203` — `_is_magic_image(data: bytes)`
Manual signatures (no `python-magic` dep): JPEG `FF D8 FF`, PNG `89 50 4E…`, GIF `GIF8`, WebP `RIFF…WEBP`, TIFF `II*` / `MM *`, BMP `BM`, ICO `00 00 01 00`.

### `backend/app/main.py:206-285` — `validate_upload` 4-tier rewrite

* Tier 1 Normalize: `content_type = (file.content_type or "").split(";")[0].lower()`; if `""` or `application/octet-stream` then `mimetypes.guess_type(filename)` fallback.
* Tier 2 Fast path: `if content_type in {t.lower() for t in allowed_types}: valid`.
* Tier 3 Content sniff: read FULL `data = file.file.read()` (not 4KB head), `seek(0)` before/after. For image set (`"image/jpeg" in allowed_types`): `magic_ok = _is_magic_image(data)` OR `Pillow verify()` on full bytes. Video: `ftyp` / `1A 45 DF A3` / `AVI ` or ext. Audio: `ID3` / `RIFF` / `OggS` / `fLaC` / MP3 sync or ext.
* Tier 4 Size: `MAX_BYTES = max_mb*1024*1024`, `seek(0,2)/tell()` then 400 on empty/too large.

### `backend/app/config.py:25-28` — No whitelist change needed
`ALLOWED_IMAGE_TYPES` already covers jpeg/png/webp/tiff/bmp/gif/avif/heic; magic+Pillow handles aliases.

### `backend/test_api.py:126-234` — 6 new tests (all passing)
`_make_png_bytes`, `_make_jpeg_bytes`, `_make_webp_bytes` + `_mock_cv_engine` fixtures; asserts octet-stream+valid magic →200, octet-stream+`b"hello"` →400.

## Verified

```bash
pytest backend/test_api.py -k "octet or verify_image"  # 9 passed
pytest backend/                                         # 56 passed
```

## Files

* `[MODIFIED] backend/app/main.py:185-285`
* `[VERIFIED] backend/app/config.py:25-34`
* `[MODIFIED] backend/test_api.py:126-234`
* `[NO CHANGE] frontend/src/pages/ImageVerify.jsx`

## Risks & Follow-ups

* Audio still whitelists `application/octet-stream` at `main.py:821` — should be removed to rely on sniffing (P1 hardening).
* Tier3 reads full file before size check — reorder to `seek/tell` first for DoS hardening (P2).
* Plan details, alternatives (`python-magic` rejected, pure whitelist rejected), and edge cases in canonical plan file.

---
*Canonical plan: `.opencode/plans/fix-octet-stream-image-validation.md`*
