# Hackathon Submission Checklist

## Pre-Submission

### 1. Make Repos Public ✅ (Do this first)
```bash
gh repo edit miyamoto-labs/easypoly-landing --visibility public
gh repo edit miyamoto-labs/easypoly-engine --visibility public
gh repo edit miyamoto-labs/easypoly-bot --visibility public
```

### 2. Migrate Code ⏳
```bash
cd ~/code
# Clone your 3 repos
git clone git@github.com:miyamoto-labs/easypoly-landing.git
git clone git@github.com:miyamoto-labs/easypoly-engine.git
git clone git@github.com:miyamoto-labs/easypoly-bot.git

# Copy into unified repo
cd easypoly
rsync -av --exclude='.git' --exclude='node_modules' ../easypoly-landing/ ./frontend/
rsync -av --exclude='.git' --exclude='__pycache__' ../easypoly-engine/ ./engine/
rsync -av --exclude='.git' --exclude='node_modules' ../easypoly-bot/ ./bot/
```

### 3. Test Locally ⏳
```bash
# Engine
cd engine && python main.py

# Frontend (separate terminal)
cd frontend && npm run dev

# Verify both work
```

### 4. Create GitHub Repo ⏳
1. Go to https://github.com/orgs/miyamoto-labs/repositories
2. Click "New repository"
3. Name: `easypoly`
4. Visibility: **Public**
5. Don't initialize with README
6. Create

### 5. Push to GitHub ⏳
```bash
cd ~/code/easypoly
git init
git add .
git commit -m "Initial hackathon submission"
git remote add origin git@github.com:miyamoto-labs/easypoly.git
git push -u origin main
```

---

## Submission Materials

### Required ✅
- [x] GitHub repo (public)
- [ ] README with Synthdata integration explanation
- [ ] Working demo (at least screenshots)
- [ ] Clean, documented code

### Optional (Recommended)
- [ ] Demo video (5-10 min walkthrough)
- [ ] Live deployment (Vercel frontend)
- [ ] Twitter announcement (@easypoly_lol)
- [ ] Pitch deck (docs/PITCH.pdf)

---

## Quality Checks

### Code Quality
- [ ] No hardcoded API keys
- [ ] Clean commit history
- [ ] Well-organized folder structure
- [ ] Dependencies documented

### Documentation
- [ ] README explains Synthdata usage clearly
- [ ] Installation instructions work
- [ ] Architecture diagram (optional but good)
- [ ] API endpoints documented

### Functionality
- [ ] Synthdata API calls work
- [ ] Frontend renders correctly
- [ ] No broken imports/paths
- [ ] Environment variables documented

---

## Submission

1. Register at https://dashboard.synthdata.co/hackathon
2. Submit GitHub URL: `https://github.com/miyamoto-labs/easypoly`
3. Add demo video (if required)
4. Wait for confirmation email

---

## Post-Submission

- [ ] Tweet about submission (@miyamotolabs, @easypoly_lol)
- [ ] Share in Bittensor Discord (Synth channel)
- [ ] Monitor hackathon updates
- [ ] Prepare for judging/demo day

---

**Good luck! 🚀**
