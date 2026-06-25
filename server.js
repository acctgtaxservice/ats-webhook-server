const express = require('express');
const crypto = require('crypto');
const app = express();
const PORT = process.env.PORT || 3000;

// ── CONFIGURATION ──────────────────────────────────────────
const PAYMONGO_SECRET_KEY = process.env.PAYMONGO_SECRET_KEY;
const PAYMONGO_WEBHOOK_SECRET = process.env.PAYMONGO_WEBHOOK_SECRET;
const DOWNLOAD_PAGE_URL = process.env.DOWNLOAD_PAGE_URL || 'https://acctgtaxservice.com/download.html';
// ───────────────────────────────────────────────────────────

// Parse raw body for webhook signature verification
app.use('/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());

// ── HEALTH CHECK ──
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Accounting Tax Service - PayMongo Webhook',
    timestamp: new Date().toISOString()
  });
});

// ── PAYMONGO WEBHOOK ENDPOINT ──
app.post('/webhook', (req, res) => {
  try {
    const rawBody = req.body;
    const signature = req.headers['paymongo-signature'];

    // ── VERIFY SIGNATURE ──
    if (!signature || !PAYMONGO_WEBHOOK_SECRET) {
      console.error('Missing signature or webhook secret');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // PayMongo sends: t=timestamp,te=test_sig,li=live_sig
    const parts = signature.split(',');
    const timestamp = parts.find(p => p.startsWith('t='))?.split('=')[1];
    const sigToVerify = parts.find(p => p.startsWith('li='))?.split('=')[1]
                     || parts.find(p => p.startsWith('te='))?.split('=')[1];

    if (!timestamp || !sigToVerify) {
      console.error('Invalid signature format');
      return res.status(401).json({ error: 'Invalid signature format' });
    }

    // Reconstruct signed payload
    const signedPayload = `${timestamp}.${rawBody.toString()}`;
    const expectedSig = crypto
      .createHmac('sha256', PAYMONGO_WEBHOOK_SECRET)
      .update(signedPayload)
      .digest('hex');

    if (expectedSig !== sigToVerify) {
      console.error('Signature mismatch');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // ── PARSE EVENT ──
    const event = JSON.parse(rawBody.toString());
    const eventType = event?.data?.attributes?.type;

    console.log(`Received event: ${eventType}`);
    console.log(JSON.stringify(event, null, 2));

    // ── HANDLE PAYMENT SUCCESS ──
    if (eventType === 'payment.paid' || eventType === 'checkout_session.payment.paid') {
      const paymentData = event?.data?.attributes?.data?.attributes;
      const amount = paymentData?.amount;
      const currency = paymentData?.currency;
      const status = paymentData?.status;
      const paidAt = paymentData?.paid_at;
      const billingName = paymentData?.billing?.name;
      const billingEmail = paymentData?.billing?.email;

      console.log('✅ PAYMENT SUCCESSFUL!');
      console.log(`   Name: ${billingName || 'N/A'}`);
      console.log(`   Email: ${billingEmail || 'N/A'}`);
      console.log(`   Amount: ${currency} ${(amount / 100).toFixed(2)}`);
      console.log(`   Status: ${status}`);
      console.log(`   Paid at: ${paidAt ? new Date(paidAt * 1000).toISOString() : 'N/A'}`);

      // ── Respond 200 immediately to acknowledge receipt ──
      res.status(200).json({ received: true });
      return;
    }

    // Acknowledge all other events
    res.status(200).json({ received: true });

  } catch (err) {
    console.error('Webhook error:', err.message);
    res.status(400).json({ error: 'Webhook processing failed' });
  }
});

// ── SUCCESS REDIRECT (fallback) ──
// PayMongo will redirect customer to your success_url in the Payment Page settings
// This is just a fallback endpoint if needed
app.get('/success', (req, res) => {
  res.redirect(DOWNLOAD_PAGE_URL);
});

// ── START SERVER ──
app.listen(PORT, () => {
  console.log(`🚀 Webhook server running on port ${PORT}`);
  console.log(`📡 Webhook endpoint: POST /webhook`);
  console.log(`🏠 Health check: GET /`);
});
