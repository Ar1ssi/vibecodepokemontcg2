import os
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

IMG_PATH = r"C:/Users/SMG26/.gemini/antigravity/brain/fc3cdf31-b5e8-42e8-9662-965104614818/.user_uploaded/media_1789377461787.webp"
BRAIN_DIR = r"C:/Users/SMG26/.gemini/antigravity/brain/fc3cdf31-b5e8-42e8-9662-965104614818"
OUT_DIR = os.path.join(BRAIN_DIR, "extracted_assets")
WORKSPACE_OUT = r"C:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/out/playmat_outlines"

os.makedirs(OUT_DIR, exist_ok=True)
os.makedirs(WORKSPACE_OUT, exist_ok=True)

# Load original image
orig_bgr = cv2.imread(IMG_PATH)
h_orig, w_orig, _ = orig_bgr.shape
print(f"Loaded original image: {w_orig}x{h_orig}")

# Geometry specifications (verified down to pixel coordinates):
# Standard card dimensions: width=120, height=163, corner radius=10
# DECK: (876, 66)
# TRASH: (876, 302)
# PRIZE FRONT: (39, 16), (39, 179), (39, 341)
# PRIZE BACK: (20, 27), (20, 190), (20, 352)
# BENCH:
# Slots: (171, 290), (309, 428), (448, 567), (586, 705), (725, 844)
# Width = 120 px, Height = 163 px
# Top baseline: y = 316.5, tabs go down to y = 328
# Bottom baseline (flipped top): y = 316.5 + 163 = 479.5, tabs go up to y = 468

