#!/usr/bin/env python3
"""Prepare a personal photo for the public site.

  python3 scripts/prepare-photo.py <input.heic|jpg|png> <photos/name.jpg> [longest-side-px] [--crop left,top,right,bottom]

  --crop takes fractions of the image (0-1), e.g. --crop 0.2,0,0.94,0.62 keeps the upper middle part.

- decodes iPhone HEIC (through macOS `sips`), fixes rotation
- converts the colors to sRGB so they look right on every screen
- resizes (default 1000 px on the long side) and re-encodes as a small progressive JPEG
- drops ALL metadata: GPS location, camera, dates, thumbnails — nothing but pixels is kept
"""
import io, os, subprocess, sys, tempfile
from PIL import Image, ImageCms, ImageOps

argv = sys.argv[1:]
crop = None
if "--crop" in argv:
    i = argv.index("--crop"); crop = [float(v) for v in argv[i + 1].split(",")]; del argv[i:i + 2]
src, dst = argv[0], argv[1]
size = int(argv[2]) if len(argv) > 2 else 1000

tmp = None
if src.lower().endswith((".heic", ".heif")):
    tmp = tempfile.mktemp(suffix=".jpg")
    subprocess.run(["sips", "-s", "format", "jpeg", src, "--out", tmp], check=True, capture_output=True)
    src = tmp

im = Image.open(src)
icc = im.info.get("icc_profile")
im = ImageOps.exif_transpose(im).convert("RGB")
if icc:
    try:
        im = ImageCms.profileToProfile(im, ImageCms.ImageCmsProfile(io.BytesIO(icc)), ImageCms.createProfile("sRGB"), outputMode="RGB")
    except Exception:
        pass
if crop:
    w, h = im.size; im = im.crop((int(crop[0] * w), int(crop[1] * h), int(crop[2] * w), int(crop[3] * h)))
im.thumbnail((size, size), Image.LANCZOS)
clean = Image.frombytes("RGB", im.size, im.tobytes())          # a brand-new image: no metadata can come along
os.makedirs(os.path.dirname(os.path.abspath(dst)), exist_ok=True)
clean.save(dst, "JPEG", quality=74, optimize=True, progressive=True)
if tmp: os.remove(tmp)

check = Image.open(dst)
assert not check.getexif() and "exif" not in check.info and "icc_profile" not in check.info, "metadata survived"
print(f"{dst}: {check.size[0]}x{check.size[1]}, {os.path.getsize(dst)//1024} KB, no metadata")
