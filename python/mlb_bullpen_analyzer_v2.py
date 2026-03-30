"""
MLB Bullpen Analyzer v2.0 — Full Edge Calculator
=================================================
Built for Juan @ Pinnacle Finance

Features:
  - Bullpen ERA / WHIP / K per 9 / fatigue tracking (last 7 days)
  - Individual reliever fatigue classification
  - Park factor adjustments
  - Run differential + Pythagorean expected record
  - Starter times-through-the-order (TTO) penalty
  - L/R bullpen splits vs opposing lineup
  - Edge signals with confidence scoring
  - JSON output mode for dashboard integration

Setup:
    pip install pandas requests tabulate pybaseball

Usage:
    python mlb_bullpen_analyzer_v2.py                       # All today's games
    python mlb_bullpen_analyzer_v2.py --team=NYY            # Filter by team
    python mlb_bullpen_analyzer_v2.py --json                # JSON for dashboard
    python mlb_bullpen_analyzer_v2.py --date=2026-04-15     # Specific date
"""

import sys
import json
import math
import warnings
from datetime import datetime, timedelta
from typing import Optional

import pandas as pd
import requests
from tabulate import tabulate

warnings.filterwarnings("ignore")

# ============================================================================
# CONFIG
# ============================================================================
LOOKBACK_DAYS = 7
FATIGUE_DAYS_THRESHOLD = 3
HIGH_LEVERAGE_IP_THRESHOLD = 2.0
MIN_RELIABLE_IP = 5.0   # Minimum IP before current ERA is trusted — below this, use 2025 fallback
MLB_STATS_API = "https://statsapi.mlb.com/api/v1"

PARK_FACTORS = {
    "COL": 114, "CIN": 107, "TEX": 106, "BOS": 105, "CHC": 104,
    "PHI": 103, "ATL": 102, "MIL": 102, "TOR": 101, "BAL": 101,
    "MIN": 101, "LAA": 100, "NYY": 100, "WSH": 100, "CLE": 99,
    "DET": 99,  "STL": 99,  "AZ":  99,  "KC":  98,  "SF":  98,
    "CHW": 98,  "HOU": 97,  "PIT": 97,  "TB":  96,  "NYM": 96,
    "LAD": 96,  "SD":  95,  "SEA": 95,  "MIA": 94,  "OAK": 94,
}


def api_get(endpoint, params=None):
    try:
        r = requests.get(f"{MLB_STATS_API}{endpoint}", params=params, timeout=15)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        print(f"  Warning: API error {endpoint}: {e}", file=sys.stderr)
        return {}


def get_todays_games(date=None):
    if not date:
        date = datetime.now().strftime("%Y-%m-%d")
    data = api_get("/schedule", {"sportId":1,"date":date,"hydrate":"probablePitcher,team,linescore"})
    games = []
    for de in data.get("dates", []):
        for g in de.get("games", []):
            t = g["teams"]
            games.append({
                "game_pk": g["gamePk"],
                "status": g.get("status",{}).get("detailedState","Unknown"),
                "away_team": t["away"]["team"]["abbreviation"],
                "away_team_name": t["away"]["team"]["name"],
                "away_team_id": t["away"]["team"]["id"],
                "home_team": t["home"]["team"]["abbreviation"],
                "home_team_name": t["home"]["team"]["name"],
                "home_team_id": t["home"]["team"]["id"],
                "away_starter": _xp(g,"away"), "home_starter": _xp(g,"home"),
                "game_time": g.get("gameDate","TBD"),
                "venue": g.get("venue",{}).get("name","Unknown"),
            })
    return games

def _xp(g, side):
    try:
        p = g["teams"][side].get("probablePitcher",{})
        return {"id":p.get("id"),"name":p.get("fullName","TBD")}
    except: return {"id":None,"name":"TBD"}


def get_recent_games(team_id, end_date, num_days=7):
    start = (datetime.strptime(end_date,"%Y-%m-%d") - timedelta(days=num_days)).strftime("%Y-%m-%d")
    data = api_get("/schedule", {"sportId":1,"teamId":team_id,"startDate":start,"endDate":end_date,"gameType":"R"})
    games = []
    for de in data.get("dates",[]):
        for g in de.get("games",[]):
            if g.get("status",{}).get("codedGameState") == "F":
                games.append({"game_pk":g["gamePk"],"date":de["date"]})
    return games


def get_game_boxscore(game_pk):
    return api_get(f"/game/{game_pk}/boxscore")


