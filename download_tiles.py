#!/usr/bin/env python3
"""
download_tiles.py — Pre-caches high-res satellite map tiles locally
for all transition steps from Los Santos (LA) to Jaipur, Rajasthan.

Stores tiles at: assets/tiles/{z}/{y}/{x}.jpg
"""

import os
import math
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

# ── Coordinates ─────────────────────────────────────────────────────────────
LOS_ANGELES = (34.0522, -118.2437)   # Los Santos canonical origin
JAIPUR      = (26.9124, 75.7873)     # Destination

# Target directory
BASE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'assets', 'tiles')

# Tile Server (ArcGIS World Imagery)
TILE_URL_TEMPLATE = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"

USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

# ── Math: Lat/Lng to Tile Coordinates ───────────────────────────────────────
def lat_lng_to_tile(lat, lng, zoom):
    n = 2.0 ** zoom
    x = int(math.floor(((lng + 180.0) / 360.0) * n))
    lat_rad = math.radians(lat)
    y = int(math.floor((1.0 - math.asinh(math.tan(lat_rad)) / math.pi) / 2.0 * n))
    max_tile = int(n - 1)
    return max(0, min(max_tile, x)), max(0, min(max_tile, y))

def get_tiles_for_radius(lat, lng, zoom, radius_x=2, radius_y=2):
    center_x, center_y = lat_lng_to_tile(lat, lng, zoom)
    max_tile = (2 ** zoom) - 1
    tiles = set()
    for dx in range(-radius_x, radius_x + 1):
        for dy in range(-radius_y, radius_y + 1):
            x = (center_x + dx) % (max_tile + 1)
            y = center_y + dy
            if 0 <= y <= max_tile:
                tiles.add((zoom, y, x))
    return tiles

def collect_all_sequence_tiles():
    all_tiles = set()

    # 1. High Orbit: Full planet coverage so orbital traverse never has missing tiles
    # Zoom 3: All 64 tiles of Earth (8x8)
    for x in range(8):
        for y in range(8):
            all_tiles.add((3, y, x))

    # Zoom 4: All 256 tiles of Earth (16x16)
    for x in range(16):
        for y in range(16):
            all_tiles.add((4, y, x))

    # 2. Origin: Los Santos / Los Angeles (generous 15x13 tile grid for 3D perspective tilt & 4K screens)
    all_tiles.update(get_tiles_for_radius(LOS_ANGELES[0], LOS_ANGELES[1], 7, 7, 6))  # Zoom 7 (Ground view)
    all_tiles.update(get_tiles_for_radius(LOS_ANGELES[0], LOS_ANGELES[1], 6, 7, 6))  # Zoom 6 (Out Step 1)
    all_tiles.update(get_tiles_for_radius(LOS_ANGELES[0], LOS_ANGELES[1], 5, 7, 6))  # Zoom 5 (Out Step 2)

    # 3. Descent & Landing: Jaipur, Rajasthan (generous 15x13 and 17x15 grids)
    all_tiles.update(get_tiles_for_radius(JAIPUR[0], JAIPUR[1], 6, 7, 6))   # Zoom 6 (In Step 1: Subcontinent)
    all_tiles.update(get_tiles_for_radius(JAIPUR[0], JAIPUR[1], 9, 7, 6))   # Zoom 9 (In Step 2: Metro)
    all_tiles.update(get_tiles_for_radius(JAIPUR[0], JAIPUR[1], 12, 7, 6))  # Zoom 12 (In Step 3: Urban grid)
    all_tiles.update(get_tiles_for_radius(JAIPUR[0], JAIPUR[1], 15, 8, 7))  # Zoom 15 (Landing + dragging buffer)

    return sorted(list(all_tiles))

# ── Downloader with Retries ─────────────────────────────────────────────────
def download_single_tile(tile, max_retries=4):
    z, y, x = tile
    dir_path = os.path.join(BASE_DIR, str(z), str(y))
    file_path = os.path.join(dir_path, f"{x}.jpg")

    if os.path.exists(file_path) and os.path.getsize(file_path) > 1000:
        return True, "cached"

    os.makedirs(dir_path, exist_ok=True)
    url = TILE_URL_TEMPLATE.format(z=z, y=y, x=x)
    req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})

    for attempt in range(max_retries):
        try:
            with urllib.request.urlopen(req, timeout=8) as resp:
                data = resp.read()
                if len(data) > 300:
                    with open(file_path, 'wb') as f:
                        f.write(data)
                    return True, "downloaded"
        except Exception:
            time.sleep(0.3 * (attempt + 1))

    return False, "failed"

def main():
    print("🗺️  GTA V Switch — Pre-Caching Satellite Map Tiles")
    tiles = collect_all_sequence_tiles()
    total = len(tiles)
    print(f"📦 Total sequence tiles to pre-cache: {total}")
    print(f"📁 Target directory: {BASE_DIR}\n")

    downloaded = 0
    cached = 0
    failed = 0

    start_time = time.time()

    with ThreadPoolExecutor(max_workers=16) as executor:
        futures = {executor.submit(download_single_tile, t): t for t in tiles}
        for future in as_completed(futures):
            ok, status = future.result()
            if ok:
                if status == "cached":
                    cached += 1
                else:
                    downloaded += 1
            else:
                failed += 1

            completed = downloaded + cached + failed
            percent = (completed / total) * 100
            print(f"\rProgress: [{completed}/{total}] {percent:5.1f}% | New: {downloaded} | Cached: {cached} | Failed: {failed}", end='', flush=True)

    elapsed = time.time() - start_time
    print(f"\n\n✨ Done in {elapsed:.1f}s!")
    print(f"   • {downloaded} tiles freshly downloaded")
    print(f"   • {cached} tiles already cached")
    if failed:
        print(f"   ⚠️  {failed} tiles failed (will fall back to online ArcGIS if needed)")
    else:
        print("   ✅ 100% of tiles successfully stored locally on disk!")

if __name__ == '__main__':
    main()
