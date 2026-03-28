"""
Phase 5 — Multi-Agent Resource Dispatcher
Inspired by Paper 2 (Evolve-DGN MARL framework).

Each medicine warehouse/depot = an autonomous agent.
When the ST-GNN flags an outbreak, agents automatically decide:
  - Which pharmacy to send stock to
  - How much to send
  - Priority = equity (serve underserved areas first)

Reward function (from Paper 2):
  R = w_eff * R_effectiveness + w_time * R_timeliness + w_eq * R_equity
"""

import json
import csv
import os
import random
import math

random.seed(42)

DATA_DIR = os.path.join(os.path.dirname(__file__), "../data")

# ── Config ────────────────────────────────────────────────────────────────────
W_EFFECTIVENESS = 0.35   # reward weight: demand filled
W_TIMELINESS    = 0.30   # reward weight: fast delivery
W_EQUITY        = 0.35   # reward weight: fair distribution

# Underserved upazilas get higher equity priority
EQUITY_PRIORITY = {
    "Panchbibi":       1.5,   # rural, harder to reach
    "Khetlal":         1.4,
    "Kalai":           1.3,
    "Akkelpur":        1.1,
    "Joypurhat Sadar": 1.0,
}

# ── Data classes (no external deps) ───────────────────────────────────────────
class Depot:
    """A medicine warehouse — acts as an autonomous MARL agent."""
    def __init__(self, depot_id, name, upazila, lat, lon, stock):
        self.depot_id  = depot_id
        self.name      = name
        self.upazila   = upazila
        self.lat       = lat
        self.lon       = lon
        self.stock     = dict(stock)   # {medicine: quantity}
        self.dispatches = []

    def can_dispatch(self, medicine, quantity):
        return self.stock.get(medicine, 0) >= quantity

    def dispatch(self, medicine, quantity, destination_id):
        if self.can_dispatch(medicine, quantity):
            self.stock[medicine] -= quantity
            self.dispatches.append({
                "medicine":    medicine,
                "quantity":    quantity,
                "destination": destination_id,
            })
            return True
        return False

class PharmacyNeed:
    """A pharmacy flagged as needing restock due to predicted outbreak."""
    def __init__(self, pharmacy_id, upazila, lat, lon,
                 medicine, current_stock, predicted_demand):
        self.pharmacy_id       = pharmacy_id
        self.upazila           = upazila
        self.lat               = lat
        self.lon               = lon
        self.medicine          = medicine
        self.current_stock     = current_stock
        self.predicted_demand  = predicted_demand
        self.shortage          = max(0, predicted_demand - current_stock)
        self.filled            = 0

# ── Helpers ───────────────────────────────────────────────────────────────────
def haversine_km(lat1, lon1, lat2, lon2):
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat/2)**2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2))
         * math.sin(dlon/2)**2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

def compute_reward(needs_before, needs_after, dispatches):
    """
    Multi-objective reward (Paper 2 formula).
    R = w_eff*R_eff + w_time*R_time + w_eq*R_eq
    """
    # Effectiveness: fraction of total shortage filled
    total_shortage = sum(n.shortage for n in needs_before)
    total_filled   = sum(n.filled   for n in needs_after)
    r_eff = total_filled / (total_shortage + 1e-9)

    # Timeliness: penalise by average travel distance
    total_dist = sum(d["distance_km"] for d in dispatches) if dispatches else 0
    r_time = -total_dist / (len(dispatches) + 1e-9) / 50.0  # normalise

    # Equity: weighted fill rate — underserved areas get higher weight
    equity_scores = []
    for need in needs_after:
        weight = EQUITY_PRIORITY.get(need.upazila, 1.0)
        fill_rate = need.filled / (need.shortage + 1e-9)
        equity_scores.append(weight * fill_rate)
    r_eq = sum(equity_scores) / (len(equity_scores) + 1e-9)

    total_reward = (W_EFFECTIVENESS * r_eff
                    + W_TIMELINESS  * r_time
                    + W_EQUITY      * r_eq)
    return total_reward, r_eff, r_time, r_eq

# ── MARL Dispatcher ───────────────────────────────────────────────────────────
class MARLDispatcher:
    """
    Simplified MARL dispatcher (rule-based policy for Phase 5 demo).
    In Phase 5 full implementation, replace policy() with a trained RL policy
    using RLlib or Gymnasium (see Paper 2 Evolve-DGN framework).
    """
    def __init__(self, depots):
        self.depots = depots

    def policy(self, depot, needs):
        """
        Agent policy: greedily assign to highest-priority need
        that this depot can reach and supply.
        Priority score = equity_weight * shortage / distance
        """
        best_need  = None
        best_score = -1

        for need in needs:
            if need.shortage <= 0:
                continue
            qty_to_send = min(
                need.shortage - need.filled,
                depot.stock.get(need.medicine, 0)
            )
            if qty_to_send <= 0:
                continue

            dist   = haversine_km(depot.lat, depot.lon, need.lat, need.lon)
            equity = EQUITY_PRIORITY.get(need.upazila, 1.0)
            score  = equity * qty_to_send / (dist + 1e-6)

            if score > best_score:
                best_score = score
                best_need  = need
                best_qty   = qty_to_send
                best_dist  = dist

        if best_need is None:
            return None

        return {
            "destination": best_need.pharmacy_id,
            "medicine":    best_need.medicine,
            "quantity":    best_qty,
            "distance_km": round(best_dist, 2),
            "upazila":     best_need.upazila,
        }

    def run_episode(self, needs):
        """
        One dispatch episode: each agent acts once per round, 3 rounds max.
        Returns list of dispatch records and final reward.
        """
        # Snapshot initial shortages for reward calculation
        needs_before = [PharmacyNeed(
            n.pharmacy_id, n.upazila, n.lat, n.lon,
            n.medicine, n.current_stock, n.predicted_demand) for n in needs]
        for nb, n in zip(needs_before, needs):
            nb.shortage = n.shortage

        all_dispatches = []

        for round_num in range(3):
            round_dispatches = []
            for depot in self.depots:
                action = self.policy(depot, needs)
                if action is None:
                    continue

                # Execute dispatch
                dest_need = next((n for n in needs
                                   if n.pharmacy_id == action["destination"]
                                   and n.medicine == action["medicine"]), None)
                if dest_need is None:
                    continue

                qty = action["quantity"]
                if depot.dispatch(action["medicine"], qty, action["destination"]):
                    dest_need.filled += qty
                    dest_need.shortage = max(0, dest_need.shortage - qty)
                    action["round"] = round_num + 1
                    round_dispatches.append(action)

            all_dispatches.extend(round_dispatches)
            if not round_dispatches:
                break   # no more useful dispatches

        reward, r_eff, r_time, r_eq = compute_reward(
            needs_before, needs, all_dispatches)

        return all_dispatches, reward, r_eff, r_time, r_eq

