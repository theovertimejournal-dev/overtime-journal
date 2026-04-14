"""
pull_mlb_weather.py - v2 (BATCHED)

Drastically faster: one API call per (stadium, season) gets the entire season
of hourly weather. ~60 total calls instead of 4,700.

Strategy:
  1. For each stadium, pull ENTIRE SEASON hourly weather in ONE call
  2. Build a big in-memory lookup: (stadium, datetime_hour) -> weather dict
  3. For each game, look up weather by matching game start hour

Runtime: ~2-5 minutes total for both seasons.
"""
import os, sys, time, argparse, logging
from pathlib import Path
from datetime import datetime, timedelta
import math
import requests, pandas as pd

BASE = "https://archive-api.open-meteo.com/v1/archive"
SLEEP = 1.0  # polite 1 req/sec, we only do ~60 total
MAX_RETRIES = 3
INPUT_DIR = Path("data")
OUTPUT_DIR = Path("data")
OUTPUT_DIR.mkdir(exist_ok=True)

logging.basicConfig(level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger("weather")


# Stadium coordinates + CF bearing for wind direction math
STADIUMS = {
    "ARIZONA_DIAMONDBACKS_MLB":     {"lat": 33.4452, "lon": -112.0667, "roof": "retractable", "cf_bearing": None},
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
    "ATHLETICS_MLB":                {"lat": 38.5764, "lon": -121.4934, "roof": False, "cf_bearing": 49},
    "PHILADELPHIA_PHILLIES_MLB":    {"lat": 39.9057, "lon": -75.1665,  "roof": False, "cf_bearing": 17},
    "PITTSBURGH_PIRATES_MLB":       {"lat": 40.4469, "lon": -80.0057,  "roof": False, "cf_bearing": 115},
    "SAN_DIEGO_PADRES_MLB":         {"lat": 32.7076, "lon": -117.1566, "roof": False, "cf_bearing": 1},
    "SAN_FRANCISCO_GIANTS_MLB":     {"lat": 37.7786, "lon": -122.3893, "roof": False, "cf_bearing": 92},
    "WASHINGTON_NATIONALS_MLB":     {"lat": 38.8730, "lon": -77.0074,  "roof": False, "cf_bearing": 45},
    "HOUSTON_ASTROS_MLB":           {"lat": 29.7573, "lon": -95.3555,  "roof": "retractable", "cf_bearing": 340},
    "MIAMI_MARLINS_MLB":            {"lat": 25.7781, "lon": -80.2197,  "roof": "retractable", "cf_bearing": 67},
    "MILWAUKEE_BREWERS_MLB":        {"lat": 43.0280, "lon": -87.9712,  "roof": "retractable", "cf_bearing": 110},
    "SEATTLE_MARINERS_MLB":         {"lat": 47.5914, "lon": -122.3325, "roof": "retractable", "cf_bearing": 57},
    "STLOUIS_CARDINALS_MLB":        {"lat": 38.6226, "lon": -90.1928,  "roof": False, "cf_bearing": 102},
    "MINNESOTA_TWINS_MLB":          {"lat": 44.9817, "lon": -93.2772,  "roof": False, "cf_bearing": 90},
    "TEXAS_RANGERS_MLB":            {"lat": 32.7475, "lon": -97.0830,  "roof": "retractable", "cf_bearing": 353},
    "TORONTO_BLUE_JAYS_MLB":        {"lat": 43.6414, "lon": -79.3894,  "roof": "retractable", "cf_bearing": 325},
    "TAMPA_BAY_RAYS_MLB":           {"lat": 27.7682, "lon": -82.6534,  "roof": "dome", "cf_bearing": None},
}

SEASON_WINDOWS = {
    2024: ("2024-03-20", "2024-11-05"),
    2025: ("2025-03-18", "2025-11-05"),
}


def get_api(url, params=None):
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            r = requests.get(url, params=params, timeout=60)
            if r.status_code == 429:
                wait = 2 ** attempt + 10
                log.warning("429, sleeping %ss", wait)
                time.sleep(wait)
                continue
            r.raise_for_status()
            return r.json()
        except requests.RequestException as e:
            log.warning("attempt %s: %s", attempt, e)
            if attempt == MAX_RETRIES: return None
            time.sleep(2 ** attempt)
    return None


def fetch_stadium_season(team_id, stadium_info, season):
    """
    ONE API call gets entire season of hourly weather for one stadium.
    Returns a dict keyed by iso_hour_string -> weather dict.
    """
    roof = stadium_info.get("roof")
    if roof == "dome":
        return {}

    start, end = SEASON_WINDOWS[season]
    params = {
        "latitude": stadium_info["lat"],
        "longitude": stadium_info["lon"],
        "start_date": start,
        "end_date": end,
        "hourly": "temperature_2m,relative_humidity_2m,wind_speed_10m,"
                  "wind_direction_10m,precipitation,cloud_cover",
        "temperature_unit": "fahrenheit",
        "wind_speed_unit": "mph",
    }
    payload = get_api(BASE, params)
    time.sleep(SLEEP)
    if not payload:
        return {}

    hourly = payload.get("hourly", {})
    times = hourly.get("time", [])
    temps = hourly.get("temperature_2m", [])
    humid = hourly.get("relative_humidity_2m", [])
    wind_sp = hourly.get("wind_speed_10m", [])
    wind_dir = hourly.get("wind_direction_10m", [])
    precip = hourly.get("precipitation", [])
    cloud = hourly.get("cloud_cover", [])

    lookup = {}
    for i, t in enumerate(times):
        # t is like "2024-04-15T19:00" — use as key
        lookup[t] = {
            "wx_temp_f": temps[i] if i < len(temps) else None,
            "wx_humidity": humid[i] if i < len(humid) else None,
            "wx_wind_mph": wind_sp[i] if i < len(wind_sp) else None,
            "wx_wind_dir": wind_dir[i] if i < len(wind_dir) else None,
            "wx_precip": precip[i] if i < len(precip) else None,
            "wx_cloud_cover": cloud[i] if i < len(cloud) else None,
        }
    log.info("  %s %s: loaded %s hourly records", team_id, season, len(lookup))
    return lookup


def wind_out_component(wind_speed, wind_direction, cf_bearing):
    if cf_bearing is None or wind_speed is None or wind_direction is None:
        return None
    from_home = (cf_bearing + 180) % 360
    diff = abs(wind_direction - from_home)
    if diff > 180: diff = 360 - diff
    alignment = math.cos(math.radians(diff))
    return round(wind_speed * alignment, 2)


def process_year(year, weather_by_team):
    games_path = INPUT_DIR / f"mlb_historical_{year}.parquet"
    if not games_path.exists():
        log.error("missing %s", games_path); return

    games = pd.read_parquet(games_path)
    games["game_date"] = pd.to_datetime(games["game_date"], utc=True)

    log.info("[%s] matching %s games to weather...", year, len(games))
    rows = []
    for _, g in games.iterrows():
        team = g["home_team"]
        stadium = STADIUMS.get(team, {})
        roof = stadium.get("roof")
        row = {
            "event_id": g["event_id"],
            "wx_roof": str(roof),
            "wx_cf_bearing": stadium.get("cf_bearing"),
        }

        if roof == "dome" or not stadium:
            rows.append(row)
            continue

        lookup = weather_by_team.get(team, {})
        if not lookup:
            rows.append(row)
            continue

        # Game time in UTC, match to nearest hour key
        # Open-Meteo returns times in the stadium's local time... wait,
        # actually without timezone parameter it returns GMT. We passed UTC,
        # so we'll match to UTC hour floor.
        game_dt = g["game_date"]  # already utc
        key = game_dt.strftime("%Y-%m-%dT%H:00")
        wx = lookup.get(key, {})
        row.update(wx)

        # Derived wind-out
        if roof is False:
            row["wx_wind_out"] = wind_out_component(
                row.get("wx_wind_mph"),
                row.get("wx_wind_dir"),
                stadium.get("cf_bearing"),
            )
        else:
            row["wx_wind_out"] = None

        rows.append(row)

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
        log.info("=== fetching weather for %s ===", y)
        weather_by_team = {}
        for team_id, stadium_info in STADIUMS.items():
            if stadium_info.get("roof") == "dome":
                weather_by_team[team_id] = {}
                continue
            weather_by_team[team_id] = fetch_stadium_season(team_id, stadium_info, y)
        process_year(y, weather_by_team)

    log.info("DONE")


if __name__ == "__main__":
    main()