# ==============================================================================
# 1. GENERATE SVG VECTOR ASSET
# ==============================================================================
svg_content = '''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 528" width="1024" height="528">
  <defs>
    <style>
      .zone-stroke {
        fill: none;
        stroke: #FFFFFF;
        stroke-width: 1.8;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
      .zone-text {
        fill: #FFFFFF;
        font-family: 'Futura', 'Trebuchet MS', 'Century Gothic', 'Montserrat', 'Arial Black', sans-serif;
        font-weight: 700;
        font-size: 11px;
        letter-spacing: 2.2px;
        text-anchor: middle;
        dominant-baseline: central;
      }
      .yellow-line {
        stroke: #F7D117;
        stroke-width: 2.2;
        fill: none;
      }
    </style>
    <!-- Clip paths for back prize cards so they do not overlap inside front cards -->
    <clipPath id="clip-back-card-1">
      <path d="M 0 0 L 1024 0 L 1024 528 L 0 528 Z M 39 16 H 159 V 179 H 39 Z" clip-rule="evenodd"/>
    </clipPath>
    <clipPath id="clip-back-card-2">
      <path d="M 0 0 L 1024 0 L 1024 528 L 0 528 Z M 39 179 H 159 V 341 H 39 Z" clip-rule="evenodd"/>
    </clipPath>
    <clipPath id="clip-back-card-3">
      <path d="M 0 0 L 1024 0 L 1024 528 L 0 528 Z M 39 341 H 159 V 504 H 39 Z" clip-rule="evenodd"/>
    </clipPath>
  </defs>

  <!-- ========================================== -->
  <!-- PRIZE CARDS (SIDE)                         -->
  <!-- ========================================== -->
  <g id="prize-cards">
    <!-- Back Cards (Offset behind front cards) -->
    <g id="prize-back-cards">
      <rect x="20" y="27" width="120" height="163" rx="10" ry="10" class="zone-stroke" clip-path="url(#clip-back-card-1)"/>
      <rect x="20" y="190" width="120" height="163" rx="10" ry="10" class="zone-stroke" clip-path="url(#clip-back-card-2)"/>
      <rect x="20" y="352" width="120" height="163" rx="10" ry="10" class="zone-stroke" clip-path="url(#clip-back-card-3)"/>
    </g>

    <!-- Front Cards -->
    <g id="prize-front-cards">
      <!-- Card 1 -->
      <rect x="39" y="16" width="120" height="163" rx="10" ry="10" class="zone-stroke"/>
      <text x="99" y="93" class="zone-text">SIDE</text>

      <!-- Card 2 -->
      <rect x="39" y="179" width="120" height="163" rx="10" ry="10" class="zone-stroke"/>
      <text x="99" y="256" class="zone-text">SIDE</text>

      <!-- Card 3 -->
      <rect x="39" y="341" width="120" height="163" rx="10" ry="10" class="zone-stroke"/>
      <text x="99" y="418" class="zone-text">SIDE</text>
    </g>
  </g>

  <!-- ========================================== -->
  <!-- BENCH ZONE (TOP AND FLIPPED BOTTOM)        -->
  <!-- ========================================== -->
  <g id="bench-zone">
    <!-- 5 Bench Card Slots: Top and Flipped Bottom Halves (120 x 163 px card size) -->
    <!-- Slot 1 -->
    <g id="bench-slot-1">
      <path d="M 171 328 L 171 326.5 A 10 10 0 0 1 181 316.5 L 280 316.5 A 10 10 0 0 1 290 326.5 L 290 328" class="zone-stroke"/>
      <path d="M 171 468 L 171 469.5 A 10 10 0 0 0 181 479.5 L 280 479.5 A 10 10 0 0 0 290 469.5 L 290 468" class="zone-stroke"/>
    </g>
    <!-- Slot 2 -->
    <g id="bench-slot-2">
      <path d="M 309 328 L 309 326.5 A 10 10 0 0 1 319 316.5 L 418 316.5 A 10 10 0 0 1 428 326.5 L 428 328" class="zone-stroke"/>
      <path d="M 309 468 L 309 469.5 A 10 10 0 0 0 319 479.5 L 418 479.5 A 10 10 0 0 0 428 469.5 L 428 468" class="zone-stroke"/>
    </g>
    <!-- Slot 3 -->
    <g id="bench-slot-3">
      <path d="M 448 328 L 448 326.5 A 10 10 0 0 1 458 316.5 L 557 316.5 A 10 10 0 0 1 567 326.5 L 567 328" class="zone-stroke"/>
      <path d="M 448 468 L 448 469.5 A 10 10 0 0 0 458 479.5 L 557 479.5 A 10 10 0 0 0 567 469.5 L 567 468" class="zone-stroke"/>
    </g>
    <!-- Slot 4 -->
    <g id="bench-slot-4">
      <path d="M 586 328 L 586 326.5 A 10 10 0 0 1 596 316.5 L 695 316.5 A 10 10 0 0 1 705 326.5 L 705 328" class="zone-stroke"/>
      <path d="M 586 468 L 586 469.5 A 10 10 0 0 0 596 479.5 L 695 479.5 A 10 10 0 0 0 705 469.5 L 705 468" class="zone-stroke"/>
    </g>
    <!-- Slot 5 -->
    <g id="bench-slot-5">
      <path d="M 725 328 L 725 326.5 A 10 10 0 0 1 735 316.5 L 834 316.5 A 10 10 0 0 1 844 326.5 L 844 328" class="zone-stroke"/>
      <path d="M 725 468 L 725 469.5 A 10 10 0 0 0 735 479.5 L 834 479.5 A 10 10 0 0 0 844 469.5 L 844 468" class="zone-stroke"/>
    </g>

    <!-- Bench Label (Centered inside middle bench card) -->
    <text x="507.5" y="398" class="zone-text">BENCH</text>
  </g>

  <!-- ========================================== -->
  <!-- DECK ZONE                                  -->
  <!-- ========================================== -->
  <g id="deck-zone">
    <rect x="876" y="66" width="120" height="163" rx="10" ry="10" class="zone-stroke"/>
    <text x="936" y="148" class="zone-text">DECK</text>
  </g>

  <!-- ========================================== -->
  <!-- TRASH ZONE                                 -->
  <!-- ========================================== -->
  <g id="trash-zone">
    <rect x="876" y="302" width="120" height="163" rx="10" ry="10" class="zone-stroke"/>
    <text x="936" y="386" class="zone-text">TRASH</text>
  </g>

  <!-- ========================================== -->
  <!-- BATTLE FIELD (OPTIONAL LAYER)              -->
  <!-- ========================================== -->
  <g id="battlefield-zone">
    <text x="502" y="88" class="zone-text">BATTLE FIELD</text>
  </g>

  <!-- ========================================== -->
  <!-- BOTTOM BASELINE BAR (OPTIONAL LAYER)       -->
  <!-- ========================================== -->
  <g id="bottom-bar">
    <line x1="0" y1="474" x2="1024" y2="474" class="yellow-line"/>
  </g>
</svg>
'''

