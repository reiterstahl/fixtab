"""Convierte a PNG de 24 bits (RGB, sin canal alfa) todos los .png de una carpeta.

La Chrome Web Store rechaza capturas y tiles con transparencia.
Uso: python3 scripts/flatten_png.py store
"""

import sys
from pathlib import Path

from PIL import Image

for path in sorted(Path(sys.argv[1]).rglob("*.png")):
    img = Image.open(path)
    if img.mode != "RGB":
        img.convert("RGB").save(path)
    print(path, Image.open(path).mode, Image.open(path).size)
