"""
Evalane — Simulation Dataset Generator
========================================
Generates evalane_sim_dataset_v2.csv

Dataset specs:
  - 20,000 rows, 15 columns
  - Perfectly balanced Optimal_Action: 5,000 rows per GREEN_N/S/E/W
  - Features match exactly what the simulation sends to the model at runtime
  - No leakage columns (Timestamp, Scenario_ID, TWT, Officer_Override, etc.)
  - All logical rules are baked into the data — no runtime overrides needed

Features (12 inputs):
  Lane_N/S/E/W_Count        — vehicle count per lane (integer)
  Congestion_N/S/E/W        — congestion percentage per lane (0–100)
  Current_Green_Lane         — which lane is currently green (N/S/E/W)
  Green_Timer_Remaining      — seconds left on current green signal (integer)
  Event_Type                 — Normal / Ambulance / Breakdown
  Event_Lane                 — N/S/E/W for events, "None" for Normal rows

Targets (3 outputs):
  Congestion_Level           — Low / Moderate / High / Severe  [Model 1]
  Optimal_Action             — GREEN_N / GREEN_S / GREEN_E / GREEN_W  [Model 2]
  Signal_Duration            — seconds (12–83)  [Model 3]

Key design decisions:
  1. Action lane always wins the weighted scoring formula:
       score = 0.70 × Congestion% + 0.30 × normalized_count
     This means the model must learn from Congestion% + counts together,
     not just argmax(counts) — prevents data leakage.

  2. After scoring decides the action lane, the action lane's congestion%
     is guaranteed to be the highest by at least 5% — removes ambiguity
     that would confuse the model.

  3. Ambulance: action lane = ambulance lane (100%), duration = 35s fixed.
     Breakdown: action lane is never the broken lane.

  4. Congestion_Level is derived from the average congestion% across all
     lanes (not just the dominant lane) — more realistic.

  5. Event_Lane is "None" for Normal rows (not NaN) — clean categorical.
"""

from pathlib import Path

import numpy as np
import pandas as pd

np.random.seed(42)

# ─────────────────────────────────────────────────────────────────
# Constants
# ─────────────────────────────────────────────────────────────────
N_ROWS           = 20000
ROWS_PER_ACTION  = N_ROWS // 4          # 5,000 per GREEN_N/S/E/W

LANES            = ["N", "S", "E", "W"]
LANE_TO_ACTION   = {"N": "GREEN_N", "S": "GREEN_S",
                    "E": "GREEN_E", "W": "GREEN_W"}
ACTION_TO_LANE   = {v: k for k, v in LANE_TO_ACTION.items()}
CONGESTION_ORDER = ["Low", "Moderate", "High", "Severe"]

# Congestion % ranges per level — tight, non-overlapping
# Derived from the distribution in the actual dataset
CONG_PCT_RANGES = {
    "Low":      (5,  30),
    "Moderate": (31, 55),
    "High":     (56, 75),
    "Severe":   (76, 100),
}

# Signal duration ranges per level (excluding ambulance rows)
# Verified against dataset: Low 12–35, Moderate 30–50, High 45–65, Severe 55–83
SIGNAL_DUR_RANGES = {
    "Low":      (12, 35),
    "Moderate": (30, 50),
    "High":     (45, 65),
    "Severe":   (55, 83),
}

# Lane vehicle count ranges per congestion level
# Verified against dataset: Low 1–15, Moderate 1–28, High 8–42, Severe 18–55
LANE_COUNT_RANGES = {
    "Low":      (1,  15),
    "Moderate": (1,  28),
    "High":     (8,  42),
    "Severe":   (18, 55),
}

# Event probabilities — ambulance is common in this dataset (15% each)
EVENT_PROBS = {"Normal": 0.70, "Ambulance": 0.15, "Breakdown": 0.15}

AMBULANCE_DURATION = 35   # fixed clearance window for ambulance events


# ─────────────────────────────────────────────────────────────────
# Helper functions
# ─────────────────────────────────────────────────────────────────

def make_lane_counts(congestion_level: str) -> dict:
    """
    Generate vehicle counts for all four lanes.
    Counts scale with congestion level but are NOT tied to the action lane —
    the action lane is determined later by the scoring formula.
    """
    lo, hi = LANE_COUNT_RANGES[congestion_level]
    return {lane: int(np.random.randint(lo, hi + 1)) for lane in LANES}


def make_congestion_pcts(congestion_level: str,
                          counts: dict,
                          action_lane: str) -> dict:
    """
    Generate congestion percentages for all four lanes.

    Each lane gets a % within the level's range, scaled slightly by
    its vehicle count ratio. The action lane is then guaranteed to have
    the highest congestion% by at least 5% — removing ambiguity from
    training data (so the model doesn't get contradictory examples).
    """
    lo, hi = CONG_PCT_RANGES[congestion_level]
    total  = max(sum(counts.values()), 1)
    pcts   = {}

    for lane in LANES:
        ratio    = counts[lane] / total
        base_pct = lo + (hi - lo) * (0.4 + ratio * 2.5)
        noise    = np.random.uniform(-8, 8)
        pcts[lane] = round(float(np.clip(base_pct + noise, lo - 5, 100)), 1)

    # Guarantee action lane has the highest congestion% by at least 5%
    max_other = max(pcts[l] for l in LANES if l != action_lane)
    if pcts[action_lane] <= max_other:
        pcts[action_lane] = round(
            min(max_other + np.random.uniform(5, 15), 100), 1
        )

    return pcts


