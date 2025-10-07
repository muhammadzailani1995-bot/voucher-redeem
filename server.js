import express from 'express';
import 'dotenv/config';
import db from './db.js';
import { verifyShopeeOrder } from './shopee.js';
import { requestNumberFromThirdParty, releaseNumber } from './thirdparty.js';

const app = express();
app.use(express.json());
app.use(express.static('public'));

// Polisi
const MAX_RETRY = 3;
const OTP_WAIT_MS = 15 * 60 * 1000; // digunakan di UI

// Mapping multi-service (label → service code)
const SERVICE_MAP = {
  zus: 'aik',
  tealive: 'avb',
  chagee: 'bwx',
  kfc: 'fz'
};

// DB helpers
const insertRedemption = db.prepare(`
  INSERT INTO redemptions (shopee_order_id, service_label, service_code, voucher_number, third_party_ref, state, attempts)
  VALUES (?,?,?,?,?,?,?)
`);
const updateRedemptionById = db.prepare(`
  UPDATE redemptions SET voucher_number=?, third_party_ref=?, state=?, attempts=?, updated_at=CURRENT_TIMESTAMP WHERE id=?
`);
const getRedemptionById = db.prepare(`SELECT * FROM redemptions WHERE id=?`);
const getLatestOtpForRedemption = db.prepare(`SELECT * FROM otp_events WHERE redemption_id=? ORDER BY id DESC LIMIT 1`);
const insertOtp = db.prepare(`INSERT INTO otp_events (redemption_id, otp_code, raw_payload) VALUES (?,?,?)`);
const findRedemptionByRef = db.prepare(`SELECT * FROM redemptions WHERE third_party_ref=? ORDER BY id DESC LIMIT 1`);
const markSuccess = db.prepare(`UPDATE redemptions SET state='SUCCESS', updated_at=CURRENT_TIMESTAMP WHERE id=?`);
const logWebhook = db.prepare(`INSERT INTO webhook_logs (endpoint, headers, payload, valid_signature) VALUES (?,?,?,?)`);

// Start redeem
app.post('/api/redeem/start', async (req, res) => {
  try {
    const { order_id, service } = req.body || {};
    if (!order_id) return res.status(400).json({ error: 'order_id diperlukan' });
    if (!service || !SERVICE_MAP[service]) return res.status(400).json({ error: 'service tidak sah (pilih: zus/tealive/chagee/kfc)' });

    const v = await verifyShopeeOrder(order_id);
    if (!v?.ok || !['PAID','COMPLETED'].includes(v.status)) {
      return res.status(400).json({ error: 'Order belum sah/paid.' });
    }

    const code = SERVICE_MAP[service];
    const { number, ref_id, ttl } = await requestNumberFromThirdParty(code);
    const info = insertRedemption.run(order_id, service, code, number, ref_id, 'WAITING_OTP', 0);
    return res.json({ redemption_id: info.lastInsertRowid, service_label: service, service_code: code, voucher_number: number, expires_in: ttl });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Ralat sistem, cuba lagi sebentar.' });
  }
});

// Status
app.get('/api/redeem/status/:id', (req, res) => {
  try {
    const r = getRedemptionById.get(req.params.id);
    if (!r) return res.status(404).json({ error: 'Rekod tidak ditemui' });
    const otpRow = getLatestOtpForRedemption.get(r.id);
    const otp = otpRow ? otpRow.otp_code : null;
    const can_retry = r.attempts < MAX_RETRY && r.state !== 'SUCCESS';
    return res.json({ state: r.state, voucher_number: r.voucher_number, otp, attempts: r.attempts, can_retry, service_label: r.service_label, service_code: r.service_code });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Ralat.' });
  }
});

// Retry
app.post('/api/redeem/retry', async (req, res) => {
  try {
    const { redemption_id } = req.body || {};
    if (!redemption_id) return res.status(400).json({ error: 'redemption_id diperlukan' });

    const r = getRedemptionById.get(redemption_id);
    if (!r) return res.status(404).json({ error: 'Rekod tidak ditemui' });
    if (r.attempts >= MAX_RETRY) return res.status(400).json({ error: 'Maksimum percubaan telah dicapai.' });
    if (r.state === 'SUCCESS') return res.status(400).json({ error: 'Order sudah berjaya.' });

    if (r.third_party_ref) await releaseNumber(r.third_party_ref);
    const { number, ref_id, ttl } = await requestNumberFromThirdParty(r.service_code);
    updateRedemptionById.run(number, ref_id, 'WAITING_OTP', r.attempts + 1, r.id);
    return res.json({ voucher_number: number, expires_in: ttl });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Ralat retry.' });
  }
});

// Webhook (Bearer = API key)
function isValidSignature(req) {
  const token = (req.headers['authorization'] || '').replace(/^Bearer\s+/i,'').trim();
  return token && token === process.env.OTP_WEBHOOK_SECRET;
}

app.post('/webhooks/otp', (req, res) => {
  const valid = isValidSignature(req);
  logWebhook.run('/webhooks/otp', JSON.stringify(req.headers), JSON.stringify(req.body), valid ? 1 : 0);
  if (!valid) return res.status(401).json({ ok: false });

  // SMS-Activate webhook lazim: { activationId, service, text, code, country, receivedAt }
  const ref_id = String(req.body.activationId || req.body.ref_id || req.body.id || '');
  const otp = String(req.body.code || req.body.otp || '');
  if (!ref_id || !otp) return res.status(400).json({ ok: false, msg: 'Payload tidak lengkap' });

  const r = findRedemptionByRef.get(ref_id);
  if (!r) return res.status(404).json({ ok: false, msg: 'Redemption tidak ditemui' });

  insertOtp.run(r.id, otp, JSON.stringify(req.body));
  markSuccess.run(r.id);
  return res.json({ ok: true });
});

app.get("/", (req, res) => {
  res.send("✅ Voucher Redeem API is running successfully!");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server running on :' + PORT));
