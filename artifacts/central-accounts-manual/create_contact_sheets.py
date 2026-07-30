from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).parent / "rendered"
pages = sorted(root.glob("page-*.png"))
font = ImageFont.load_default()

for sheet_no, start in enumerate(range(0, len(pages), 4), 1):
    batch = pages[start:start + 4]
    thumbs = []
    for path in batch:
        image = Image.open(path).convert("RGB")
        image.thumbnail((510, 660))
        canvas = Image.new("RGB", (540, 710), "#d8d8d8")
        x = (canvas.width - image.width) // 2
        canvas.paste(image, (x, 28))
        draw = ImageDraw.Draw(canvas)
        draw.text((12, 8), path.stem, fill="black", font=font)
        thumbs.append(canvas)
    sheet = Image.new("RGB", (1080, 1420), "#444444")
    for index, thumb in enumerate(thumbs):
        sheet.paste(thumb, ((index % 2) * 540, (index // 2) * 710))
    sheet.save(root / f"contact-{sheet_no:02d}.png")
