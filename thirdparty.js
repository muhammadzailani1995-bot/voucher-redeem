import fetch from 'node-fetch';
import 'dotenv/config';

const BASE   = process.env.THIRDPARTY_BASE_URL;
const APIKEY = process.env.THIRDPARTY_API_KEY;
const COUNTRY = process.env.THIRDPARTY_COUNTRY || '6';

/**
 * Minta nombor baru untuk serviceCode (contoh 'aik' = ZUS).
 * Respon success lazim: ACCESS_NUMBER:ID:NUMBER
 */
export async function requestNumberFromThirdParty(serviceCode) {
  const url = `${BASE}?action=getNumber&api_key=${APIKEY}&service=${encodeURIComponent(serviceCode)}&country=${encodeURIComponent(COUNTRY)}`;
  const r = await fetch(url);
  const text = await r.text();
  if (!text.startsWith('ACCESS')) {
    throw new Error('Third-party error: ' + text);
  }
  const parts = text.split(':');
  const ref_id = parts[1];
  const number = parts[2];
  return { number, ref_id, ttl: 900 };
}

/** Batalkan nombor (status=8) jika retry/tidak jadi */
export async function releaseNumber(refId) {
  const url = `${BASE}?action=setStatus&api_key=${APIKEY}&status=8&id=${encodeURIComponent(refId)}`;
  try { await fetch(url); } catch {}
}

/** Fallback polling OTP (jika tidak guna webhook) */
export async function getOtpByPolling(refId) {
  const url = `${BASE}?action=getStatus&api_key=${APIKEY}&id=${encodeURIComponent(refId)}`;
  const r = await fetch(url);
  const text = await r.text();
  if (text.startsWith('STATUS_OK:')) {
    return text.split(':')[1];
  }
  return null;
}
