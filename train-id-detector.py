#!/usr/bin/env python3
"""
Train a MobileNetV2 ID-card detector for CheckItApp.

─── Steps ──────────────────────────────────────────────────────────────────────

 1. Collect images (minimum ~40 per class, more = better):

      training-data/
        id/       ← photos of your UK provisional DL
                    • various angles (but keep it mostly flat)
                    • various lighting conditions
                    • card fills most of the frame
                    • JPEG or PNG

        not-id/   ← negative examples
                    • faces looking at the camera
                    • blank surfaces / walls
                    • hands, phones, other documents
                    • random indoor scenes

 2. Install requirements:

      pip install torch torchvision pillow

 3. Run this script:

      python train-id-detector.py

 4. Output will be saved to:

      public/models/id-detector/model.onnx

    The app loads this automatically on the ID scan screen.

────────────────────────────────────────────────────────────────────────────────
"""

import os, random
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, Dataset, random_split
from torchvision import models, transforms
from PIL import Image

# ── Config ────────────────────────────────────────────────────────────────────

DATA_DIR    = "training-data"
OUTPUT_DIR  = "public/models/id-detector"
INPUT_SIZE  = 224
EPOCHS      = 25
BATCH_SIZE  = 8
LR          = 1e-4
VAL_SPLIT   = 0.15
DEVICE      = "cuda" if torch.cuda.is_available() else "cpu"
CONFIDENCE_THRESHOLD = 0.82   # matches CameraScanner.tsx  (prob > 0.82 = card)

# ── Dataset ───────────────────────────────────────────────────────────────────

train_tf = transforms.Compose([
    transforms.Resize((INPUT_SIZE, INPUT_SIZE)),
    transforms.RandomHorizontalFlip(),
    transforms.RandomRotation(10),
    transforms.ColorJitter(brightness=0.3, contrast=0.3, saturation=0.2, hue=0.05),
    transforms.ToTensor(),
    transforms.Normalize([0.5, 0.5, 0.5], [0.5, 0.5, 0.5]),   # → [-1, 1]
])

eval_tf = transforms.Compose([
    transforms.Resize((INPUT_SIZE, INPUT_SIZE)),
    transforms.ToTensor(),
    transforms.Normalize([0.5, 0.5, 0.5], [0.5, 0.5, 0.5]),
])

class IDDataset(Dataset):
    """Labels: 0 = not-id,  1 = id"""
    def __init__(self, root, transform=None):
        self.samples   = []
        self.transform = transform
        for label, cls in enumerate(["not-id", "id"]):
            d = os.path.join(root, cls)
            if not os.path.isdir(d):
                print(f"  WARNING: directory not found: {d}")
                continue
            for f in os.listdir(d):
                if f.lower().endswith((".jpg", ".jpeg", ".png", ".webp")):
                    self.samples.append((os.path.join(d, f), label))
        random.shuffle(self.samples)

    def __len__(self):  return len(self.samples)

    def __getitem__(self, idx):
        path, label = self.samples[idx]
        img = Image.open(path).convert("RGB")
        if self.transform:
            img = self.transform(img)
        return img, label

# ── Model ─────────────────────────────────────────────────────────────────────

def build_model() -> nn.Module:
    """MobileNetV2 pretrained on ImageNet with binary classification head."""
    base = models.mobilenet_v2(weights=models.MobileNet_V2_Weights.IMAGENET1K_V1)
    # Freeze all backbone layers — only fine-tune the last block + head
    for name, param in base.features.named_parameters():
        block_idx = int(name.split(".")[0]) if name[0].isdigit() else -1
        param.requires_grad = block_idx >= 16   # unfreeze last 2 inverted residual blocks
    base.classifier = nn.Sequential(
        nn.Dropout(0.3),
        nn.Linear(base.last_channel, 64),
        nn.ReLU(),
        nn.Dropout(0.2),
        nn.Linear(64, 2),
    )
    return base

# ── Training loop ─────────────────────────────────────────────────────────────

def train():
    print(f"\n{'─'*60}")
    print(" CheckItApp — ID Card Detector Training")
    print(f"{'─'*60}")
    print(f" Device  : {DEVICE}")
    print(f" Data    : {DATA_DIR}/")
    print(f" Output  : {OUTPUT_DIR}/model.onnx")
    print(f"{'─'*60}\n")

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    full_ds = IDDataset(DATA_DIR, train_tf)
    if len(full_ds) < 10:
        print("ERROR: Not enough images found.")
        print("  Create training-data/id/ and training-data/not-id/ with images.")
        return

    id_count    = sum(1 for _, l in full_ds.samples if l == 1)
    notid_count = sum(1 for _, l in full_ds.samples if l == 0)
    print(f" Samples: {id_count} id,  {notid_count} not-id\n")

    val_size   = max(2, int(len(full_ds) * VAL_SPLIT))
    train_size = len(full_ds) - val_size
    train_ds, val_ds = random_split(full_ds, [train_size, val_size])
    # Use eval transforms for validation
    val_ds.dataset.transform = eval_tf

    train_loader = DataLoader(train_ds, batch_size=BATCH_SIZE, shuffle=True,  num_workers=0)
    val_loader   = DataLoader(val_ds,   batch_size=BATCH_SIZE, shuffle=False, num_workers=0)

    model     = build_model().to(DEVICE)
    criterion = nn.CrossEntropyLoss()
    optimizer = optim.AdamW(
        filter(lambda p: p.requires_grad, model.parameters()),
        lr=LR, weight_decay=1e-4
    )
    scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=EPOCHS, eta_min=1e-6)

    best_val_acc = 0.0

    for epoch in range(1, EPOCHS + 1):
        # Train
        model.train()
        train_loss = 0.0
        for imgs, labels in train_loader:
            imgs, labels = imgs.to(DEVICE), labels.to(DEVICE)
            optimizer.zero_grad()
            loss = criterion(model(imgs), labels)
            loss.backward()
            optimizer.step()
            train_loss += loss.item() * imgs.size(0)
        train_loss /= train_size
        scheduler.step()

        # Validate
        model.eval()
        correct = total = 0
        with torch.no_grad():
            for imgs, labels in val_loader:
                imgs, labels = imgs.to(DEVICE), labels.to(DEVICE)
                preds = model(imgs).argmax(dim=1)
                correct += (preds == labels).sum().item()
                total   += labels.size(0)

        val_acc = correct / max(total, 1)
        marker  = " ✓ (saved)" if val_acc >= best_val_acc else ""
        print(f" Epoch {epoch:02d}/{EPOCHS}  loss={train_loss:.4f}  val_acc={val_acc:.1%}{marker}")

        if val_acc >= best_val_acc:
            best_val_acc = val_acc
            _export_onnx(model)

    print(f"\n Best validation accuracy: {best_val_acc:.1%}")
    print(f" Model saved → {OUTPUT_DIR}/model.onnx")
    print(f"\n Drop it in public/models/id-detector/ and restart the dev server.\n")

# ── ONNX export ───────────────────────────────────────────────────────────────

def _export_onnx(model: nn.Module):
    model.eval()
    dummy = torch.randn(1, 3, INPUT_SIZE, INPUT_SIZE).to(DEVICE)
    path  = os.path.join(OUTPUT_DIR, "model.onnx")
    torch.onnx.export(
        model,
        dummy,
        path,
        input_names    = ["input"],
        output_names   = ["logits"],
        dynamic_axes   = {"input": {0: "batch"}, "logits": {0: "batch"}},
        opset_version  = 17,
        do_constant_folding = True,
    )

# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    train()