svg_file = os.path.join(OUT_DIR, "playmat_zones_overlay.svg")
with open(svg_file, "w", encoding="utf-8") as f:
    f.write(svg_content)
print(f"Generated SVG: {svg_file}")

# ==============================================================================
# 2. GENERATE TRANSPARENT PNG OVERLAYS (Clean White & Black)
# ==============================================================================
def render_crisp_png(scale=1, color=(255, 255, 255), include_extras=False):
    s = 4 * scale  # 4x supersampling for ultra smooth rendering
    w = 1024 * s
    h = 528 * s
    
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(im)
    
    st_w = int(1.8 * s)
    r = int(10 * s)
    card_w = int(120 * s)
    card_h = int(163 * s)
    
    font_size = int(11 * s)
    font = None
    for fn in ["C:/Windows/Fonts/trebucbd.ttf", "C:/Windows/Fonts/arialbd.ttf", "C:/Windows/Fonts/seguisb.ttf"]:
        if os.path.exists(fn):
            font = ImageFont.truetype(fn, font_size)
            break
            
    c_rgba = (*color, 255)
    
    def draw_rr(x, y, cw, ch, cr):
        draw.rounded_rectangle([x, y, x + cw, y + ch], radius=cr, outline=c_rgba, width=st_w)
        
    def draw_tracked_text(cx, cy, text, spacing=int(2.2*s)):
        total_w = sum([draw.textlength(ch, font=font) for ch in text]) + spacing * (len(text) - 1)
        cur_x = cx - total_w / 2.0
        bbox = draw.textbbox((0, 0), text, font=font)
        text_h = bbox[3] - bbox[1]
        cur_y = cy - text_h / 2.0 - bbox[1]
        for ch in text:
            draw.text((cur_x, cur_y), ch, font=font, fill=c_rgba)
            cur_x += draw.textlength(ch, font=font) + spacing

    # 1. Deck
    draw_rr(int(876*s), int(66*s), card_w, card_h, r)
    draw_tracked_text(int(936*s), int(148*s), "DECK")

    # 2. Trash
    draw_rr(int(876*s), int(302*s), card_w, card_h, r)
    draw_tracked_text(int(936*s), int(386*s), "TRASH")

    # 3. Front Prize Cards
    front_cards = [(39, 16, 93), (39, 179, 256), (39, 341, 418)]
    for fx, fy, ty in front_cards:
        draw_rr(int(fx*s), int(fy*s), card_w, card_h, r)
        draw_tracked_text(int(99*s), int(ty*s), "SIDE")

    # 4. Back Prize Cards (clipped so they don't show inside front cards)
    back_im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    back_draw = ImageDraw.Draw(back_im)
    back_cards = [(20, 27), (20, 190), (20, 352)]
    for bx, by in back_cards:
        back_draw.rounded_rectangle([int(bx*s), int(by*s), int(bx*s) + card_w, int(by*s) + card_h], radius=r, outline=c_rgba, width=st_w)
    
    for fx, fy, _ in front_cards:
        back_draw.rectangle([int((fx+1)*s), int((fy+1)*s), int((fx + 120 - 1)*s), int((fy + 163 - 1)*s)], fill=(0, 0, 0, 0))
    
    im = Image.alpha_composite(back_im, im)
    draw = ImageDraw.Draw(im)

    # 5. Bench: Top brackets AND Flipped Bottom brackets
    slots = [(171, 290), (309, 428), (448, 567), (586, 705), (725, 844)]
    y_top = int(316.5 * s)
    y_bottom = int(479.5 * s)  # 316.5 + 163 = 479.5
    tab_len = int(11.5 * s)

    for x1, x2 in slots:
        sx1, sx2 = int(x1 * s), int(x2 * s)
        
        # --- Top Bracket ---
        draw.line([(sx1 + r, y_top), (sx2 - r, y_top)], fill=c_rgba, width=st_w)
        draw.arc([sx1, y_top, sx1 + 2*r, y_top + 2*r], start=180, end=270, fill=c_rgba, width=st_w)
        draw.line([(sx1, y_top + r), (sx1, y_top + tab_len)], fill=c_rgba, width=st_w)
        draw.arc([sx2 - 2*r, y_top, sx2, y_top + 2*r], start=270, end=360, fill=c_rgba, width=st_w)
        draw.line([(sx2, y_top + r), (sx2, y_top + tab_len)], fill=c_rgba, width=st_w)

        # --- Flipped Bottom Bracket ---
        draw.line([(sx1 + r, y_bottom), (sx2 - r, y_bottom)], fill=c_rgba, width=st_w)
        draw.arc([sx1, y_bottom - 2*r, sx1 + 2*r, y_bottom], start=90, end=180, fill=c_rgba, width=st_w)
        draw.line([(sx1, y_bottom - r), (sx1, y_bottom - tab_len)], fill=c_rgba, width=st_w)
        draw.arc([sx2 - 2*r, y_bottom - 2*r, sx2, y_bottom], start=0, end=90, fill=c_rgba, width=st_w)
        draw.line([(sx2, y_bottom - r), (sx2, y_bottom - tab_len)], fill=c_rgba, width=st_w)
        
    # Center BENCH text inside middle bench card
    draw_tracked_text(int(507.5 * s), int(398.0 * s), "BENCH")

    # Optional Extras
    if include_extras:
        draw_tracked_text(int(502*s), int(88*s), "BATTLE FIELD")
        draw.line([(0, int(474*s)), (w, int(474*s))], fill=(247, 209, 23, 255), width=int(2.2*s))

    target_w = 1024 * scale
    target_h = 528 * scale
    final_png = im.resize((target_w, target_h), Image.Resampling.LANCZOS)
    return final_png

