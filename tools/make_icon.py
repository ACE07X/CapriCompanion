"""Build Capri's desktop icon (web/capri.ico and web/capri-icon.png) from the first idle sprite frame.

Usage, from the project folder:
    python tools/make_icon.py web/sprites/idle.png web/capri-icon.png web/capri.ico 101,93,165,157

The last argument is the face crop box (left, top, right, bottom) inside the 240x384 frame.
The output is derived from Lachy's sprite art and stays under CAPRI_ASSET_LICENSE.md.
"""
import sys

from PIL import Image, ImageDraw, ImageFilter

src, out_png, out_ico, box = sys.argv[1], sys.argv[2], sys.argv[3], tuple(int(v) for v in sys.argv[4].split(","))
frame = Image.open(src).convert("RGBA").crop((0, 0, 240, 384))
head = frame.crop(box)
S = 512
canvas = Image.new("RGBA", (S, S), (0, 0, 0, 0))
# Rounded dark plate with a neon-yellow edge.
plate = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(plate)
d.rounded_rectangle((16, 16, S - 16, S - 16), radius=96, fill=(10, 8, 20, 255))
d.rounded_rectangle((16, 16, S - 16, S - 16), radius=96, outline=(255, 214, 0, 255), width=14)
mask = Image.new("L", (S, S), 0)
ImageDraw.Draw(mask).rounded_rectangle((30, 30, S - 30, S - 30), radius=84, fill=255)
canvas.alpha_composite(plate)
# Pixel-art face, scaled with NEAREST to stay crisp, over a soft glow of itself.
side = S - 80
art = head.resize((side, int(side * head.height / head.width)), Image.NEAREST)
glow = art.copy().filter(ImageFilter.GaussianBlur(10))
glow_layer = Image.new("RGBA", (S, S))
glow_layer.paste(glow, (40, 40), glow)
clip = Image.new("RGBA", (S, S))
clip.paste(art, (40, 40), art)
layer = Image.new("RGBA", (S, S))
layer.alpha_composite(glow_layer)
layer.alpha_composite(clip)
layer.putalpha(Image.composite(layer.getchannel("A"), Image.new("L", (S, S), 0), mask))
canvas.alpha_composite(layer)
canvas.save(out_png)
canvas.save(out_ico, sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