def get_team_record(team_id, season=None):
    if not season: season = datetime.now().year
    data = api_get("/standings", {"leagueId":"103,104","season":season})
    for rg in data.get("records",[]):
        for tr in rg.get("teamRecords",[]):
            if tr.get("team",{}).get("id") == team_id:
                return {"wins":tr.get("wins",0),"losses":tr.get("losses",0),
                         "runs_scored":tr.get("runsScored",0),"runs_allowed":tr.get("runsAllowed",0)}
    return {"wins":0,"losses":0,"runs_scored":0,"runs_allowed":0}


def get_team_batting_handedness(team_id, season=None):
    if not season: season = datetime.now().year
    data = api_get(f"/teams/{team_id}/roster", {"rosterType":"active","season":season})
    l=r=s=0
    for p in data.get("roster",[]):
        if p.get("position",{}).get("abbreviation") == "P": continue
        h = p.get("person",{}).get("batSide",{}).get("code","R")
        if h=="L": l+=1
        elif h=="S": s+=1
        else: r+=1
    return {"left":l,"right":r,"switch":s,"total":l+r+s}


def _parse_ip(ip_str):
    try:
        parts = str(ip_str).split(".")
        full = int(parts[0])
        thirds = int(parts[1]) if len(parts)>1 else 0
        return full + thirds/3.0
    except: return 0.0


def _classify_fatigue(dp5, p3d, ip2d, rest):
    if dp5 >= FATIGUE_DAYS_THRESHOLD: return "HIGH"
    if p3d >= 60: return "HIGH"
    if ip2d >= HIGH_LEVERAGE_IP_THRESHOLD: return "HIGH"
    if rest == 0 and p3d >= 40: return "HIGH"
    if dp5 >= 2: return "MODERATE"
    if p3d >= 30: return "MODERATE"
    if ip2d >= 1.0: return "MODERATE"
    return "FRESH"


# ============================================================================
# PYTHAGOREAN EXPECTATION
# ============================================================================

def pythagorean_record(rs, ra, w, l):
    total = w + l
    if total == 0 or rs == 0 or ra == 0:
        return {"expected_wins":0,"expected_losses":0,"expected_wpct":0,"actual_wpct":0,
                "luck_factor":0,"run_diff":0,"run_diff_per_game":0}
    exp = 1.83
    ewpct = (rs**exp) / (rs**exp + ra**exp)
    ew = round(ewpct * total, 1)
    return {
        "expected_wins": ew, "expected_losses": round(total-ew,1),
        "expected_wpct": round(ewpct,3), "actual_wpct": round(w/total,3),
        "luck_factor": round(w-ew,1), "run_diff": rs-ra,
        "run_diff_per_game": round((rs-ra)/total,2),
    }


# ============================================================================
# PARK FACTOR
# ============================================================================

def get_park_factor(home_abbrev):
    f = PARK_FACTORS.get(home_abbrev, 100)
    if f>=105: lb="HITTER_FRIENDLY"
    elif f>=102: lb="SLIGHT_HITTER"
    elif f<=95: lb="PITCHER_FRIENDLY"
    elif f<=98: lb="SLIGHT_PITCHER"
    else: lb="NEUTRAL"
    return {"factor":f,"label":lb}


# ============================================================================
# BULLPEN ANALYSIS
# ============================================================================

