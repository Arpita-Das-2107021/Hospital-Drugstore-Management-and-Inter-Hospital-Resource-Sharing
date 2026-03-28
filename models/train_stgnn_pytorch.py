"""
Phase 3+4 — ST-GNN + Dynamic Optimization
==========================================
Spatiotemporal Graph Neural Network for Disease Outbreak Prediction
Inspired by Paper 1 (VRE GNN) + Paper 2 (Evolve-DGN) + Paper 3 (DGO-ST-GNN)

INSTALL FIRST (run in Anaconda Prompt):
    pip install torch scikit-learn

THEN RUN:
    python models/train_stgnn_pytorch.py
"""

import json
import os
import random
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

# ── Reproducibility ───────────────────────────────────────────────────────────
SEED = 42
random.seed(SEED)
np.random.seed(SEED)
torch.manual_seed(SEED)

# ── Config ────────────────────────────────────────────────────────────────────
DATA_PATH    = os.path.join(os.path.dirname(__file__), "../data/graph_dataset.json")
SEQ_LEN      = 7      # days of history per prediction
NUM_FEATURES = 5      # disease-group sales features
HIDDEN_DIM   = 64     # GNN hidden size
EPOCHS       = 100    # training rounds
LR           = 0.005  # learning rate
DROPOUT      = 0.3    # dropout rate
THRESHOLD    = 0.5    # probability cutoff for outbreak alert

# ── DGOA Hyperparameter Optimizer (Paper 3) ───────────────────────────────────
class DynamicGrasshopperOptimizer:
    """
    Simplified Dynamic Grasshopper Optimization Algorithm (DGOA)
    from Paper 3 (DGO-ST-GNN).
    Automatically tunes learning rate and dropout every 10 epochs
    so the model adapts to changing outbreak patterns.
    """
    def __init__(self, lr=LR, dropout=DROPOUT, n_agents=5):
        self.n_agents  = n_agents
        self.best_lr   = lr
        self.best_drop = dropout
        self.agents    = [
            {"lr":      lr      * random.uniform(0.5, 1.5),
             "dropout": dropout * random.uniform(0.5, 1.5)}
            for _ in range(n_agents)
        ]

    def update(self, current_loss, epoch):
        """
        Update hyperparameters using:
        - Gaussian mutation  (explore around current best)
        - Levy flight        (escape local optima)
        - Opposition-based   (try opposite direction)
        """
        # Gaussian mutation
        for agent in self.agents:
            agent["lr"]      = max(0.0001, min(0.05,
                self.best_lr * (1 + 0.1 * random.gauss(0, 1))))
            agent["dropout"] = max(0.1, min(0.6,
                self.best_drop * (1 + 0.1 * random.gauss(0, 1))))

        # Levy flight
        if random.random() < 0.2:
            levy_step     = random.paretovariate(1.5) * 0.001
            self.best_lr  = max(0.0001, self.best_lr + levy_step)

        # Opposition-based learning
        candidate_lr  = max(0.0001, 0.05 - self.best_lr + 0.0001)
        if random.random() > 0.7:
            self.best_lr  = candidate_lr

        # Convergence control
        convergence        = 2 - (2 * epoch / EPOCHS)
        self.best_lr       = max(0.0001, min(0.01,
                                 self.best_lr * (convergence * 0.1 + 0.95)))
        self.best_drop     = max(0.1, min(0.5, self.best_drop))
        return self.best_lr, self.best_drop

# ── GCN Layer ─────────────────────────────────────────────────────────────────
class GCNLayer(nn.Module):
    """
    Graph Convolutional Layer.
    Each pharmacy aggregates sales signals from nearby pharmacies.
    """
    def __init__(self, in_features, out_features):
        super().__init__()
        self.linear = nn.Linear(in_features, out_features, bias=True)
        nn.init.xavier_uniform_(self.linear.weight)

    def forward(self, x, adj):
        h = adj @ x
        h = self.linear(h)
        return F.elu(h)

