"""
Generate a premium Open Graph image for FreeGenderPredictor.com
Output: public/og-image.png (1200x630, PNG)
"""

from PIL import Image, ImageDraw, ImageFont, ImageFilter
import math
import os

# ─── Config ──────────────────────────────────────────────────────────────────
WIDTH, HEIGHT = 1200, 630
PADDING = 60
OUTPUT = os.path.join(os.path.dirname(__file__), "..", "public", "og-image.png")

# Brand colors
PINK = "#F8BBD9"
BLUE = "#A7D8F5"
PURPLE = "#5E4FA2"
WHITE = "#FFFFFF"
DARK = "#1A1A2E"
MUTED = "#6B7280"

# Font paths
FONT_DIR = "C:/Windows/Fonts"
FONT_REGULAR = os.path.join(FONT_DIR, "segoeui.ttf")
FONT_BOLD = os.path.join(FONT_DIR, "segoeuib.ttf")
FONT_LIGHT = os.path.join(FONT_DIR, "segoeuil.ttf")

# Logo
LOGO_PATH = os.path.join(os.path.dirname(__file__), "..", "public", "logo-header.webp")


def hex_to_rgb(hex_color):
    h = hex_color.lstrip("#")
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))


def lerp_color(c1, c2, t):
    return tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3))


def draw_radial_gradient(img, center, radius, color_center, color_edge):
    """Draw a soft radial gradient circle."""
    px = img.load()
    cx, cy = center
    for y in range(max(0, cy - radius), min(HEIGHT, cy + radius)):
        for x in range(max(0, cx - radius), min(WIDTH, cx + radius)):
            dist = math.sqrt((x - cx) ** 2 + (y - cy) ** 2)
            if dist < radius:
                t = dist / radius
                t = t * t * (3 - 2 * t)  # smoothstep
                blended = lerp_color(color_center, color_edge, t)
                existing = px[x, y][:3]
                # Alpha blend
                alpha = 1.0 - t * 0.7
                result = tuple(int(existing[i] * (1 - alpha) + blended[i] * alpha) for i in range(3))
                px[x, y] = result


def draw_soft_circle(draw, bbox, fill_color, alpha=40):
    """Draw a soft circle with low opacity."""
    r, g, b = hex_to_rgb(fill_color)
    overlay = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    overlay_draw = ImageDraw.Draw(overlay)
    overlay_draw.ellipse(bbox, fill=(r, g, b, alpha))
    overlay_blurred = overlay.filter(ImageFilter.GaussianBlur(radius=30))
    return overlay_blurred


def draw_sparkle(img, cx, cy, size, color, alpha=180):
    """Draw a 4-pointed star sparkle."""
    r, g, b = hex_to_rgb(color)
    overlay = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    s = size
    points = [
        (cx, cy - s),  # top
        (cx + s * 0.15, cy - s * 0.15),  # inner right
        (cx + s, cy),  # right
        (cx + s * 0.15, cy + s * 0.15),  # inner bottom
        (cx, cy + s),  # bottom
        (cx - s * 0.15, cy + s * 0.15),  # inner left
        (cx - s, cy),  # left
        (cx - s * 0.15, cy - s * 0.15),  # inner top
    ]
    draw.polygon(points, fill=(r, g, b, alpha))
    overlay_blurred = overlay.filter(ImageFilter.GaussianBlur(radius=1))
    return overlay_blurred


def draw_ring(draw, cx, cy, radius, color, width=2, alpha=60):
    """Draw a soft ring/circle outline."""
    r, g, b = hex_to_rgb(color)
    bbox = [cx - radius, cy - radius, cx + radius, cy + radius]
    draw.ellipse(bbox, outline=(r, g, b, alpha), width=width)