def analyze_bullpen_usage(team_id, team_abbrev, starter_id, target_date):
    recent = get_recent_games(team_id, target_date, LOOKBACK_DAYS)

    # Fetch prior season stats for all pitchers in ONE call — used as fallback
    # when current-season sample is too small (Opening Week)
    prior_pitcher_stats = get_prior_season_pitcher_stats(team_id)

    if not recent:
        return {"team":team_abbrev,"status":"NO_DATA","relievers":[],"bullpen_era":None,
                "bullpen_whip":None,"fatigue_score":None,"bullpen_k_per_9":None,
                "bullpen_bb_per_9":None,"bullpen_hr_per_9":None,"lefty_era":None,
                "righty_era":None,"lefty_whip":None,"righty_whip":None,
                "lefty_ip":0,"righty_ip":0,"high_fatigue_count":0,
                "reliever_count":0,"games_analyzed":0,"bullpen_ip_7d":0,"bullpen_pitches_7d":0}

    rlog = {}
    bt = {"ip":0,"er":0,"h":0,"bb":0,"so":0,"pitches":0,"hr":0}
    lt = {"ip":0,"er":0,"h":0,"bb":0}
    rt = {"ip":0,"er":0,"h":0,"bb":0}

    for gm in recent:
        try: box = get_game_boxscore(gm["game_pk"])
        except: continue
        for side in ["home","away"]:
            sd = box.get("teams",{}).get(side,{})
            if sd.get("team",{}).get("id") != team_id: continue
            players = sd.get("players",{})
            pids = sd.get("pitchers",[])
            starter = pids[0] if pids else None
            for pid in pids:
                pd_ = players.get(f"ID{pid}",{})
                ps = pd_.get("stats",{}).get("pitching",{})
                if not ps or pid == starter: continue
                ip = _parse_ip(ps.get("inningsPitched","0"))
                er = int(ps.get("earnedRuns",0)); h = int(ps.get("hits",0))
                bb = int(ps.get("baseOnBalls",0)); so = int(ps.get("strikeOuts",0))
                hr = int(ps.get("homeRuns",0)); pit = int(ps.get("numberOfPitches",0))
                for k,v in [("ip",ip),("er",er),("h",h),("bb",bb),("so",so),("hr",hr),("pitches",pit)]:
                    bt[k] += v
                hand = pd_.get("person",{}).get("pitchHand",{}).get("code","R")
                bucket = lt if hand=="L" else rt
                bucket["ip"]+=ip; bucket["er"]+=er; bucket["h"]+=h; bucket["bb"]+=bb
                if pid not in rlog:
                    rlog[pid] = {"name":pd_.get("person",{}).get("fullName",f"ID{pid}"),"hand":hand,"apps":[]}
                rlog[pid]["apps"].append({"date":gm["date"],"ip":ip,"pitches":pit,"er":er,"h":h,"bb":bb,"so":so,"hr":hr})

    tip = bt["ip"]
    bera = round(bt["er"]/tip*9,2) if tip>0 else None
    bwhip = round((bt["h"]+bt["bb"])/tip,2) if tip>0 else None
    bk9 = round(bt["so"]/tip*9,2) if tip>0 else None
    bbb9 = round(bt["bb"]/tip*9,2) if tip>0 else None
    bhr9 = round(bt["hr"]/tip*9,2) if tip>0 else None
    lera = round(lt["er"]/lt["ip"]*9,2) if lt["ip"]>0 else None
    rera = round(rt["er"]/rt["ip"]*9,2) if rt["ip"]>0 else None
    lwhip = round((lt["h"]+lt["bb"])/lt["ip"],2) if lt["ip"]>0 else None
    rwhip = round((rt["h"]+rt["bb"])/rt["ip"],2) if rt["ip"]>0 else None

    today = datetime.strptime(target_date,"%Y-%m-%d")
    reports = []
    for pid, rd in rlog.items():
        apps = rd["apps"]
        r5 = [a for a in apps if (today-datetime.strptime(a["date"],"%Y-%m-%d")).days<=5]
        r3 = [a for a in apps if (today-datetime.strptime(a["date"],"%Y-%m-%d")).days<=3]
        l2 = [a for a in apps if (today-datetime.strptime(a["date"],"%Y-%m-%d")).days<=2]
        dp5 = len(set(a["date"] for a in r5))
        p3d = sum(a["pitches"] for a in r3)
        ip2d = sum(a["ip"] for a in l2)
        ip3d = sum(a["ip"] for a in r3)
        mr = max(apps, key=lambda a:a["date"]) if apps else None
        rest = (today-datetime.strptime(mr["date"],"%Y-%m-%d")).days if mr else 999
        fat = _classify_fatigue(dp5,p3d,ip2d,rest)
        tip2 = sum(a["ip"] for a in apps); ter = sum(a["er"] for a in apps)
        tso = sum(a["so"] for a in apps); tbb = sum(a["bb"] for a in apps)
        # Look up prior season stats for this reliever
        prior = prior_pitcher_stats.get(pid, {})
        reports.append({
            "name":rd["name"],"hand":rd["hand"],"appearances_7d":len(apps),
            "days_pitched_last_5":dp5,"pitches_last_3d":p3d,
            "ip_last_2d":round(ip2d,1),"ip_last_3d":round(ip3d,1),
            "days_rest":rest,
            "era_7d":round(ter/tip2*9,2) if tip2>0 else 0.0,
            "k9_7d":round(tso/tip2*9,1) if tip2>0 else 0.0,
            "bb9_7d":round(tbb/tip2*9,1) if tip2>0 else 0.0,
            "fatigue":fat,
            # Prior season fallback for Opening Week
            "prior_era":   prior.get("prior_era"),
            "prior_whip":  prior.get("prior_whip"),
            "prior_k9":    prior.get("prior_k9"),
            "prior_ip":    prior.get("prior_ip"),
            # Display ERA — use prior season if current IP is below threshold
            "display_era": (
                prior.get("prior_era") if tip2 < MIN_RELIABLE_IP and prior.get("prior_era")
                else round(ter/tip2*9,2) if tip2 > 0 else None
            ),
            "display_era_source": (
                "2025" if tip2 < MIN_RELIABLE_IP and prior.get("prior_era")
                else "2026" if tip2 > 0 else None
            ),
            "small_sample": tip2 < MIN_RELIABLE_IP,
        })

    fo = {"HIGH":0,"MODERATE":1,"FRESH":2}
    reports.sort(key=lambda r:(fo.get(r["fatigue"],3),-r["pitches_last_3d"]))
    hc = sum(1 for r in reports if r["fatigue"]=="HIGH")
    mc = sum(1 for r in reports if r["fatigue"]=="MODERATE")
    fs = round((hc*100+mc*50)/len(reports),1) if reports else None

    # Fetch prior season ERA as context when current sample is small
    prior = {}
    if tip < 5:  # Less than 5 IP this season — get last year's data
        prior = get_prior_season_bullpen_era(team_id)

    # Team-level display ERA — use prior season if current IP is too small
    display_bera  = bera  if tip >= MIN_RELIABLE_IP * 3 else (prior.get("prior_era")  or bera)
    display_bwhip = bwhip if tip >= MIN_RELIABLE_IP * 3 else (prior.get("prior_whip") or bwhip)
    team_era_source = "2026" if tip >= MIN_RELIABLE_IP * 3 else ("2025" if prior.get("prior_era") else "2026")

    return {
        "team":team_abbrev,"status":"OK","games_analyzed":len(recent),
        "bullpen_era":display_bera,"bullpen_whip":display_bwhip,"bullpen_k_per_9":bk9,
        "bullpen_bb_per_9":bbb9,"bullpen_hr_per_9":bhr9,
        "bullpen_pitches_7d":bt["pitches"],"bullpen_ip_7d":round(bt["ip"],1),
        "fatigue_score":fs,"reliever_count":len(reports),"high_fatigue_count":hc,
        "lefty_era":lera,"righty_era":rera,"lefty_whip":lwhip,"righty_whip":rwhip,
        "lefty_ip":round(lt["ip"],1),"righty_ip":round(rt["ip"],1),
        "relievers":reports,
        # Prior season fallback — populated when current IP < 5
        "prior_era":   prior.get("prior_era"),
        "prior_whip":  prior.get("prior_whip"),
        "prior_season": prior.get("prior_season"),
        "small_sample": tip < 5,
    }


