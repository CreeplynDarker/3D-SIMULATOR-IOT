"""Python rrcf 0.4.4 reference scores for the RCF cross-check (docs/PLAN.md sections 9.1-9.3, task P4.6).

Usage: python3 -I scripts/rrcf_reference.py [dataset_json]

Reads tests/fixtures/rcf_dataset.json written by `pnpm gen:fixtures`, normalises it as section 9.2 does (training
mean and population std, divisor max(std, stdFloor)), builds `numTrees` rrcf trees with the training points, and
scores every test window as section 9.3 does: insert under "tmp", codisp, forget, then mean codisp / nTrain. The
scores go in the fixture's "reference" field; the TS test checks the Spearman rank correlation against its own.
Needs numpy and rrcf 0.4.4 (`pip install numpy rrcf==0.4.4`).
"""
import json
import os
import sys
import warnings

import numpy as np

with warnings.catch_warnings():
    warnings.simplefilter("ignore")  # rrcf 0.4.4 imports pkg_resources, which warns on recent setuptools
    import rrcf

TMP_KEY = "tmp"


def scores(ds):
    train = np.array(ds["train"], dtype=float)
    test = np.array([t["row"] for t in ds["test"]], dtype=float)
    mean = train.mean(axis=0)
    scale = np.maximum(train.std(axis=0), np.array(ds["stdFloor"], dtype=float))
    z_train = (train - mean) / scale
    z_test = (test - mean) / scale
    forest = []
    for i in range(ds["numTrees"]):
        tree = rrcf.RCTree(random_state=ds["seed"] + i)
        for key, point in enumerate(z_train):
            tree.insert_point(point, index=key)
        forest.append(tree)
    out = []
    for point in z_test:
        total = 0.0
        for tree in forest:
            tree.insert_point(point, index=TMP_KEY)
            total += tree.codisp(TMP_KEY)
            tree.forget_point(TMP_KEY)
        out.append(total / len(forest) / len(z_train))
    return out


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(here, "..", "tests", "fixtures", "rcf_dataset.json")
    with open(path, encoding="utf-8") as f:
        ds = json.load(f)
    ds["reference"] = {"rrcf": rrcf.__version__, "numpy": np.__version__, "scores": scores(ds)}
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(json.dumps(ds) + "\n")
    print(f"wrote reference scores for {len(ds['test'])} windows to {path}")


if __name__ == "__main__":
    main()