# ── Demo scenario ──────────────────────────────────────────────────────────────
def run_demo():
    print("═"*60)
    print("  MARL Dispatcher — Medicine Allocation Demo")
    print("═"*60)
    print("  Scenario: Dengue outbreak in Joypurhat Sadar +")
    print("            Diarrhea outbreak in Kalai/Khetlal\n")

    # 3 depots (district warehouses)
    depots = [
        Depot("D001", "District Central Depot",    "Joypurhat Sadar",
              lat=24.900, lon=89.019,
              stock={"Paracetamol 500mg": 2000, "ORS Sachet": 1500,
                     "Cetirizine 10mg": 800,    "Metronidazole 400mg": 600}),
        Depot("D002", "North Zone Depot",           "Kalai",
              lat=25.015, lon=89.065,
              stock={"Paracetamol 500mg": 1200, "ORS Sachet": 2000,
                     "Zinc 20mg (child)": 1000, "Metronidazole 400mg": 900}),
        Depot("D003", "East Zone Depot",            "Khetlal",
              lat=24.990, lon=89.112,
              stock={"Paracetamol 500mg": 800,  "ORS Sachet": 1200,
                     "Ciprofloxacin 500mg": 500, "Azithromycin 500mg": 400}),
    ]

    # Pharmacy needs flagged by the ST-GNN (simulated output)
    needs = [
        PharmacyNeed("PH001", "Joypurhat Sadar", 24.898, 89.017,
                     "Paracetamol 500mg",  current_stock=20,  predicted_demand=180),
        PharmacyNeed("PH002", "Joypurhat Sadar", 24.902, 89.021,
                     "Cetirizine 10mg",    current_stock=10,  predicted_demand=120),
        PharmacyNeed("PH008", "Kalai",           25.017, 89.063,
                     "ORS Sachet",         current_stock=15,  predicted_demand=200),
        PharmacyNeed("PH009", "Kalai",           25.022, 89.058,
                     "Metronidazole 400mg",current_stock=5,   predicted_demand=90),
        PharmacyNeed("PH011", "Khetlal",         24.988, 89.115,
                     "ORS Sachet",         current_stock=8,   predicted_demand=160),
        PharmacyNeed("PH014", "Panchbibi",       25.050, 89.150,   # underserved
                     "Paracetamol 500mg",  current_stock=5,   predicted_demand=100),
    ]

    dispatcher   = MARLDispatcher(depots)
    dispatches, reward, r_eff, r_time, r_eq = dispatcher.run_episode(needs)

    # ── Print dispatch plan ───────────────────────────────────────────────────
    print(f"  {'From Depot':<22} {'→ To Pharmacy':<10} {'Medicine':<22} {'Qty':>5}  {'km':>6}  Round")
    print("  " + "─"*78)
    for d in dispatches:
        depot_name = next(dep.name for dep in depots
                          if any(x["destination"]==d["destination"]
                                 and x["medicine"]==d["medicine"]
                                 for x in dep.dispatches))
        print(f"  {depot_name:<22} {d['destination']:<10} {d['medicine']:<22} "
              f"{d['quantity']:>5}  {d['distance_km']:>6}  {d['round']}")

    # ── Reward summary ────────────────────────────────────────────────────────
    print("\n  Reward breakdown (Paper 2 formula):")
    print(f"    R_effectiveness : {r_eff:.3f}  (demand fill rate)")
    print(f"    R_timeliness    : {r_time:.3f} (travel distance penalty)")
    print(f"    R_equity        : {r_eq:.3f}  (weighted by underserved areas)")
    print(f"    Total reward    : {reward:.3f}")

    # ── Shortage fill summary ─────────────────────────────────────────────────
    print("\n  Shortage fill status:")
    for need in needs:
        pct = 100 * need.filled / (need.shortage + need.filled + 1e-9)
        bar = "█" * int(pct / 10) + "░" * (10 - int(pct / 10))
        flag = " ← EQUITY PRIORITY" if EQUITY_PRIORITY.get(need.upazila,1) > 1.2 else ""
        print(f"    {need.pharmacy_id} {need.upazila:<20} [{bar}] {pct:5.1f}%{flag}")

    print("\n✓ Dispatcher run complete.")
    print("\nNext step: run  python models/train_stgnn.py → then connect to dashboard")

if __name__ == "__main__":
    run_demo()