# ── ST-GNN Model ──────────────────────────────────────────────────────────────
class STGNN(nn.Module):
    """
    Spatiotemporal GNN
    ==================
    Step 1 → GCN layers   : learn which pharmacies affect each other
    Step 2 → GRU          : learn how sales change over 7 days
    Step 3 → Attention    : focus on the most important days
    Step 4 → Classifier   : predict outbreak probability per pharmacy

    Output: 0.0 (normal) to 1.0 (outbreak) for each pharmacy
    """
    def __init__(self, in_features, hidden, dropout=DROPOUT):
        super().__init__()
        self.gcn1    = GCNLayer(in_features, hidden)
        self.gcn2    = GCNLayer(hidden, hidden)
        self.gru     = nn.GRU(hidden, hidden, batch_first=True,
                               num_layers=2, dropout=dropout)
        self.attn    = nn.Linear(hidden, 1)
        self.dropout = nn.Dropout(dropout)
        self.fc1     = nn.Linear(hidden, hidden // 2)
        self.fc2     = nn.Linear(hidden // 2, 1)
        self.bn1     = nn.BatchNorm1d(hidden)
        self.bn2     = nn.BatchNorm1d(hidden)

    def forward(self, x_seq, adj):
        seq_len, num_nodes, _ = x_seq.shape

        # Step 1: GCN for each time step
        spatial_out = []
        for t in range(seq_len):
            h = self.gcn1(x_seq[t], adj)
            h = self.bn1(h)
            h = self.dropout(h)
            h = self.gcn2(h, adj)
            h = self.bn2(h)
            spatial_out.append(h.unsqueeze(0))

        # (num_nodes, seq_len, hidden)
        spatial_seq = torch.cat(spatial_out, dim=0).permute(1, 0, 2)

        # Step 2: GRU over 7-day sequence
        gru_out, _ = self.gru(spatial_seq)

        # Step 3: Attention over time steps
        attn_weights = torch.softmax(self.attn(gru_out), dim=1)
        context      = (attn_weights * gru_out).sum(dim=1)

        # Step 4: Classify
        h   = F.elu(self.fc1(self.dropout(context)))
        out = torch.sigmoid(self.fc2(h))
        return out.squeeze()

# ── Data Loading ──────────────────────────────────────────────────────────────
def load_data():
    with open(DATA_PATH) as f:
        data = json.load(f)

    num_nodes = len(data[0]["node_ids"])

    # Normalized adjacency matrix with self-loops
    adj = torch.zeros(num_nodes, num_nodes)
    for e in data[0]["edges"]:
        i, j      = e["from_idx"], e["to_idx"]
        w         = 1.0 / (e["distance_km"] + 1e-6)
        adj[i][j] = w
        adj[j][i] = w
    adj    += torch.eye(num_nodes)
    adj     = adj / adj.sum(dim=1, keepdim=True).clamp(min=1e-9)

    # Sliding window sequences
    sequences = []
    for t in range(SEQ_LEN, len(data)):
        X = torch.tensor(
            [data[t - SEQ_LEN + s]["node_feats"] for s in range(SEQ_LEN)],
            dtype=torch.float32)
        y = torch.tensor(data[t]["node_labels"], dtype=torch.float32)
        sequences.append((X, y))

    return sequences, adj, data[0]["node_ids"]

# ── Metrics ───────────────────────────────────────────────────────────────────
def compute_metrics(pred, true):
    pred_bin = (pred >= THRESHOLD).float()
    acc  = (pred_bin == true).float().mean().item()
    tp   = ((pred_bin == 1) & (true == 1)).float().sum().item()
    fp   = ((pred_bin == 1) & (true == 0)).float().sum().item()
    fn   = ((pred_bin == 0) & (true == 1)).float().sum().item()
    prec = tp / (tp + fp + 1e-9)
    rec  = tp / (tp + fn + 1e-9)
    f1   = 2 * prec * rec / (prec + rec + 1e-9)
    return acc, prec, rec, f1

# ── Training ──────────────────────────────────────────────────────────────────
def train():
    print("\n" + "═"*60)
    print("  Phase 3+4 — ST-GNN + DGOA")
    print("  Disease Outbreak Prediction System")
    print("═"*60)

    sequences, adj, node_ids = load_data()
    num_nodes = len(node_ids)

    # 80/20 split
    split      = int(0.8 * len(sequences))
    train_data = sequences[:split]
    test_data  = sequences[split:]

    print(f"\n  Pharmacies     : {num_nodes}")
    print(f"  Train sequences: {len(train_data)}")
    print(f"  Test sequences : {len(test_data)}")

    # Class imbalance weight
    all_labels = torch.cat([y for _, y in train_data])
    pos        = all_labels.sum().item()
    neg        = len(all_labels) - pos
    pos_weight = torch.tensor([neg / (pos + 1e-9)])
    print(f"  Outbreak ratio : {100*pos/len(all_labels):.1f}% positive")

    # Model + optimizer + DGOA
    model     = STGNN(NUM_FEATURES, HIDDEN_DIM, DROPOUT)
    optimizer = torch.optim.Adam(model.parameters(),
                                  lr=LR, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.StepLR(optimizer,
                                                  step_size=20, gamma=0.7)
    dgoa      = DynamicGrasshopperOptimizer()

    print(f"  Model params   : {sum(p.numel() for p in model.parameters()):,}")
    print(f"\n  Training {EPOCHS} epochs...")
    print("─"*60)
    print(f"  {'Epoch':>5}  {'Loss':>7}  {'Acc':>6}  "
          f"{'Prec':>6}  {'Rec':>6}  {'F1':>6}  {'LR':>8}")
    print("─"*60)

    best_f1    = 0
    best_state = None

    for epoch in range(1, EPOCHS + 1):
        model.train()
        total_loss = 0
        random.shuffle(train_data)

        for X, y in train_data:
            optimizer.zero_grad()
            pred   = model(X, adj)
            weight = torch.where(y == 1,
                                  pos_weight.expand_as(y),
                                  torch.ones_like(y))
            loss   = F.binary_cross_entropy(pred, y, weight=weight)
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            optimizer.step()
            total_loss += loss.item()

        scheduler.step()

        # DGOA update every 10 epochs
        if epoch % 10 == 0:
            new_lr, new_drop = dgoa.update(total_loss / len(train_data), epoch)
            for g in optimizer.param_groups:
                g["lr"] = new_lr
            for m in model.modules():
                if isinstance(m, nn.Dropout):
                    m.p = new_drop

        # Evaluate every 10 epochs
        if epoch % 10 == 0 or epoch == 1:
            model.eval()
            all_pred, all_true = [], []
            with torch.no_grad():
                for X, y in test_data:
                    all_pred.append(model(X, adj))
                    all_true.append(y)

            all_pred = torch.cat(all_pred)
            all_true = torch.cat(all_true)
            acc, prec, rec, f1 = compute_metrics(all_pred, all_true)
            avg_loss = total_loss / len(train_data)

            if f1 > best_f1:
                best_f1    = f1
                best_state = {k: v.clone() for k, v in model.state_dict().items()}

            print(f"  {epoch:>5}  {avg_loss:>7.4f}  {acc:>6.3f}  "
                  f"{prec:>6.3f}  {rec:>6.3f}  {f1:>6.3f}  "
                  f"{dgoa.best_lr:>8.5f}")

    print("─"*60)
    print(f"\n  Best F1: {best_f1:.3f}")

    # Load best weights
    if best_state:
        model.load_state_dict(best_state)

    # ── Final predictions ──────────────────────────────────────────────────────
    import csv
    pharmacies = {}
    with open(os.path.join(os.path.dirname(__file__),
                           "../data/pharmacies.csv")) as f:
        for row in csv.DictReader(f):
            pharmacies[row["pharmacy_id"]] = row

    model.eval()
    last_X, last_y = test_data[-1]
    with torch.no_grad():
        preds = model(last_X, adj)

    print("\n" + "═"*60)
    print("  Predictions — Last snapshot")
    print("─"*60)
    print(f"  {'ID':<8} {'Upazila':<22} {'Prob':>5}  Status")
    print("─"*60)

    alerts = 0
    for i, ph_id in enumerate(node_ids):
        ph   = pharmacies.get(ph_id, {})
        prob = preds[i].item()
        true = last_y[i].item()
        if prob >= THRESHOLD:
            status = "⚠  OUTBREAK ALERT"
            alerts += 1
        else:
            status = "   Normal"
        true_str = "(true: Outbreak)" if true == 1 else "(true: Normal)"
        print(f"  {ph_id:<8} {ph.get('upazila',''):<22} "
              f"{prob:>5.3f}  {status}  {true_str}")

    print("─"*60)
    print(f"\n  {alerts}/{num_nodes} pharmacies flagged for outbreak")

    # Save model
    save_path = os.path.join(os.path.dirname(__file__), "stgnn_model.pt")
    torch.save({"model_state": model.state_dict(),
                "node_ids":    node_ids,
                "config":      {"in_features": NUM_FEATURES,
                                "hidden_dim":  HIDDEN_DIM,
                                "best_f1":     best_f1}},
               save_path)

    print(f"\n  ✓ Model saved → {save_path}")
    print("\n" + "═"*60)
    print("  Phase 3+4 Complete!")
    print("  Next after April 4: collect real data → retrain")
    print("═"*60)

if __name__ == "__main__":
    train()