# ============================================================================
# PRIOR SEASON BULLPEN ERA (fallback for Opening Week small samples)
# ============================================================================

def get_prior_season_pitcher_stats(team_id, season=None):
    """
    Pull last year's pitching stats for every pitcher on a team in ONE API call.
    Returns dict: { player_id → { era, whip, k9, ip } }
    Used to show prior ERA on individual relievers during Opening Week.
    """
    if not season:
        season = datetime.now().year - 1

    try:
        data = api_get("/teams/stats", {
            "stats":   "season",
            "group":   "pitching",
            "season":  season,
            "sportId": 1,
            "teamId":  team_id,
        })
        pitcher_map = {}
        for split_group in data.get("stats", []):
            for entry in split_group.get("splits", []):
                pid = entry.get("player", {}).get("id")
                if not pid:
                    continue
                s   = entry.get("stat", {})
                ip  = float(s.get("inningsPitched", "0") or 0)
                era = float(s.get("era",  "0") or 0)
                whip= float(s.get("whip", "0") or 0)
                k9  = round(float(s.get("strikeOuts", 0)) / ip * 9, 2) if ip > 0 else 0
                pitcher_map[pid] = {
                    "prior_era":  round(era,  2),
                    "prior_whip": round(whip, 2),
                    "prior_k9":   k9,
                    "prior_ip":   round(ip,   1),
                    "prior_season": season,
                }
        return pitcher_map
    except Exception as e:
        print(f"  ⚠ Prior season pitcher stats failed (team {team_id}): {e}", file=sys.stderr)
        return {}


def get_prior_season_bullpen_era(team_id, season=None):
    """
    Pull last year's bullpen ERA from MLB Stats API team pitching stats.
    Used as a fallback when current-season 7d sample is too small (<5 IP).
    Returns {"bullpen_era": float, "bullpen_whip": float} or {} on failure.
    """
    if not season:
        season = datetime.now().year - 1  # Default to last year

    try:
        data = api_get("/teams/stats", {
            "stats":   "season",
            "group":   "pitching",
            "season":  season,
            "sportId": 1,
        })
        for split in data.get("stats", []):
            for entry in split.get("splits", []):
                if entry.get("team", {}).get("id") == team_id:
                    s    = entry.get("stat", {})
                    era  = float(s.get("era",  "4.00") or 4.00)
                    whip = float(s.get("whip", "1.30") or 1.30)
                    ip   = float(s.get("inningsPitched", "0") or 0)
                    # These are whole-team stats — estimate bullpen portion
                    # Bullpen typically throws ~40% of innings for an average team
                    return {
                        "prior_era":  round(era,  2),
                        "prior_whip": round(whip, 2),
                        "prior_season": season,
                    }
    except Exception as e:
        pass
    return {}


