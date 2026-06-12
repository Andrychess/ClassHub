from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
FILES = [
    ROOT / "assets" / "logo.png",
    ROOT / "assets" / "favicon.png",
    ROOT / "assets" / "icon.png",
    ROOT / "assets" / "classhub-logo-512.png",
    ROOT / "src" / "assets" / "logo.png",
    ROOT / "src" / "assets" / "favicon.png",
    ROOT / "src" / "web" / "assets" / "logo.png",
    ROOT / "src" / "web" / "assets" / "favicon.png",
]


def is_similar(color: tuple[int, int, int], target: tuple[int, int, int], tolerance: int) -> bool:
    return all(abs(color[i] - target[i]) <= tolerance for i in range(3))


def remove_outer_background(path: Path, tolerance: int = 35) -> None:
    image = Image.open(path).convert("RGBA")
    pixels = image.load()
    width, height = image.size
    background = pixels[0, 0][:3]
    visited: set[tuple[int, int]] = set()
    stack = [(0, 0), (width - 1, 0), (0, height - 1), (width - 1, height - 1)]

    while stack:
        x, y = stack.pop()
        if (x, y) in visited or x < 0 or y < 0 or x >= width or y >= height:
            continue

        visited.add((x, y))
        red, green, blue, alpha = pixels[x, y]
        if alpha == 0 or not is_similar((red, green, blue), background, tolerance):
            continue

        pixels[x, y] = (red, green, blue, 0)
        stack.extend([(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)])

    image.save(path, "PNG")


def main() -> None:
    for file_path in FILES:
        if file_path.exists():
            remove_outer_background(file_path)
            print(f"updated: {file_path}")


if __name__ == "__main__":
    main()
