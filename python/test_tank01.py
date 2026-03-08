import requests, json, os
from dotenv import load_dotenv

load_dotenv()

key = os.environ.get("TANK01_API_KEY", "")
if not key:
    print("❌ TANK01_API_KEY not found in .env")
    exit()

headers = {
    "x-rapidapi-key": key,
    "x-rapidapi-host": "tank01-fantasy-stats.p.rapidapi.com"
}

print("Testing Tank01 API key...\n")

# Test 1: Injury list
print("=" * 50)
print("TEST 1: Injury List")
print("=" * 50)
r = requests.get("https://tank01-fantasy-stats.p.rapidapi.com/getNBAInjuryList", headers=headers, timeout=20)
print(f"Status: {r.status_code}")
print(json.dumps(r.json(), indent=2)[:3000])

# Test 2: Depth charts (BOS as sample)
print("\n" + "=" * 50)
print("TEST 2: Depth Charts (BOS)")
print("=" * 50)
r2 = requests.get("https://tank01-fantasy-stats.p.rapidapi.com/getNBADepthCharts", params={"teamAbv": "BOS"}, headers=headers, timeout=20)
print(f"Status: {r2.status_code}")
print(json.dumps(r2.json(), indent=2)[:3000])

# Test 3: Last 10 games (BOS)
print("\n" + "=" * 50)
print("TEST 3: Last 10 Games (BOS)")
print("=" * 50)
r3 = requests.get("https://tank01-fantasy-stats.p.rapidapi.com/getNBAGamesForTeam", params={"teamAbv": "BOS", "season": "2025", "numberOfGames": "3"}, headers=headers, timeout=20)
print(f"Status: {r3.status_code}")
print(json.dumps(r3.json(), indent=2)[:3000])
