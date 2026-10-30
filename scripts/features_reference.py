"""NumPy reference for the firmware window features (docs/PLAN.md section 7.2).

Usage: python3 -I scripts/features_reference.py [fixture_dir]

Reads every tests/fixtures/features_*.json written by `pnpm gen:fixtures`, computes the features independently
of the TypeScript code, and stores them in the fixture's "reference" field. The TS test then checks that its own
features match within 1e-6 relative.
"""
import glob
import json
import os
import sys

import numpy as np

CF_RMS_FLOOR_G = 1e-6  # section 7.2: max(1e-6, rms) under each per-axis crest factor


def features(fx):
    c = fx["config"]
    w = fx["window"]
    acc = np.array([w["ax_lsb"], w["ay_lsb"], w["az_lsb"]], dtype=float) / c["lsbPerG"]
    d = acc - acc.mean(axis=1, keepdims=True)
    a_rms = float(np.sqrt(np.mean(np.sum(d**2, axis=0))))
    rms_k = np.sqrt(np.mean(d**2, axis=1))
    cf = float(np.max(np.max(np.abs(d), axis=1) / np.maximum(CF_RMS_FLOOR_G, rms_k)))

    counts = np.array(w["counts"], dtype=float)
    divider = (c["rTop_ohm"] + c["rBottom_ohm"]) / c["rBottom_ohm"]
    i = (counts - fx["counts0"]) * (c["vSpan_V"] / c["maxCount"]) * divider / c["sens_VperA"]
    i_rms = float(np.sqrt(np.mean(i**2)))
    rpm = w["edges"] * 60.0 / (c["tachPulsesPerRev"] * c["window_s"])

    temps = np.array(fx["temps"], dtype=float).reshape(-1, 2)
    t_c = float(temps[-1, 1]) if len(temps) else None
    recent = temps[temps[:, 0] >= fx["now_s"] - c["dtdtSpan_s"]] if len(temps) else temps
    dtdt = float(60.0 * np.polyfit(recent[:, 0], recent[:, 1], 1)[0]) if len(recent) >= c["dtdtMinSamples"] else None

    return {"a_rms_g": a_rms, "cf": cf, "i_rms_A": i_rms, "rpm": rpm, "t_C": t_c, "dtdt_C_per_min": dtdt}


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    fixture_dir = sys.argv[1] if len(sys.argv) > 1 else os.path.join(here, "..", "tests", "fixtures")
    files = sorted(glob.glob(os.path.join(fixture_dir, "features_*.json")))
    if not files:
        sys.exit("no features_*.json fixtures; run `pnpm gen:fixtures` first")
    for path in files:
        with open(path, encoding="utf-8") as f:
            fx = json.load(f)
        fx["reference"] = features(fx)
        with open(path, "w", encoding="utf-8", newline="\n") as f:
            f.write(json.dumps(fx, separators=(",", ":")) + "\n")
        r = fx["reference"]
        print(f"{fx['name']:12s} a_rms={r['a_rms_g']:.4f} g cf={r['cf']:.3f} i_rms={r['i_rms_A']:.4f} A "
              f"rpm={r['rpm']:.0f} t={r['t_C']} dtdt={r['dtdt_C_per_min']}")


if __name__ == "__main__":
    main()