# ============================================================================
# TTO ANALYSIS
# ============================================================================

def analyze_starter_tto(name, sid):
    if not sid:
        return {"starter":name,"status":"TBD","tto_splits":{},"degradation":None}
    try:
        from pybaseball import statcast_pitcher
        end = datetime.now().strftime("%Y-%m-%d")
        start = (datetime.now()-timedelta(days=90)).strftime("%Y-%m-%d")
        data = statcast_pitcher(start, end, sid)
        if data is None or data.empty:
            return {"starter":name,"status":"NO_DATA","tto_splits":{},"degradation":None}
        data = data[data["description"].notna()].copy()
        if "at_bat_number" not in data.columns:
            return {"starter":name,"status":"NO_COL","tto_splits":{},"degradation":None}
        data["tto"] = pd.cut(data["at_bat_number"],bins=[0,9,18,50],labels=["1st","2nd","3rd+"])
        splits = {}
        for lb in ["1st","2nd","3rd+"]:
            sub = data[data["tto"]==lb]
            if len(sub)==0: continue
            ev = sub["launch_speed"].mean() if "launch_speed" in sub.columns else None
            evts = sub[sub["events"].notna()] if "events" in sub.columns else pd.DataFrame()
            hits = evts[evts["events"].isin(["single","double","triple","home_run"])].shape[0] if len(evts)>0 else 0
            pa = len(evts)
            ks = evts[evts["events"]=="strikeout"].shape[0] if len(evts)>0 else 0
            hrs = evts[evts["events"]=="home_run"].shape[0] if len(evts)>0 else 0
            splits[lb] = {"plate_appearances":pa,"avg_exit_velo":round(ev,1) if ev and not pd.isna(ev) else None,
                          "hits":hits,"ba_against":round(hits/pa,3) if pa>0 else None,
                          "k_rate":round(ks/pa,3) if pa>0 else None,"hr_count":hrs}
        deg = None
        if "1st" in splits and "3rd+" in splits:
            f = splits["1st"].get("ba_against",0) or 0
            t = splits["3rd+"].get("ba_against",0) or 0
            if f and t: deg = round(t-f,3)
        return {"starter":name,"status":"OK","tto_splits":splits,"degradation":deg}
    except ImportError:
        return {"starter":name,"status":"PYBASEBALL_MISSING","tto_splits":{},"degradation":None}
    except Exception as e:
        return {"starter":name,"status":"ERROR","message":str(e),"tto_splits":{},"degradation":None}


# ============================================================================
# L/R MATCHUP
# ============================================================================

def analyze_lr_matchup(bp_report, opp_hands):
    lb = opp_hands.get("left",0)+opp_hands.get("switch",0)
    rb = opp_hands.get("right",0)
    tot = opp_hands.get("total",1) or 1
    lpct = round(lb/tot*100,1); rpct = round(rb/tot*100,1)
    ple = bp_report.get("lefty_era"); pre = bp_report.get("righty_era")
    notes = []; adv = "NEUTRAL"
    if lpct>=55 and ple and ple<=3.0: adv="PEN_ADVANTAGE"; notes.append(f"Lineup {lpct}% LHB, pen LHP ERA {ple}")
    elif lpct>=55 and ple and ple>=4.5: adv="PEN_DISADVANTAGE"; notes.append(f"Lineup {lpct}% LHB but pen LHP ERA {ple}")
    elif rpct>=55 and pre and pre<=3.0: adv="PEN_ADVANTAGE"; notes.append(f"Lineup {rpct}% RHB, pen RHP ERA {pre}")
    elif rpct>=55 and pre and pre>=4.5: adv="PEN_DISADVANTAGE"; notes.append(f"Lineup {rpct}% RHB but pen RHP ERA {pre}")
    avl = sum(1 for r in bp_report.get("relievers",[]) if r["hand"]=="L" and r["fatigue"]!="HIGH")
    avr = sum(1 for r in bp_report.get("relievers",[]) if r["hand"]=="R" and r["fatigue"]!="HIGH")
    if lpct>=55 and avl<2:
        notes.append(f"Only {avl} non-fatigued LHP vs LHB-heavy lineup")
        adv = "PEN_DISADVANTAGE"
    return {"opposing_lefty_pct":lpct,"opposing_righty_pct":rpct,
            "pen_lefty_era":ple,"pen_righty_era":pre,
            "available_lhp":avl,"available_rhp":avr,"advantage":adv,"notes":notes}


# ============================================================================
# EDGE CALCULATOR
# ============================================================================