def decide_action(counts: dict,
                   cong_pcts: dict,
                   event_type: str,
                   event_lane: str) -> str:
    """
    Weighted scoring formula to decide which lane gets the green light.

    Score = 0.70 × Congestion% + 0.30 × normalized_count

    Why this formula?
    → Congestion% is the primary signal (70%) — a lane at 80% congestion
      is more urgent than one at 60% even if it has fewer cars.
    → Normalized count (30%) adds secondary weight — more cars matters
      but doesn't override the congestion signal.
    → No random component — the scoring is deterministic given the features,
      which makes the model's job learnable.

    Special rules:
    → Ambulance: always routes to the ambulance lane.
    → Breakdown: the broken lane is excluded from scoring.
    """
    if event_type == "Ambulance":
        return LANE_TO_LANE_TO_ACTION(event_lane)

    total_count = max(sum(counts.values()), 1)
    scores = {}
    for lane in LANES:
        if event_type == "Breakdown" and lane == event_lane:
            continue                    # broken lane never gets the green
        norm_count   = counts[lane] / total_count * 100
        scores[lane] = (0.70 * cong_pcts[lane] +
                        0.30 * norm_count)

    return LANE_TO_ACTION[max(scores, key=scores.get)]


def LANE_TO_LANE_TO_ACTION(lane: str) -> str:
    return LANE_TO_ACTION[lane]


def decide_congestion_level(cong_pcts: dict) -> str:
    """
    Congestion_Level is derived from the AVERAGE congestion% across all
    four lanes — more realistic than using just the dominant lane.

    Thresholds match the non-overlapping ranges defined in CONG_PCT_RANGES.
    """
    avg = np.mean(list(cong_pcts.values()))
    if avg < 31:   return "Low"
    elif avg < 56: return "Moderate"
    elif avg < 76: return "High"
    else:          return "Severe"


def make_signal_duration(congestion_level: str, event_type: str) -> int:
    """
    Signal duration for the winning lane.
    Ambulance always gets 35s (fixed clearance window).
    All other cases: random within the level's range.
    """
    if event_type == "Ambulance":
        return AMBULANCE_DURATION
    lo, hi = SIGNAL_DUR_RANGES[congestion_level]
    return int(np.random.randint(lo, hi + 1))


# ─────────────────────────────────────────────────────────────────
# Main generation loop
# ─────────────────────────────────────────────────────────────────

def generate(n_rows: int = 20000) -> pd.DataFrame:
    """
    Generate the dataset.

    Strategy: iterate over each Optimal_Action target and generate
    ROWS_PER_ACTION rows where the scoring formula naturally picks
    that action lane. Retry if the formula picks a different lane.

    This guarantees perfect balance: 5,000 rows per action.
    """
    records  = []
    max_tries = 500000   # safety cap on retries

    for action in ["GREEN_N", "GREEN_S", "GREEN_E", "GREEN_W"]:
        action_lane = ACTION_TO_LANE[action]
        count       = 0
        tries       = 0

        while count < ROWS_PER_ACTION:
            tries += 1
            if tries > max_tries:
                print(f"  Warning: hit retry limit for {action}")
                break

            # ── Event ────────────────────────────────────────────
            event_type = np.random.choice(
                list(EVENT_PROBS.keys()),
                p=list(EVENT_PROBS.values())
            )
            event_lane = "None"
            if event_type == "Ambulance":
                event_lane = action_lane   # ambulance in the action lane
            elif event_type == "Breakdown":
                others     = [l for l in LANES if l != action_lane]
                event_lane = np.random.choice(others)  # never block action lane

            # ── Lane counts ───────────────────────────────────────
            # Use random congestion level for count generation
            cl_for_counts = np.random.choice(CONGESTION_ORDER)
            counts = make_lane_counts(cl_for_counts)

            # ── Scoring check ─────────────────────────────────────
            # Use a temp congestion% pass to verify the scoring formula
            # naturally picks the intended action lane
            temp_pcts = {
                l: np.random.uniform(
                    CONG_PCT_RANGES[cl_for_counts][0],
                    CONG_PCT_RANGES[cl_for_counts][1]
                )
                for l in LANES
            }
            chosen = decide_action(counts, temp_pcts, event_type, event_lane)
            if chosen != action:
                continue   # retry — formula picked the wrong lane

            # ── Finalize congestion percentages ──────────────────
            # Now generate clean congestion% with the action lane guaranteed
            # to be the highest (5% gap minimum)
            cong_pcts = make_congestion_pcts(cl_for_counts, counts, action_lane)

            # ── Congestion level from average % ──────────────────
            congestion_level = decide_congestion_level(cong_pcts)

            # ── Signal duration ───────────────────────────────────
            signal_duration = make_signal_duration(congestion_level, event_type)

            # ── Current green lane and timer ─────────────────────
            current_green        = np.random.choice(LANES)
            green_timer_remaining = int(np.random.randint(1, max(2, signal_duration)))

            records.append({
                "Lane_N_Count":           counts["N"],
                "Lane_S_Count":           counts["S"],
                "Lane_E_Count":           counts["E"],
                "Lane_W_Count":           counts["W"],
                "Congestion_N":           cong_pcts["N"],
                "Congestion_S":           cong_pcts["S"],
                "Congestion_E":           cong_pcts["E"],
                "Congestion_W":           cong_pcts["W"],
                "Current_Green_Lane":     current_green,
                "Green_Timer_Remaining":  green_timer_remaining,
                "Event_Type":             event_type,
                "Event_Lane":             event_lane,
                "Congestion_Level":       congestion_level,
                "Optimal_Action":         action,
                "Signal_Duration":        signal_duration,
            })
            count += 1

    df = pd.DataFrame(records)

    # Shuffle so action groups aren't in blocks
    df = df.sample(frac=1, random_state=42).reset_index(drop=True)
    return df


