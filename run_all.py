"""
run_all.py — Run the full pipeline in order.
Usage: python run_all.py
"""
import subprocess, sys, os

BASE = os.path.dirname(__file__)

steps = [
    ("Step 1 — Generate random data",
     [sys.executable, os.path.join(BASE, "data/generate_data.py")]),
    ("Step 2 — Build pharmacy graph network",
     [sys.executable, os.path.join(BASE, "utils/build_graph.py")]),
    ("Step 3+4 — Train ST-GNN model",
     [sys.executable, os.path.join(BASE, "models/train_stgnn.py")]),
    ("Step 5 — Run MARL dispatcher demo",
     [sys.executable, os.path.join(BASE, "models/marl_dispatcher.py")]),
]

for label, cmd in steps:
    print(f"\n{'═'*60}")
    print(f"  {label}")
    print(f"{'═'*60}\n")
    result = subprocess.run(cmd, cwd=BASE)
    if result.returncode != 0:
        print(f"\n✗ Failed at: {label}")
        sys.exit(1)

print("\n" + "═"*60)
print("  ✓ Full pipeline complete!")
print("  Edit data/pharmacies.csv and data/sales.csv")
print("  with real data, then re-run this script.")
print("═"*60)