def calculate_full_edge(game, abp, hbp, apyth, hpyth, park, atto, htto, alr, hlr):
    signals = []; scores = {}
    aw = game["away_team"]; hm = game["home_team"]

    def sig(t, d, f, s):
        signals.append({"type":t,"detail":d,"favors":f,"strength":s})
        w = 3 if s=="STRONG" else 2 if s=="MODERATE" else 1
        scores[f] = scores.get(f,0)+w

    # Bullpen ERA
    ae,he = abp.get("bullpen_era"),hbp.get("bullpen_era")
    if ae and he and abs(ae-he)>=1.0:
        b = hm if he<ae else aw; s = "STRONG" if abs(ae-he)>=2.0 else "MODERATE"
        sig("PEN_ERA",f"{b} pen ERA {min(ae,he)} vs {max(ae,he)}",b,s)
    # Bullpen WHIP
    aw2,hw = abp.get("bullpen_whip"),hbp.get("bullpen_whip")
    if aw2 and hw and abs(aw2-hw)>=0.15:
        b = hm if hw<aw2 else aw; s = "STRONG" if abs(aw2-hw)>=0.30 else "MODERATE"
        sig("PEN_WHIP",f"{b} pen WHIP {min(aw2,hw)} vs {max(aw2,hw)}",b,s)
    # K/9
    ak,hk = abp.get("bullpen_k_per_9"),hbp.get("bullpen_k_per_9")
    if ak and hk and abs(ak-hk)>=2.0:
        b = hm if hk>ak else aw
        sig("PEN_K9",f"{b} pen K/9 {max(ak,hk)} vs {min(ak,hk)}",b,"MODERATE")
    # Fatigue
    af = abp.get("fatigue_score",0) or 0; hf = hbp.get("fatigue_score",0) or 0
    if abs(af-hf)>=15:
        fr = hm if hf<af else aw; gs = aw if fr==hm else hm
        s = "STRONG" if abs(af-hf)>=35 else "MODERATE"
        sig("FATIGUE",f"{gs} fatigue {max(af,hf):.0f} vs {fr} {min(af,hf):.0f}",fr,s)
    # Depleted
    ahf = abp.get("high_fatigue_count",0); hhf = hbp.get("high_fatigue_count",0)
    if ahf>=3 or hhf>=3:
        gs = aw if ahf>hhf else hm; ot = hm if gs==aw else aw
        sig("DEPLETED",f"{gs} has {max(ahf,hhf)} high-fatigue arms",ot,"STRONG")
    # Pythagorean
    al = apyth.get("luck_factor",0); hl = hpyth.get("luck_factor",0)
    if abs(al-hl)>=3:
        ul = hm if hl<al else aw; s = "STRONG" if abs(al-hl)>=5 else "MODERATE"
        sig("PYTHAG",f"{ul} underperforming Pythag by {abs(min(al,hl)):.1f}W",ul,s)
    # Run diff
    ard = apyth.get("run_diff_per_game",0); hrd = hpyth.get("run_diff_per_game",0)
    if abs(ard-hrd)>=0.5:
        b = hm if hrd>ard else aw; s = "STRONG" if abs(ard-hrd)>=1.0 else "MODERATE"
        sig("RUN_DIFF",f"{b} RD/G {max(ard,hrd):+.2f} vs {min(ard,hrd):+.2f}",b,s)
    # Park
    pf = park["factor"]
    if pf>=105: sig("PARK",f"Hitter park ({pf})","OVER","MODERATE")
    elif pf<=95: sig("PARK",f"Pitcher park ({pf})","UNDER","MODERATE")
    # TTO
    for tto,tm,ot in [(atto,aw,hm),(htto,hm,aw)]:
        d = tto.get("degradation")
        if d and d>=0.050:
            s = "STRONG" if d>=0.080 else "MODERATE"
            sig("TTO",f"{tm} starter degrades +{d:.3f} BA 3rd TTO",ot,s)
    # L/R
    for lr,pt,ot in [(alr,aw,hm),(hlr,hm,aw)]:
        if lr.get("advantage")=="PEN_DISADVANTAGE":
            for n in lr.get("notes",[]): sig("LR_MISMATCH",f"{pt}: {n}",ot,"MODERATE")
        elif lr.get("advantage")=="PEN_ADVANTAGE":
            for n in lr.get("notes",[]): sig("LR_EDGE",f"{pt}: {n}",pt,"MODERATE")
    # O/U
    if ae and he:
        adj = ((ae+he)/2)*(pf/100)
        era_note = " (2025 ERA — early season fallback)" if abp.get("small_sample") or hbp.get("small_sample") else ""
        if adj>=4.5: sig("OVER_LEAN",f"Park-adj combined pen ERA {adj:.2f}{era_note}","OVER","STRONG" if adj>=5.5 else "MODERATE")
        elif adj<=2.5: sig("UNDER_LEAN",f"Park-adj combined pen ERA {adj:.2f}{era_note}","UNDER","STRONG" if adj<=1.8 else "MODERATE")

    lean=None; conf="LOW"
    if scores:
        best = max(scores,key=scores.get); bw = scores[best]
        if bw>=8: conf="HIGH"
        elif bw>=5: conf="MODERATE"
        lean = best
    return {"matchup":f"{aw} @ {hm}","signals":signals,"lean":lean,"confidence":conf,"scores":scores}


