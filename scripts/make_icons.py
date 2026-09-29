"""Genera los íconos de la extensión: un chinche blanco sobre fondo naranja.

Uso: python3 scripts/make_icons.py  (requiere Pillow)
"""

from pathlib import Path

from PIL import Image, ImageDraw

S = 1024  # se dibuja grande y se reduce para suavizar bordes
BG = (252, 97, 33, 255)  # #fc6121
FG = (255, 255, 255, 255)
OUT = Path(__file__).resolve().parent.parent / "extension" / "icons"


def draw() -> Image.Image:
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((0, 0, S - 1, S - 1), radius=S * 0.22, fill=BG)

    # Chinche vertical, centrado; luego se gira 45°.
    pin = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    p = ImageDraw.Draw(pin)
    cx = S / 2
    p.rounded_rectangle((cx - 150, 170, cx + 150, 250), radius=30, fill=FG)  # tapa
    p.polygon([(cx - 95, 250), (cx + 95, 250), (cx + 80, 470), (cx - 80, 470)], fill=FG)  # cuerpo
    p.rounded_rectangle((cx - 210, 470, cx + 210, 560), radius=40, fill=FG)  # base
    p.polygon([(cx - 22, 560), (cx + 22, 560), (cx, 860)], fill=FG)  # aguja
    pin = pin.rotate(-45, resample=Image.Resampling.BICUBIC, center=(cx, S * 0.5))
    img.alpha_composite(pin, (0, 0))
    return img


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    big = draw()
    for size in (16, 32, 48, 128):
        big.resize((size, size), Image.Resampling.LANCZOS).save(OUT / f"icon{size}.png")
    print("íconos en", OUT)


if __name__ == "__main__":
    main()
