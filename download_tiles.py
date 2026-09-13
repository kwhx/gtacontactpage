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

    # ── OUTBOUND: LOS SANTOS ────────────────────────────────────────────────────

    # Ground / Overhead Camera: Street-level Los Santos (zoom 12)
    # Large radius to cover full 3D pitch tilt bleed + widescreen edges
    all_tiles.update(get_tiles_for_radius(LOS_ANGELES[0], LOS_ANGELES[1], 12, 9, 8))  # Zoom 12 — rooftop/street level

    # Zoom-out #1: City blocks → city-scale (zoom 10)
    all_tiles.update(get_tiles_for_radius(LOS_ANGELES[0], LOS_ANGELES[1], 10, 8, 7))  # Zoom 10 — city scale

    # Zoom-out #2: City → regional (zoom 8)
    all_tiles.update(get_tiles_for_radius(LOS_ANGELES[0], LOS_ANGELES[1], 8, 8, 7))   # Zoom 8 — regional

    # Zoom-out #3: Regional → continental (zoom 6)
    all_tiles.update(get_tiles_for_radius(LOS_ANGELES[0], LOS_ANGELES[1], 6, 8, 7))   # Zoom 6 — continental

    # High-altitude settle (zoom 4)
    all_tiles.update(get_tiles_for_radius(LOS_ANGELES[0], LOS_ANGELES[1], 4, 5, 4))   # Zoom 4 — near-global

    # ── ORBITAL: Full planet at zoom 3 & 4 — traverse never shows missing tiles ──
    # Zoom 3: All 64 tiles of Earth (8×8 grid)
    for x in range(8):
        for y in range(8):
            all_tiles.add((3, y, x))

    # Zoom 4: All 256 tiles of Earth (16×16 grid)
    for x in range(16):
        for y in range(16):
            all_tiles.add((4, y, x))

    # ── PACIFIC TRAVERSE WAYPOINTS (zoom 3 — already covered by full-earth above) ──
    # Waypoint A: Mid-Pacific (near Hawaii corridor)
    MID_PACIFIC = (20.0, -155.0)
    all_tiles.update(get_tiles_for_radius(MID_PACIFIC[0], MID_PACIFIC[1], 3, 2, 2))

    # Waypoint B: South-East Asia approach (Bay of Bengal)
    BAY_OF_BENGAL = (15.0, 80.0)
    all_tiles.update(get_tiles_for_radius(BAY_OF_BENGAL[0], BAY_OF_BENGAL[1], 3, 2, 2))

    # ── INBOUND: JAIPUR ─────────────────────────────────────────────────────────

    # Zoom-in #1: India → Rajasthan (zoom 6)
    all_tiles.update(get_tiles_for_radius(JAIPUR[0], JAIPUR[1], 6, 8, 7))    # Zoom 6 — subcontinent

    # Zoom-in #2: Rajasthan → Jaipur (zoom 9)
    all_tiles.update(get_tiles_for_radius(JAIPUR[0], JAIPUR[1], 9, 8, 7))    # Zoom 9 — metro

    # Zoom-in #3: Jaipur → city scale (zoom 12)
    all_tiles.update(get_tiles_for_radius(JAIPUR[0], JAIPUR[1], 12, 8, 7))   # Zoom 12 — urban grid

    # Final descent #1: city → low-altitude (zoom 14)
    all_tiles.update(get_tiles_for_radius(JAIPUR[0], JAIPUR[1], 14, 8, 7))   # Zoom 14 — low altitude

    # Landing / final zoom (zoom 15)
    all_tiles.update(get_tiles_for_radius(JAIPUR[0], JAIPUR[1], 15, 9, 8))   # Zoom 15 — street level

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