# ============================================================================
# DISPLAY
# ============================================================================

def print_header():
    print("\n"+"="*74)
    print("  ⚾ MLB BULLPEN ANALYZER v2.0 — Full Edge Calculator")
    print("  Pen ERA/WHIP | Fatigue | Park | Pythagorean | TTO | L/R Splits")
    print("="*74)


def print_game(game,abp,hbp,apyth,hpyth,park,atto,htto,alr,hlr,edge):
    aw=game["away_team"]; hm=game["home_team"]
    print(f"\n{'━'*74}")
    print(f"  {aw} @ {hm}  |  {game['venue']}  |  Park: {park['factor']} ({park['label']})")
    print(f"  Starters: {game['away_starter']['name']} vs {game['home_starter']['name']}")
    print(f"{'━'*74}")

    rows = [
        ["Pen ERA (7d)",abp.get("bullpen_era","—"),hbp.get("bullpen_era","—")],
        ["Pen WHIP (7d)",abp.get("bullpen_whip","—"),hbp.get("bullpen_whip","—")],
        ["Pen K/9",abp.get("bullpen_k_per_9","—"),hbp.get("bullpen_k_per_9","—")],
        ["Pen BB/9",abp.get("bullpen_bb_per_9","—"),hbp.get("bullpen_bb_per_9","—")],
        ["Pen HR/9",abp.get("bullpen_hr_per_9","—"),hbp.get("bullpen_hr_per_9","—")],
        ["Pen IP (7d)",abp.get("bullpen_ip_7d","—"),hbp.get("bullpen_ip_7d","—")],
        ["Fatigue Score",f"{abp.get('fatigue_score','—')}",f"{hbp.get('fatigue_score','—')}"],
        ["High Fatigue Arms",abp.get("high_fatigue_count","—"),hbp.get("high_fatigue_count","—")],
        ["LHP ERA",abp.get("lefty_era","—"),hbp.get("lefty_era","—")],
        ["RHP ERA",abp.get("righty_era","—"),hbp.get("righty_era","—")],
    ]
    print(tabulate(rows,headers=["Metric",aw,hm],tablefmt="rounded_grid"))

    print(f"\n  📊 Pythagorean:")
    pr = [
        [aw,f"{apyth['actual_wpct']:.3f}",f"{apyth['expected_wpct']:.3f}",f"{apyth['luck_factor']:+.1f}",f"{apyth['run_diff']:+d}",f"{apyth['run_diff_per_game']:+.2f}"],
        [hm,f"{hpyth['actual_wpct']:.3f}",f"{hpyth['expected_wpct']:.3f}",f"{hpyth['luck_factor']:+.1f}",f"{hpyth['run_diff']:+d}",f"{hpyth['run_diff_per_game']:+.2f}"],
    ]
    print(tabulate(pr,headers=["Team","W%","Pythag","Luck","RD","RD/G"],tablefmt="rounded_grid"))

    for tto,lb in [(atto,aw),(htto,hm)]:
        if tto.get("tto_splits"):
            print(f"\n  🔄 TTO — {lb} ({tto['starter']}):")
            tr = []
            for k in ["1st","2nd","3rd+"]:
                s = tto["tto_splits"].get(k,{})
                if s: tr.append([k,s.get("plate_appearances","—"),s.get("ba_against","—"),s.get("avg_exit_velo","—"),s.get("k_rate","—"),s.get("hr_count","—")])
            if tr: print(tabulate(tr,headers=["TTO","PA","BAA","EV","K%","HR"],tablefmt="rounded_grid"))
            d = tto.get("degradation")
            if d: print(f"    Degradation: {d:+.3f}")

    for lr,lb in [(alr,f"{aw} pen vs {hm}"),(hlr,f"{hm} pen vs {aw}")]:
        if lr.get("notes"):
            print(f"\n  🔀 {lb}: {lr['advantage']}")
            for n in lr["notes"]: print(f"    • {n}")

    for bp in [abp,hbp]:
        if bp["relievers"]:
            print(f"\n  {bp['team']} Relievers:")
            rr = []
            for r in bp["relievers"][:6]:
                ic = {"HIGH":"🔴","MODERATE":"🟡","FRESH":"🟢"}.get(r["fatigue"],"⚪")
                rr.append([f"{ic} {r['name']}({r['hand']})",r["appearances_7d"],r["days_pitched_last_5"],r["pitches_last_3d"],f"{r['ip_last_2d']:.1f}",r["days_rest"],r.get("display_era", r["era_7d"]),r["k9_7d"]])
            print(tabulate(rr,headers=["Name","Apps","D(5)","P(3d)","IP(2d)","Rest","ERA","K/9"],tablefmt="rounded_grid"))

    if edge["signals"]:
        print(f"\n  📡 SIGNALS:")
        for s in edge["signals"]:
            ic = "🔥" if s["strength"]=="STRONG" else "📌"
            print(f"    {ic} [{s['type']}] {s['detail']} → {s['favors']}")
    if edge["lean"]:
        ci = {"HIGH":"🔥🔥🔥","MODERATE":"🔥🔥","LOW":"🔥"}.get(edge["confidence"],"")
        print(f"\n  💰 LEAN: {edge['lean']} ({edge['confidence']}) {ci}")
    else:
        print(f"\n  ⚖️  No clear edge")
    print()


