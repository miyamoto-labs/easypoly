const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const BOT_URL = process.env.BOT_URL || 'https://easypoly-bot-production.up.railway.app'; // update after deploy

async function stripeRequest(path, params) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${STRIPE_SECRET}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params).toString(),
  });
  return res.json();
}

async function stripeGet(path) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    headers: { 'Authorization': `Bearer ${STRIPE_SECRET}` },
  });
  return res.json();
}

// Create or retrieve the EasyPoly Pro price (cached after first call)
let cachedPriceId = process.env.STRIPE_PRICE_ID || null;

async function getOrCreatePrice() {
  if (cachedPriceId) return cachedPriceId;

  // Search for existing product
  const products = await stripeGet('products?active=true&limit=100');
  let product = (products.data || []).find(p => p.name === 'EasyPoly Pro');

  if (!product) {
    product = await stripeRequest('products', {
      name: 'EasyPoly Pro',
      description: 'AI-curated Polymarket picks delivered daily to Telegram',
    });
    console.log('Created Stripe product:', product.id);
  }

  // Search for existing price
  const prices = await stripeGet(`prices?product=${product.id}&active=true&limit=10`);
  let price = (prices.data || []).find(p => p.unit_amount === 900 && p.recurring?.interval === 'month');

  if (!price) {
    price = await stripeRequest('prices', {
      product: product.id,
      currency: 'usd',
      'unit_amount': '900',
      'recurring[interval]': 'month',
    });
    console.log('Created Stripe price:', price.id);
  }

  cachedPriceId = price.id;
  return cachedPriceId;
}

async function createCheckoutSession(telegramUserId) {
  const priceId = await getOrCreatePrice();
  const session = await stripeRequest('checkout/sessions', {
    mode: 'subscription',
    'line_items[0][price]': priceId,
    'line_items[0][quantity]': '1',
    'metadata[telegram_user_id]': telegramUserId,
    'subscription_data[metadata][telegram_user_id]': telegramUserId,
    success_url: `https://easypoly.lol?subscribed=true`,
    cancel_url: `https://easypoly.lol?canceled=true`,
    'payment_method_types[0]': 'card',
  });
  return session;
}

function verifyWebhookSignature(payload, sigHeader) {
  if (!STRIPE_WEBHOOK_SECRET) {
    console.error('❌ No STRIPE_WEBHOOK_SECRET set — rejecting webhook');
    return false;
  }

  const crypto = require('crypto');
  const elements = sigHeader.split(',');
  const timestamp = elements.find(e => e.startsWith('t='))?.split('=')[1];
  const signatures = elements.filter(e => e.startsWith('v1=')).map(e => e.split('=')[1]);

  if (!timestamp || !signatures.length) return false;

  const signedPayload = `${timestamp}.${payload}`;
  const expected = crypto.createHmac('sha256', STRIPE_WEBHOOK_SECRET).update(signedPayload).digest('hex');
  return signatures.some(sig => crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)));
}

module.exports = { createCheckoutSession, verifyWebhookSignature, getOrCreatePrice };
