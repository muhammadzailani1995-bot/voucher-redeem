# Tebus Voucher – Multi-Service – SMS-Activate (API key baru)

## Deploy (Railway / Render)
- Build: `npm install`
- Start: `npm start`
- UI pelanggan: `/redeem.html`
- Webhook: `POST /webhooks/otp` (Header: `Authorization: Bearer <API_KEY>`)

## Environment (sudah diisi)
- `OTP_WEBHOOK_SECRET=A9bAc32648bbd8d1493338ff721581f6`
- `THIRDPARTY_API_KEY=A9bAc32648bbd8d1493338ff721581f6`
- `THIRDPARTY_BASE_URL=https://api.sms-activate.ae/stubs/handler_api.php`
- `THIRDPARTY_COUNTRY=6`

## Multi-service mapping
- ZUS = `aik`
- Tealive = `avb`
- ChaGee = `bwx`
- KFC = `fz`

## Nota
- Jika mahu simpan DB pada volume (Railway), set `DB_PATH=/data/data.sqlite`.