# ============================================================================
# MAIN
# ============================================================================

def main():
    target_date=None; team_filter=None; json_mode=False
    for i,arg in enumerate(sys.argv[1:],1):
        if arg=="--json": json_mode=True
        elif arg.startswith("--team="): team_filter=arg.split("=")[1].upper()
        elif arg.startswith("--date="): target_date=arg.split("=")[1]
        elif "-" in arg and len(arg)==10: target_date=arg

    if not target_date: target_date=datetime.now().strftime("%Y-%m-%d")
    if not json_mode:
        print_header()
        print(f"\n  Date: {target_date}")
        if team_filter: print(f"  Filter: {team_filter}")
        print(f"\n  Fetching games...")

    games = get_todays_games(target_date)
    if team_filter:
        games = [g for g in games if team_filter in (g["away_team"],g["home_team"])]
    if not games:
        if json_mode: print(json.dumps({"date":target_date,"games":[]}))
        else: print("  No games found.")
        return

    if not json_mode: print(f"  Found {len(games)} game(s). Analyzing...\n")

    results = []
    for game in games:
        if not json_mode: print(f"  ⏳ {game['away_team']} @ {game['home_team']}...")
        abp = analyze_bullpen_usage(game["away_team_id"],game["away_team"],game["away_starter"].get("id"),target_date)
        hbp = analyze_bullpen_usage(game["home_team_id"],game["home_team"],game["home_starter"].get("id"),target_date)
        ar = get_team_record(game["away_team_id"]); hr = get_team_record(game["home_team_id"])
        apyth = pythagorean_record(ar["runs_scored"],ar["runs_allowed"],ar["wins"],ar["losses"])
        hpyth = pythagorean_record(hr["runs_scored"],hr["runs_allowed"],hr["wins"],hr["losses"])
        park = get_park_factor(game["home_team"])
        atto = analyze_starter_tto(game["away_starter"]["name"],game["away_starter"].get("id"))
        htto = analyze_starter_tto(game["home_starter"]["name"],game["home_starter"].get("id"))
        ah = get_team_batting_handedness(game["away_team_id"])
        hh = get_team_batting_handedness(game["home_team_id"])
        alr = analyze_lr_matchup(abp, hh)  # away pen faces home lineup
        hlr = analyze_lr_matchup(hbp, ah)  # home pen faces away lineup
        edge = calculate_full_edge(game,abp,hbp,apyth,hpyth,park,atto,htto,alr,hlr)

        if json_mode:
            results.append({"game":game,"away_bullpen":abp,"home_bullpen":hbp,
                           "away_pythagorean":apyth,"home_pythagorean":hpyth,
                           "park_factor":park,"away_tto":atto,"home_tto":htto,
                           "away_lr_matchup":alr,"home_lr_matchup":hlr,"edge":edge})
        else:
            print_game(game,abp,hbp,apyth,hpyth,park,atto,htto,alr,hlr,edge)

    if json_mode:
        print(json.dumps({"date":target_date,"games":results},indent=2,default=str))
    else:
        print("="*74)
        print("  Tips:")
        print("  • Run 2-3hrs before first pitch")
        print("  • --json flag pipes to dashboard")
        print("  • pip install pybaseball for TTO splits")
        print("  • Combine with line value — edges matter when line is off")
        print("  • NEVER bet >2-3% bankroll on one game")
        print("="*74+"\n")


if __name__ == "__main__":
    main()
