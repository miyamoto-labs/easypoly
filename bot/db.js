const Database = require('better-sqlite3');
const crypto = require('crypto');
const path = require('path');

const DB_FILE = process.env.DB_FILE || '/data/easypoly.db';
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY; // 32-byte hex string

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_FILE);
    db.pragma('journal_mode = WAL');
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        user_id TEXT PRIMARY KEY,
        username TEXT DEFAULT '',
        first_name TEXT DEFAULT '',
        subscribed INTEGER DEFAULT 1,
        picks_received INTEGER DEFAULT 0,
        is_pro INTEGER DEFAULT 0,
        stripe_customer_id TEXT,
        poly_api_key TEXT,
        poly_api_secret TEXT,
        poly_api_passphrase TEXT,
        poly_wallet_address TEXT,
        joined_at TEXT DEFAULT (datetime('now'))
      );
    `);
    // Migration: add poly columns if they don't exist
    try { db.exec('ALTER TABLE users ADD COLUMN poly_api_key TEXT'); } catch (e) {}
    try { db.exec('ALTER TABLE users ADD COLUMN poly_api_secret TEXT'); } catch (e) {}
    try { db.exec('ALTER TABLE users ADD COLUMN poly_api_passphrase TEXT'); } catch (e) {}
    try { db.exec('ALTER TABLE users ADD COLUMN poly_wallet_address TEXT'); } catch (e) {}
    try { db.exec('ALTER TABLE users ADD COLUMN poly_private_key TEXT'); } catch (e) {}
    try { db.exec('ALTER TABLE users ADD COLUMN pro_source TEXT'); } catch (e) {} // 'stripe_bot' | 'supabase' | null
  }
  return db;
}

// ── AES-256-GCM Encryption ─────────────────────────────────
function encrypt(text) {
  if (!text || !ENCRYPTION_KEY) return text;
  const key = Buffer.from(ENCRYPTION_KEY, 'hex');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${tag}:${encrypted}`;
}

