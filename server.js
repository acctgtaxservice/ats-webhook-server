const express = require('express');
const crypto = require('crypto');
const https = require('https');
const app = express();
const PORT = process.env.PORT || 3000;

// ── CONFIGURATION ──────────────────────────────────────────
const PAYMONGO_SECRET_KEY = process.env.PAYMONGO_SECRET_KEY;
const PAYMONGO_WEBHOOK_SECRET = process.env.PAYMONGO_WEBHOOK_SECRET;
const DOWNLOAD_PAGE_URL = process.env.DOWNLOAD_PAGE_URL || 'https://acctgtaxservice.com/download.html';
const CANCEL_URL = process.env.CANCEL_URL || 'https://acctgtaxservice.com/payroll-template.html';
const YOUR_SITE_URL = process.env.YOUR_SITE_URL || 'https://acctgtaxservice.com';
// ───────────────────────────────────────────────────────────

// Raw body for webhook signature verification
app.use('/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());

// ── CORS ──
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ── HEALTH CHECK ──
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Accounting Tax Service - PayMongo Webhook',
    timestamp: new Date().toISOString()
  });
});

// ── CREATE CHECKOUT SESSION ──
app.post('/create-checkout', async (req, res) => {
  try {
    if (!PAYMONGO_SECRET_KEY) {
      return res.status(500).json({ error: 'Server not configured' });
    }

    const payload = JSON.stringify({
      data: {
        attributes: {
          send_email_receipt: false,
          show_description: true,
          show_line_items: true,
          cancel_url: CANCEL_URL,
          success_url: DOWNLOAD_PAGE_URL,
          description: 'Philippine Payroll Excel Template v2026',
          line_items: [
            {
              currency: 'PHP',
              amount: 14900,
              description: 'Auto-computed SSS, PhilHealth, Pag-IBIG & BIR TRAIN Law Ready',
              name: 'Philippine Payroll Excel Template v2026',
              quantity: 1,
            }
          ],
          payment_method_types: ['qrph'],
        }
      }
    });

    const options = {
      hostname: 'api.paymongo.com',
      path: '/v1/checkout_sessions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${Buffer.from(PAYMONGO_SECRET_KEY + ':').toString('base64')}`,
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const pmRes = await new Promise((resolve, reject) => {
      const pmReq = https.request(options, (pmRes) => {
        let data = '';
        pmRes.on('data', chunk => data += chunk);
        pmRes.on('end', () => resolve({ status: pmRes.statusCode, body: data }));
      });
      pmReq.on('error', reject);
      pmReq.write(payload);
      pmReq.end();
    });

    const responseData = JSON.parse(pmRes.body);

    if (pmRes.status !== 200 && pmRes.status !== 201) {
      console.error('PayMongo error:', JSON.stringify(responseData));
      // Return the actual PayMongo error so we can debug
      const pmError = responseData?.errors?.[0]?.detail || 'Failed to create checkout session';
      return res.status(502).json({ error: pmError, raw: responseData });
    }

    const checkoutUrl = responseData?.data?.attributes?.checkout_url;
    if (!checkoutUrl) {
      return res.status(502).json({ error: 'No checkout URL returned' });
    }

    console.log(`✅ Checkout session created: ${checkoutUrl}`);
    res.json({ checkout_url: checkoutUrl });

  } catch (err) {
    console.error('Create checkout error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── CREATE CHECKOUT — ACCOUNTING SYSTEM ──
app.post('/create-checkout-accounting', async (req, res) => {
  try {
    if (!PAYMONGO_SECRET_KEY) {
      return res.status(500).json({ error: 'Server not configured' });
    }

    const payload = JSON.stringify({
      data: {
        attributes: {
          send_email_receipt: false,
          show_description: true,
          show_line_items: true,
          cancel_url: CANCEL_URL,
          success_url: process.env.DOWNLOAD_ACCOUNTING_URL || 'https://acctgtaxservice.com/download-accounting.html',
          description: 'Professional Accounting System PH v2026',
          line_items: [
            {
              currency: 'PHP',
              amount: 98900, // ₱989.00
              description: 'Complete double-entry bookkeeping system — Journal, Ledger, Financial Statements, Dashboard',
              name: 'Professional Accounting System PH v2026',
              quantity: 1,
            }
          ],
          payment_method_types: ['qrph'],
        }
      }
    });

    const options = {
      hostname: 'api.paymongo.com',
      path: '/v1/checkout_sessions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${Buffer.from(PAYMONGO_SECRET_KEY + ':').toString('base64')}`,
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const pmRes = await new Promise((resolve, reject) => {
      const pmReq = https.request(options, (pmRes) => {
        let data = '';
        pmRes.on('data', chunk => data += chunk);
        pmRes.on('end', () => resolve({ status: pmRes.statusCode, body: data }));
      });
      pmReq.on('error', reject);
      pmReq.write(payload);
      pmReq.end();
    });

    const responseData = JSON.parse(pmRes.body);

    if (pmRes.status !== 200 && pmRes.status !== 201) {
      console.error('PayMongo error:', JSON.stringify(responseData));
      const pmError = responseData?.errors?.[0]?.detail || 'Failed to create checkout session';
      return res.status(502).json({ error: pmError, raw: responseData });
    }

    const checkoutUrl = responseData?.data?.attributes?.checkout_url;
    if (!checkoutUrl) {
      return res.status(502).json({ error: 'No checkout URL returned' });
    }

    console.log(`✅ Accounting checkout created: ${checkoutUrl}`);
    res.json({ checkout_url: checkoutUrl });

  } catch (err) {
    console.error('Accounting checkout error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── WEBHOOK ENDPOINT ──
app.post('/webhook', (req, res) => {
  try {
    const rawBody = req.body;
    const signature = req.headers['paymongo-signature'];

    if (!signature || !PAYMONGO_WEBHOOK_SECRET) {
      console.error('Missing signature or webhook secret');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const parts = signature.split(',');
    const timestamp = parts.find(p => p.startsWith('t='))?.split('=')[1];
    const sigToVerify = parts.find(p => p.startsWith('li='))?.split('=')[1]
                     || parts.find(p => p.startsWith('te='))?.split('=')[1];

    if (!timestamp || !sigToVerify) {
      return res.status(401).json({ error: 'Invalid signature format' });
    }

    const signedPayload = `${timestamp}.${rawBody.toString()}`;
    const expectedSig = crypto
      .createHmac('sha256', PAYMONGO_WEBHOOK_SECRET)
      .update(signedPayload)
      .digest('hex');

    if (expectedSig !== sigToVerify) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const event = JSON.parse(rawBody.toString());
    const eventType = event?.data?.attributes?.type;
    console.log(`📩 Event: ${eventType}`);

    if (eventType === 'checkout_session.payment.paid' || eventType === 'payment.paid') {
      const attrs = event?.data?.attributes?.data?.attributes;
      console.log('✅ PAYMENT CONFIRMED!');
      console.log(`   Amount: ${attrs?.currency} ${((attrs?.amount || 0) / 100).toFixed(2)}`);
      console.log(`   Email:  ${attrs?.billing?.email || 'N/A'}`);
      console.log(`   Name:   ${attrs?.billing?.name || 'N/A'}`);
    }

    res.status(200).json({ received: true });

  } catch (err) {
    console.error('Webhook error:', err.message);
    res.status(400).json({ error: 'Webhook processing failed' });
  }
});

// ── START ──
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 POST /create-checkout`);
  console.log(`📡 POST /webhook`);
  console.log(`🏠 GET  /`);
});
