"""Generate the social preview card (og-image.png) for ShieldAI.

Run from repo root:  python frontend/scripts/generate_og_image.py
Output:              frontend/public/og-image.png  (1200x630)
"""
import os

from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 1200, 630
OUT = os.path.join(os.path.dirname(__file__), "..", "public", "og-image.png")

NAVY = (11, 16, 32)
INDIGO = (99, 102, 241)
PURPLE = (168, 85, 247)
WHITE = (245, 247, 252)
MUTED = (154, 163, 184)


def font(name, size):
    return ImageFont.truetype(f"C:/Windows/Fonts/{name}", size)


def main():
    img = Image.new("RGB", (W, H), NAVY)

    # Soft aurora blobs
    glow = Image.new("RGB", (W, H), NAVY)
    gdraw = ImageDraw.Draw(glow)
    gdraw.ellipse((-200, -250, 520, 380), fill=(38, 34, 92))
    gdraw.ellipse((760, 320, 1500, 900), fill=(46, 26, 84))
    glow = glow.filter(ImageFilter.GaussianBlur(120))
    img = Image.blend(img, glow, 0.75)
    draw = ImageDraw.Draw(img)

    f_title = font("arialbd.ttf", 110)
    f_tag = font("arial.ttf", 36)
    f_chip = font("arialbd.ttf", 28)
    f_foot = font("arial.ttf", 24)

    # Shield mark
    cx, cy, s = 190, 210, 90
    shield = [(cx - s, cy - s * 0.9), (cx + s, cy - s * 0.9), (cx + s, cy + s * 0.15),
              (cx, cy + s), (cx - s, cy + s * 0.15)]
    draw.polygon(shield, fill=INDIGO)
    # Checkmark inside shield
    draw.line([(cx - 42, cy - 8), (cx - 10, cy + 30), (cx + 48, cy - 42)],
              fill=WHITE, width=18, joint="curve")

    # Title next to shield
    draw.text((320, 130), "Shield", font=f_title, fill=WHITE)
    w = draw.textlength("Shield", font=f_title)
    draw.text((320 + w, 130), "AI", font=f_title, fill=INDIGO)

    # Tagline
    draw.text((322, 275), "Image  ·  Video  ·  Audio  ·  Link  forensics",
              font=f_tag, fill=MUTED)

    # Feature chips
    chips = ["ELA tampering", "Splice timeline", "Voice prosody", "Phishing links"]
    x = 100
    chip_y = 400
    for label in chips:
        tw = draw.textlength(label, font=f_chip)
        pad = 26
        box = [x, chip_y, x + tw + pad * 2, chip_y + 62]
        draw.rounded_rectangle(box, radius=31, fill=(24, 31, 54), outline=(70, 80, 120), width=2)
        draw.text((x + pad, chip_y + 14), label, font=f_chip, fill=WHITE)
        x += int(tw) + pad * 2 + 22

    # Footer lines
    draw.text((100, 520), "Evidence-based scoring. Heuristic analysis — not proof of authenticity.",
              font=f_foot, fill=MUTED)
    draw.text((100, 560), "shieldai-web.onrender.com   ·   free forever",
              font=f_foot, fill=INDIGO)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    img.save(OUT, format="PNG")
    print("wrote", os.path.abspath(OUT))


if __name__ == "__main__":
    main()
