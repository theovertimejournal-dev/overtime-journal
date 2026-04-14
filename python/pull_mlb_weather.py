"""
pull_mlb_weather.py

For each historical game, pull weather at game time from Open-Meteo
(free, no API key needed, historical archive goes back years).

Weather matters for:
  - Temperature: +5°F ~ +1% HR rate, affects scoring
  - Wind speed + direction: massive at open-air parks (Wrigley especially)
  - Humidity: affects ball carry
  - Precipitation: indicates rainouts/delays

Output: weather_features_{year}.parquet with event_id + weather fields

API: https://archive-api.open-meteo.com/v1/archive
  - free, no key, unlimited
  - historical data back to 1940s
"""
import os, sys, time, json, argparse, logging
from pathlib import Path
from collections import defaultdict
import requests, pandas as pd

BASE = "https://archive-api.open-meteo.com/v1/archive"
SLEEP = 0.10
MAX_RETRIES = 3
INPUT_DIR = Path("data")
OUTPUT_DIR = Path("data")
OUTPUT_DIR.mkdir(exist_ok=True)

logging.basicConfig(level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger("weather")


# Stadium coordinates (lat, long) + open-air flag + wind orientation
# Wind orientation: home plate -> center field bearing (degrees).
# Used to compute if wind is blowing OUT (toward CF) or IN (toward HP).
STADIUMS = {
    # Open-air parks (weather matters most)
    "ARIZONA_DIAMONDBACKS_MLB":     {"lat": 33.4452, "lon": -112.0667, "roof": True,  "cf_bearing": None},
    "ATLANTA_BRAVES_MLB":           {"lat": 33.8908, "lon": -84.4678,  "roof": False, "cf_bearing": 50},
    "BALTIMORE_ORIOLES_MLB":        {"lat": 39.2838, "lon": -76.6217,  "roof": False, "cf_bearing": 62},
    "BOSTON_RED_SOX_MLB":           {"lat": 42.3467, "lon": -71.0972,  "roof": False, "cf_bearing": 45},
    "CHICAGO_CUBS_MLB":             {"lat": 41.9475, "lon": -87.6560,  "roof": False, "cf_bearing": 31},
    "CHICAGO_WHITE_SOX_MLB":        {"lat": 41.8300, "lon": -87.6337,  "roof": False, "cf_bearing": 45},
    "CINCINNATI_REDS_MLB":          {"lat": 39.0974, "lon": -84.5071,  "roof": False, "cf_bearing": 125},
    "CLEVELAND_GUARDIANS_MLB":      {"lat": 41.4962, "lon": -81.6852,  "roof": False, "cf_bearing": 88},
    "COLORADO_ROCKIES_MLB":         {"lat": 39.7561, "lon": -104.9942, "roof": False, "cf_bearing": 3},
    "DETROIT_TIGERS_MLB":           {"lat": 42.3391, "lon": -83.0485,  "roof": False, "cf_bearing": 65},
    "KANSAS_CITY_ROYALS_MLB":       {"lat": 39.0517, "lon": -94.4803,  "roof": False, "cf_bearing": 45},
    "LOS_ANGELES_ANGELS_MLB":       {"lat": 33.8003, "lon": -117.8827, "roof": False, "cf_bearing": 45},
    "LOS_ANGELES_DODGERS_MLB":      {"lat": 34.0739, "lon": -118.2400, "roof": False, "cf_bearing": 22},
    "NEW_YORK_METS_MLB":            {"lat": 40.7571, "lon": -73.8458,  "roof": False, "cf_bearing": 60},
    "NEW_YORK_YANKEES_MLB":         {"lat": 40.8296, "lon": -73.9262,  "roof": False, "cf_bearing": 88},
    "OAKLAND_ATHLETICS_MLB":        {"lat": 37.7516, "lon": -122.2008, "roof": False, "cf_bearing": 56},
    "ATHLETICS_MLB":                {"lat": 38.5764, "lon": -121.4934, "roof": False, "cf_bearing": 49},  # Sacramento 2025
    "PHILADELPHIA_PHILLIES_MLB":    {"lat": 39.9057, "lon": -75.1665,  "roof": False, "cf_bearing": 17},
    "PITTSBURGH_PIRATES_MLB":       {"lat": 40.4469, "lon": -80.0057,  "roof": False, "cf_bearing": 115},
    "SAN_DIEGO_PADRES_MLB":         {"lat": 32.7076, "lon": -117.1566, "roof": False, "cf_bearing": 1},
    "SAN_FRANCISCO_GIANTS_MLB":     {"lat": 37.7786, "lon": -122.3893, "roof": False, "cf_bearing": 92},
    "WASHINGTON_NATIONALS_MLB":     {"lat": 38.8730, "lon": -77.0074,  "roof": False, "cf_bearing": 45},
    # Retractable roof (weather still matters when open)
    "HOUSTON_ASTROS_MLB":           {"lat": 29.7573, "lon": -95.3555,  "roof": "retractable", "cf_bearing": 340},
    "MIAMI_MARLINS_MLB":            {"lat": 25.7781, "lon": -80.2197,  "roof": "retractable", "cf_bearing": 67},
    "MILWAUKEE_BREWERS_MLB":        {"lat": 43.0280, "lon": -87.9712,  "roof": "retractable", "cf_bearing": 110},
    "SEATTLE_MARINERS_MLB":         {"lat": 47.5914, "lon": -122.3325, "roof": "retractable", "cf_bearing": 57},
    "STLOUIS_CARDINALS_MLB":        {"lat": 38.6226, "lon": -90.1928,  "roof": False, "cf_bearing": 102},
    "MINNESOTA_TWINS_MLB":          {"lat": 44.9817, "lon": -93.2772,  "roof": False, "cf_bearing": 90},
    "TEXAS_RANGERS_MLB":            {"lat": 32.7475, "lon": -97.0830,  "roof": "retractable", "cf_bearing": 353},
    "TORONTO_BLUE_JAYS_MLB":        {"lat": 43.6414, "lon": -79.3894,  "roof": "retractable", "cf_bearing": 325},
    # Dome (weather doesn't matter)
    "TAMPA_BAY_RAYS_MLB":           {"lat": 27.7682, "lon": -82.6534,  "roof": "dome", "cf_bearing": None},
}


def get_api(url, params=None):
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            r = requests.get(url, params=params, timeout=20)
            if r.status_code == 429:
                time.sleep(2 ** attempt); continue
            r.raise_for_status()
            return r.json()
        except requests.RequestException:
            if attempt == MAX_RETRIES: return None
            time.sleep(2 ** attempt)
    return None


# Cache weather per (stadium, date) since multiple games can share same stadium-day
_weather_cache = {}


def fetch_day_weather(lat, lon, date_str):
    """Pull hourly weather for one stadium on one date. Cached."""
    key = (round(lat, 3), round(lon, 3), date_str)
    if key in _weather_cache:
        return _weather_cache[key]

    params = {
        "latitude": lat,
        "longitude": lon,
        "start_date": date_str,
        "end_date": date_str,
        "hourly": "temperature_2m,relative_humidity_2m,wind_speed_10m,"
                  "wind_direction_10m,precipitation,cloud_cover",
        "temperature_unit": "fahrenheit",
        "wind_speed_unit": "mph",
    }
    payload = get_api(BASE, params)
    _weather_cache[key] = payload
    time.sleep(SLEEP)
    return payload


def wind_out_component(wind_speed, wind_direction, cf_bearing):
    """
    Positive value = wind blowing OUT to CF (more HRs).
    Negative = wind blowing IN from CF (fewer HRs).
    Magnitude scales with wind speed.
    """
    if cf_bearing is None or wind_speed is None or wind_direction is None:
        return None
    # Weather wind direction = direction FROM which wind is blowing
    # Blowing to CF means wind coming from home plate direction (180 deg from cf_bearing)
    # If wind_direction is near (cf_bearing + 180) mod 360, it's blowing out
    import math
    from_home = (cf_bearing + 180) % 360
    diff = abs(wind_direction - from_home)
    if diff > 180: diff = 360 - diff
    # Cos of angle: 1 = blowing perfectly out, -1 = blowing perfectly in
    alignment = math.cos(math.radians(diff))
    return round(wind_speed * alignment, 2)


def extract_game_weather(hourly, game_time_hour):
    """Given hourly data and the game's hour (0-23), get closest-hour values."""
    if not hourly: return {}
    times = hourly.get("time", [])
    temps = hourly.get("temperature_2m", [])
    humid = hourly.get("relative_humidity_2m", [])
    wind_sp = hourly.get("wind_speed_10m", [])
    wind_dir = hourly.get("wind_direction_10m", [])
    precip = hourly.get("precipitation", [])
    cloud = hourly.get("cloud_cover", [])

    # Find the index matching game hour
    idx = None
    for i, t in enumerate(times):
        try:
            hr = int(t[11:13])
            if hr == game_time_hour:
                idx = i
                break
        except (ValueError, IndexError):
            continue
    if idx is None:
        idx = min(len(times) - 1, game_time_hour)

    def safe(arr, i):
        try: return arr[i] if arr else None
        except IndexError: return None

    return {
        "wx_temp_f": safe(temps, idx),
        "wx_humidity": safe(humid, idx),
        "wx_wind_mph": safe(wind_sp, idx),
        "wx_wind_dir": safe(wind_dir, idx),
        "wx_precip": safe(precip, idx),
        "wx_cloud_cover": safe(cloud, idx),
    }


def process_year(year):
    games_path = INPUT_DIR / f"mlb_historical_{year}.parquet"
    if not games_path.exists():
        log.error("missing %s", games_path); return

    games = pd.read_parquet(games_path)
    games["game_date"] = pd.to_datetime(games["game_date"], utc=True)
    games["date_str"] = games["game_date"].dt.strftime("%Y-%m-%d")
    games["hour_local"] = games["game_date"].dt.hour  # UTC hour; close enough

    log.info("[%s] processing %s games...", year, len(games))
    rows = []
    for i, (_, g) in enumerate(games.iterrows()):
        stadium_info = STADIUMS.get(g["home_team"])
        if not stadium_info:
            rows.append({"event_id": g["event_id"]})
            continue

        roof = stadium_info.get("roof")
        row = {
            "event_id": g["event_id"],
            "wx_roof": str(roof),
            "wx_cf_bearing": stadium_info.get("cf_bearing"),
        }

        # Skip weather pull for pure domes (weather irrelevant)
        if roof == "dome":
            rows.append(row)
            continue

        payload = fetch_day_weather(stadium_info["lat"], stadium_info["lon"], g["date_str"])
        hourly = payload.get("hourly", {}) if payload else {}
        wx = extract_game_weather(hourly, int(g["hour_local"]))
        row.update(wx)

        # Derived: wind out toward CF (HR indicator)
        if roof is False:
            row["wx_wind_out"] = wind_out_component(
                row.get("wx_wind_mph"),
                row.get("wx_wind_dir"),
                stadium_info.get("cf_bearing"),
            )
        else:
            row["wx_wind_out"] = None  # retractable: don't know if it was open

        rows.append(row)

        if (i + 1) % 200 == 0:
            log.info("  %s/%s | cache: %s", i + 1, len(games), len(_weather_cache))

    df = pd.DataFrame(rows)
    out_path = OUTPUT_DIR / f"weather_features_{year}.parquet"
    df.to_parquet(out_path, index=False, compression="snappy")
    df.head(20).to_csv(OUTPUT_DIR / f"preview_weather_{year}.csv", index=False)

    cov = df["wx_temp_f"].notna().mean() if "wx_temp_f" in df.columns else 0
    log.info("[%s] saved %s rows | temp_cov=%.1f%%", year, len(df), 100 * cov)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--year", type=int, choices=[2024, 2025])
    args = p.parse_args()
    years = [args.year] if args.year else [2024, 2025]
    for y in years:
        process_year(y)
    log.info("DONE")


if __name__ == "__main__":
    main()