def main():
    # ─── Create base image with RGBA for compositing ─────────────────────
    img = Image.new("RGBA", (WIDTH, HEIGHT), hex_to_rgb(WHITE) + (255,))
    draw = ImageDraw.Draw(img)

    # ─── Background gradient: subtle warm white to very light pink/blue ──
    for y in range(HEIGHT):
        t = y / HEIGHT
        # Top: pure white, bottom: very subtle warm tint
        r = int(255 - t * 3)
        g = int(255 - t * 5)
        b = int(255 - t * 2)
        draw.line([(0, y), (WIDTH, y)], fill=(r, g, b, 255))

    # ─── Abstract soft circles (decorative background) ───────────────────
    circles = [
        # (cx, cy, radius, color, alpha)
        (950, 100, 280, PINK, 35),
        (1050, 400, 220, BLUE, 30),
        (150, 500, 200, PURPLE, 18),
        (700, 550, 160, PINK, 22),
        (300, 80, 140, BLUE, 20),
        (1100, 200, 100, PURPLE, 15),
    ]

    for cx, cy, radius, color, alpha in circles:
        r, g, b = hex_to_rgb(color)
        overlay = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
        odraw = ImageDraw.Draw(overlay)
        odraw.ellipse(
            [cx - radius, cy - radius, cx + radius, cy + radius],
            fill=(r, g, b, alpha),
        )
        overlay = overlay.filter(ImageFilter.GaussianBlur(radius=40))
        img = Image.alpha_composite(img, overlay)

    draw = ImageDraw.Draw(img)

    # ─── Subtle ring decorations ─────────────────────────────────────────
    ring_overlay = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    ring_draw = ImageDraw.Draw(ring_overlay)

    rings = [
        (1000, 150, 120, PURPLE, 2, 40),
        (880, 450, 90, PINK, 2, 35),
        (200, 450, 70, BLUE, 1, 30),
        (1120, 300, 55, PURPLE, 1, 25),
    ]
    for cx, cy, radius, color, width, alpha in rings:
        draw_ring(ring_draw, cx, cy, radius, color, width, alpha)

    ring_overlay = ring_overlay.filter(ImageFilter.GaussianBlur(radius=2))
    img = Image.alpha_composite(img, ring_overlay)

    # ─── Sparkles ────────────────────────────────────────────────────────
    sparkles = [
        (1080, 80, 8, PURPLE, 160),
        (980, 520, 6, PINK, 140),
        (180, 120, 5, BLUE, 120),
        (850, 60, 4, PURPLE, 100),
        (1150, 480, 5, PINK, 110),
        (60, 350, 4, BLUE, 90),
    ]

    for cx, cy, size, color, alpha in sparkles:
        sparkle = draw_sparkle(None, cx, cy, size, color, alpha)
        img = Image.alpha_composite(img, sparkle)

    draw = ImageDraw.Draw(img)

    # ─── Load and place logo ─────────────────────────────────────────────
    logo = Image.open(LOGO_PATH).convert("RGBA")
    # Upscale logo for high quality (target ~80px display size, but render at 2x)
    logo_target_h = 80
    logo_scale = logo_target_h / logo.height
    new_logo_w = int(logo.width * logo_scale)
    new_logo_h = int(logo.height * logo_scale)
    logo = logo.resize((new_logo_w, new_logo_h), Image.LANCZOS)

    logo_x = PADDING
    logo_y = PADDING
    img.paste(logo, (logo_x, logo_y), logo)

    # ─── Typography ──────────────────────────────────────────────────────
    try:
        font_heading = ImageFont.truetype(FONT_BOLD, 52)
        font_subtitle = ImageFont.truetype(FONT_REGULAR, 24)
        font_tagline = ImageFont.truetype(FONT_LIGHT, 18)
    except Exception:
        font_heading = ImageFont.truetype(FONT_BOLD, 48)
        font_subtitle = ImageFont.truetype(FONT_REGULAR, 22)
        font_tagline = ImageFont.truetype(FONT_LIGHT, 16)

    # ─── Text positioning ────────────────────────────────────────────────
    text_x = PADDING
    text_start_y = logo_y + new_logo_h + 50

    # Main heading
    heading_text = "Free Baby Gender"
    heading_text_2 = "Prediction Tools"

    # Draw heading with subtle shadow
    shadow_overlay = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow_overlay)
    shadow_draw.text((text_x + 2, text_start_y + 2), heading_text, font=font_heading, fill=(0, 0, 0, 25))
    shadow_draw.text((text_x + 2, text_start_y + 58), heading_text_2, font=font_heading, fill=(0, 0, 0, 25))
    shadow_overlay = shadow_overlay.filter(ImageFilter.GaussianBlur(radius=4))
    img = Image.alpha_composite(img, shadow_overlay)

    draw = ImageDraw.Draw(img)
    draw.text((text_x, text_start_y), heading_text, font=font_heading, fill=hex_to_rgb(DARK) + (255,))
    draw.text((text_x, text_start_y + 56), heading_text_2, font=font_heading, fill=hex_to_rgb(DARK) + (255,))

    # Subtitle
    subtitle_y = text_start_y + 130
    subtitle_text = "Chinese Gender Predictor  \u2022  Mayan Gender Predictor"
    draw.text((text_x, subtitle_y), subtitle_text, font=font_subtitle, fill=hex_to_rgb(MUTED) + (255,))

    # Tagline
    tagline_y = subtitle_y + 40
    tagline_text = "Fast  \u2022  Free  \u2022  Easy to Use"
    draw.text((text_x, tagline_y), tagline_text, font=font_tagline, fill=hex_to_rgb("#9CA3AF") + (255,))

    # ─── Bottom accent line ──────────────────────────────────────────────
    line_y = HEIGHT - PADDING - 10
    line_overlay = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    line_draw = ImageDraw.Draw(line_overlay)
    # Gradient line from pink to blue
    line_width = 200
    for i in range(line_width):
        t = i / line_width
        color = lerp_color(hex_to_rgb(PINK), hex_to_rgb(BLUE), t)
        x = text_x + i
        line_draw.line([(x, line_y), (x, line_y + 3)], fill=color + (120,))
    img = Image.alpha_composite(img, line_overlay)

    # ─── Website URL on the right ────────────────────────────────────────
    draw = ImageDraw.Draw(img)
    try:
        font_url = ImageFont.truetype(FONT_REGULAR, 16)
    except Exception:
        font_url = ImageFont.truetype(FONT_REGULAR, 14)
    url_text = "freegenderpredictor.com"
    url_bbox = draw.textbbox((0, 0), url_text, font=font_url)
    url_w = url_bbox[2] - url_bbox[0]
    draw.text(
        (WIDTH - PADDING - url_w, HEIGHT - PADDING - 20),
        url_text,
        font=font_url,
        fill=hex_to_rgb("#9CA3AF") + (255,),
    )

    # ─── Convert to RGB and save as PNG ──────────────────────────────────
    final = Image.new("RGB", (WIDTH, HEIGHT), hex_to_rgb(WHITE))
    final.paste(img, mask=img.split()[3])

    final.save(OUTPUT, "PNG", optimize=True)
    print(f"OG image saved: {OUTPUT}")
    print(f"Dimensions: {final.size[0]}x{final.size[1]}")
    print(f"File size: {os.path.getsize(OUTPUT) / 1024:.1f} KB")


if __name__ == "__main__":
    main()