function decrypt(data) {
  if (!data || !ENCRYPTION_KEY || !data.includes(':')) return data;
  try {
    const [ivHex, tagHex, encrypted] = data.split(':');
    const key = Buffer.from(ENCRYPTION_KEY, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (e) {
    console.error('Decryption failed:', e.message);
    return null;
  }
}

const stmts = {};
function prepare(name, sql) {
  if (!stmts[name]) stmts[name] = getDb().prepare(sql);
  return stmts[name];
}

module.exports = {
  upsertUser(userId, username, firstName) {
    prepare('upsert', `
      INSERT INTO users (user_id, username, first_name) VALUES (?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        username = COALESCE(excluded.username, username),
        first_name = COALESCE(excluded.first_name, first_name)
    `).run(userId, username || '', firstName || '');
  },

  getUser(userId) {
    return prepare('get', 'SELECT * FROM users WHERE user_id = ?').get(userId);
  },

  setSubscribed(userId, subscribed) {
    prepare('sub', 'UPDATE users SET subscribed = ? WHERE user_id = ?').run(subscribed ? 1 : 0, userId);
  },

  incrementPicks(userId) {
    prepare('inc', 'UPDATE users SET picks_received = picks_received + 1 WHERE user_id = ?').run(userId);
  },

  markPro(userId, stripeCustomerId) {
    prepare('pro', 'UPDATE users SET is_pro = 1, pro_source = \'stripe_bot\', stripe_customer_id = ? WHERE user_id = ?').run(stripeCustomerId || null, userId);
  },

  markFree(userId) {
    prepare('free', 'UPDATE users SET is_pro = 0, pro_source = NULL WHERE user_id = ?').run(userId);
  },

  markProByStripeCustomer(stripeCustomerId) {
    prepare('proByStripe', 'UPDATE users SET is_pro = 1 WHERE stripe_customer_id = ?').run(stripeCustomerId);
  },

  setStripeCustomer(userId, stripeCustomerId) {
    prepare('setCust', 'UPDATE users SET stripe_customer_id = ? WHERE user_id = ?').run(stripeCustomerId, userId);
  },

  getActiveUsers() {
    return prepare('active', 'SELECT * FROM users WHERE subscribed = 1').all();
  },

  getAllUsers() {
    return prepare('all', 'SELECT * FROM users').all();
  },

  // ── Polymarket Credentials ──────────────────────────────
  setPolyCredentials(userId, apiKey, apiSecret, apiPassphrase, walletAddress, privateKey) {
    prepare('setPoly', `
      UPDATE users SET
        poly_api_key = ?,
        poly_api_secret = ?,
        poly_api_passphrase = ?,
        poly_wallet_address = ?,
        poly_private_key = ?
      WHERE user_id = ?
    `).run(
      encrypt(apiKey),
      encrypt(apiSecret),
      encrypt(apiPassphrase),
      walletAddress || '',
      privateKey ? encrypt(privateKey) : null,
      userId
    );
  },

  getPolyCredentials(userId) {
    const user = prepare('getPoly', 'SELECT poly_api_key, poly_api_secret, poly_api_passphrase, poly_wallet_address FROM users WHERE user_id = ?').get(userId);
    if (!user || !user.poly_api_key) return null;
    const apiKey = decrypt(user.poly_api_key);
    const apiSecret = decrypt(user.poly_api_secret);
    const apiPassphrase = decrypt(user.poly_api_passphrase);
    if (!apiKey || !apiSecret || !apiPassphrase) return null;
    return {
      apiKey,
      apiSecret,
      apiPassphrase,
      walletAddress: user.poly_wallet_address || ''
    };
  },

  clearPolyCredentials(userId) {
    prepare('clearPoly', `
      UPDATE users SET poly_api_key = NULL, poly_api_secret = NULL, poly_api_passphrase = NULL, poly_wallet_address = NULL
      WHERE user_id = ?
    `).run(userId);
  },

  hasPolyCredentials(userId) {
    const user = prepare('hasPoly', 'SELECT poly_api_key FROM users WHERE user_id = ?').get(userId);
    return !!(user && user.poly_api_key);
  },
  
  getPrivateKey(userId) {
    const user = prepare('getPrivKey', 'SELECT poly_private_key FROM users WHERE user_id = ?').get(userId);
    if (!user || !user.poly_private_key) return null;
    return decrypt(user.poly_private_key);
  },

  // ── Pro Status Sync ────────────────────────────────────
  /**
   * Returns all users that have a poly_wallet_address set.
   */
  getUsersWithWallets() {
    return prepare('withWallets',
      'SELECT user_id, poly_wallet_address, is_pro, pro_source FROM users WHERE poly_wallet_address IS NOT NULL AND poly_wallet_address != \'\''
    ).all();
  },

  /**
   * Syncs is_pro status from Supabase.
   * @param {Set<string>} proWallets - Set of lowercase wallet addresses that are Pro in Supabase
   * @returns {{ promoted: number, demoted: number }} counts of changes
   */
  syncProFromSupabase(proWallets) {
    const usersWithWallets = this.getUsersWithWallets();
    let promoted = 0;
    let demoted = 0;
    const promotedUserIds = [];

    const setPro = prepare('syncSetPro', 'UPDATE users SET is_pro = ?, pro_source = ? WHERE user_id = ?');

    for (const user of usersWithWallets) {
      const wallet = (user.poly_wallet_address || '').toLowerCase();
      const shouldBePro = proWallets.has(wallet);
      const isPro = !!user.is_pro;

      if (shouldBePro && !isPro) {
        setPro.run(1, 'supabase', user.user_id);
        promoted++;
        promotedUserIds.push(user.user_id);
      } else if (!shouldBePro && isPro && user.pro_source !== 'stripe_bot') {
        // Only demote if pro_source is NOT 'stripe_bot' (paid via Telegram Stripe)
        setPro.run(0, null, user.user_id);
        demoted++;
      }
    }

    return { promoted, demoted, promotedUserIds };
  },

  // Migrate existing JSON users into SQLite
  migrateFromJson(jsonUsers) {
    const insert = getDb().prepare(`
      INSERT OR IGNORE INTO users (user_id, username, first_name, subscribed, joined_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    const tx = getDb().transaction((users) => {
      for (const [id, u] of Object.entries(users)) {
        insert.run(id, u.username || '', u.firstName || u.first_name || '', u.subscribed ? 1 : 0, u.joinedAt || u.joined_at || new Date().toISOString());
      }
    });
    tx(jsonUsers);
  }
};