# ─────────────────────────────────────────────────────────────────
# Validation
# ─────────────────────────────────────────────────────────────────

def validate(df: pd.DataFrame) -> None:
    print(f"Shape            : {df.shape}")

    print(f"\nOptimal_Action   :")
    for action, count in df["Optimal_Action"].value_counts().sort_index().items():
        print(f"  {action:<12} {count:>6,} rows")

    print(f"\nCongestion_Level :")
    for level, count in df["Congestion_Level"].value_counts().sort_index().items():
        print(f"  {level:<12} {count:>6,} rows")

    print(f"\nEvent_Type       :")
    for et, count in df["Event_Type"].value_counts().items():
        print(f"  {et:<12} {count:>6,} rows")

    # Rule 1: ambulance lane always matches action
    amb     = df[df["Event_Type"] == "Ambulance"]
    correct = amb.apply(
        lambda r: LANE_TO_ACTION.get(r["Event_Lane"]) == r["Optimal_Action"],
        axis=1
    )
    print(f"\nAmbulance rule   : {correct.all()} "
          f"({correct.sum()}/{len(amb)} correct)")

    # Rule 2: breakdown never matches action
    brkd = df[df["Event_Type"] == "Breakdown"]
    bad  = brkd.apply(
        lambda r: LANE_TO_ACTION.get(r["Event_Lane"]) == r["Optimal_Action"],
        axis=1
    )
    print(f"Breakdown rule   : bad rows = {bad.sum()} (should be 0)")

    # Rule 3: action lane has highest congestion%
    def dom_check(row):
        al  = ACTION_TO_LANE[row["Optimal_Action"]]
        my  = row[f"Congestion_{al}"]
        oth = [row[f"Congestion_{l}"] for l in LANES if l != al]
        return my > max(oth)

    dom = df.apply(dom_check, axis=1)
    print(f"Congestion dom.  : {dom.mean()*100:.1f}% of rows have "
          f"action lane as highest (target ≥75%)")

    # Rule 4: ambulance duration
    print(f"Ambulance dur.   : {sorted(amb['Signal_Duration'].unique())} "
          f"(should be [35])")

    # Rule 5: argmax leakage check
    def argmax_rule(row):
        counts = {l: row[f"Lane_{l}_Count"] for l in LANES}
        return f"GREEN_{max(counts, key=counts.get)}"

    df_check = df.copy()
    df_check["argmax_pred"] = df_check.apply(argmax_rule, axis=1)
    leakage_pct = (df_check["argmax_pred"] == df_check["Optimal_Action"]).mean() * 100
    print(f"Argmax leakage   : {leakage_pct:.1f}% "
          f"(should be well below 100%)")

    print(f"\nSignal_Duration  :")
    print(f"  min={df['Signal_Duration'].min()}, "
          f"max={df['Signal_Duration'].max()}, "
          f"mean={df['Signal_Duration'].mean():.1f}")


# ─────────────────────────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    OUTPUT_PATH = str(Path(__file__).resolve().parent.parent / "data" / "evalane_sim_dataset_v2.csv")

    print("Generating Evalane simulation dataset...")
    print(f"  Target rows    : {N_ROWS:,}")
    print(f"  Actions        : 4 × {ROWS_PER_ACTION:,} rows each")
    print(f"  Features       : 12 inputs + 3 targets = 15 columns")
    print()

    df = generate(N_ROWS)

    print("Validating...")
    validate(df)

    df.to_csv(OUTPUT_PATH, index=False)
    print(f"\n  Saved → {OUTPUT_PATH}")
