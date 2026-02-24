# Migration Guide

## Consolidating Your Repos

You have 3 existing repos to merge:

```
easypoly-landing  → frontend/
easypoly-engine   → engine/
easypoly-bot      → bot/
```

## Quick Migration

### Option 1: Automated Script

```bash
# Clone all 3 repos into ~/code
cd ~/code
git clone git@github.com:miyamoto-labs/easypoly-landing.git
git clone git@github.com:miyamoto-labs/easypoly-engine.git
git clone git@github.com:miyamoto-labs/easypoly-bot.git

# Copy into unified repo
cd easypoly
rsync -av --exclude='.git' --exclude='node_modules' ../easypoly-landing/ ./frontend/
rsync -av --exclude='.git' --exclude='__pycache__' ../easypoly-engine/ ./engine/
rsync -av --exclude='.git' --exclude='node_modules' ../easypoly-bot/ ./bot/

# Commit
git add .
git commit -m "Migrate all repos into monorepo for hackathon"
```

### Option 2: Manual

1. Copy `easypoly-landing/` contents → `easypoly/frontend/`
2. Copy `easypoly-engine/` contents → `easypoly/engine/`
3. Copy `easypoly-bot/` contents → `easypoly/bot/`
4. Update any hardcoded paths in your code
5. Test everything works

## After Migration

### 1. Install Dependencies

```bash
# Frontend
cd frontend && npm install

# Engine
cd ../engine && pip install -r requirements.txt

# Bot
cd ../bot && npm install
```

### 2. Configure Environment

Each folder needs its own `.env`:

```bash
cp frontend/.env.example frontend/.env.local
cp engine/.env.example engine/.env
cp bot/.env.example bot/.env
```

### 3. Test Locally

```bash
# Terminal 1: Engine
cd engine && python main.py

# Terminal 2: Frontend
cd frontend && npm run dev

# Terminal 3: Bot (optional)
cd bot && node src/index.js
```

### 4. Push to GitHub

```bash
# Create repo on GitHub: miyamoto-labs/easypoly
git remote add origin git@github.com:miyamoto-labs/easypoly.git
git push -u origin main
```

## Done!

Your unified repo is now ready for hackathon submission.

Submit this URL: `https://github.com/miyamoto-labs/easypoly`
