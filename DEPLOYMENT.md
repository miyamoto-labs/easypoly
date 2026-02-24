# Deployment Guide

## ✅ Code Migration Complete!

Your unified repo is now live: **https://github.com/miyamoto-labs/easypoly**

**286 files migrated**:
- ✅ Frontend (Next.js app)
- ✅ Engine (Python scanner)
- ✅ Bot (Node.js trading automation)

---

## 🚀 Update Your Deployments

### 1. Update Vercel (Frontend)

**Option A: Via CLI (Recommended)**

```bash
cd /Users/erik/.openclaw/workspace/easypoly-clean/frontend
npx vercel link

# When prompted:
# - Link to existing project? Yes
# - Select your easypoly/HeyConcierge project
# - Root directory: frontend

# Deploy
npx vercel --prod
```

**Option B: Via Vercel Dashboard**

1. Go to https://vercel.com/dashboard
2. Select your project (easypoly or heyconcierge-saas)
3. Settings → Git
4. Click "Disconnect" from old repo
5. Click "Connect Git Repository"
6. Select `miyamoto-labs/easypoly`
7. Set **Root Directory:** `frontend`
8. Click "Connect"

---

### 2. Update Railway (Engine)

1. Go to https://railway.app/dashboard
2. Select your easypoly-engine project
3. Settings → Service
4. Under "Source", click "Change Source"
5. Select `miyamoto-labs/easypoly`
6. Set **Root Directory:** `engine`
7. Save

**Environment Variables:**
Make sure these are still set in Railway:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `POLYMARKET_API_KEY`
- `SYNTHDATA_API_KEY` (if using)

---

### 3. Update Railway (Bot) - If Deployed

Same process as engine:
1. Railway Dashboard → bot project
2. Change source to `miyamoto-labs/easypoly`
3. Set **Root Directory:** `bot`

---

## 🔍 Verify Deployments

### Frontend
```bash
# Check if site is live
curl -I https://your-vercel-url.vercel.app

# Check API routes work
curl https://your-vercel-url.vercel.app/api/dashboard/picks
```

### Engine
```bash
# Check Railway logs
railway logs -p easypoly-engine

# Verify service is running
curl https://your-engine-url.railway.app/health
```

---

## 📝 DNS / Custom Domains

If you have custom domains (easypoly.io):

**Vercel:**
1. Vercel Dashboard → Project → Settings → Domains
2. Add `easypoly.io`
3. Update DNS:
   ```
   Type: CNAME
   Name: @
   Value: cname.vercel-dns.com
   ```

**Railway:**
- Custom domains require Railway Pro plan

---

## ✅ Post-Deployment Checklist

- [ ] Vercel deployment working
- [ ] Railway engine running
- [ ] Railway bot running (if applicable)
- [ ] Environment variables migrated
- [ ] Database connections working
- [ ] API routes responding
- [ ] Custom domains updated (if applicable)

---

## 🐛 Troubleshooting

**"Module not found" errors?**
- Check Root Directory is set correctly (`frontend/`, `engine/`, `bot/`)
- Verify `package.json` or `requirements.txt` exists in root

**Environment variables missing?**
- Re-add them in Vercel/Railway dashboard
- Don't commit `.env` files to git

**Build failures?**
- Check build logs in Vercel/Railway
- Verify dependencies are correct
- Make sure Node/Python versions match

---

## 🎉 Success!

Once deployments are updated:

1. **Old repos** (`easypoly-landing`, etc.) can be archived
2. **New unified repo** is your production source
3. **One repo** for everything = easier maintenance

**Hackathon submission:** https://github.com/miyamoto-labs/easypoly ✅

---

Need help? Check the deployment logs or ping me!