print("Generating updated PNG overlays...")
png_white_1x = render_crisp_png(scale=1, color=(255, 255, 255), include_extras=False)
png_white_1x.save(os.path.join(OUT_DIR, "playmat_zones_white_transparent.png"))

png_black_1x = render_crisp_png(scale=1, color=(20, 20, 20), include_extras=False)
png_black_1x.save(os.path.join(OUT_DIR, "playmat_zones_black_transparent.png"))

png_full_1x = render_crisp_png(scale=1, color=(255, 255, 255), include_extras=True)
png_full_1x.save(os.path.join(OUT_DIR, "playmat_zones_full_overlay.png"))

png_white_2x = render_crisp_png(scale=2, color=(255, 255, 255), include_extras=False)
png_white_2x.save(os.path.join(OUT_DIR, "playmat_zones_white_2x.png"))

png_white_4x = render_crisp_png(scale=4, color=(255, 255, 255), include_extras=False)
png_white_4x.save(os.path.join(OUT_DIR, "playmat_zones_white_4x.png"))

print("Rendered PNGs generated!")

# ==============================================================================
# 3. GENERATE PREVIEW IMAGES
# ==============================================================================
dark_bg = Image.new('RGBA', (1024, 528), (18, 24, 32, 255))
isolated_preview = Image.alpha_composite(dark_bg, png_white_1x)
isolated_preview.save(os.path.join(OUT_DIR, "preview_isolated_dark.png"))

orig_pil = Image.fromarray(cv2.cvtColor(orig_bgr, cv2.COLOR_BGR2RGB))
comparison = Image.new('RGB', (1024, 1076), (25, 25, 25))
comparison.paste(orig_pil, (0, 0))
comparison.paste(isolated_preview.convert('RGB'), (0, 548))
comparison.save(os.path.join(OUT_DIR, "comparison_original_vs_extracted.png"))

preview = orig_bgr.copy()
overlay_np = np.array(png_white_1x)
mask_lines = overlay_np[:, :, 3] > 50
preview[mask_lines, 0] = 50   # B
preview[mask_lines, 1] = 255  # G
preview[mask_lines, 2] = 50   # R
cv2.imwrite(os.path.join(OUT_DIR, "alignment_verification_preview.png"), preview)

# Copy to BRAIN_DIR and WORKSPACE_OUT
import shutil, time
for fname in os.listdir(OUT_DIR):
    src = os.path.normpath(os.path.join(OUT_DIR, fname))
    dst_brain = os.path.normpath(os.path.join(BRAIN_DIR, fname))
    dst_work = os.path.normpath(os.path.join(WORKSPACE_OUT, fname))
    for dst in [dst_brain, dst_work]:
        for _ in range(5):
            try:
                if os.path.exists(dst):
                    os.remove(dst)
                shutil.copyfile(src, dst)
                break
            except Exception:
                time.sleep(0.1)

print("All assets successfully updated in brain and workspace directories!")
