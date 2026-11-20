# SymphPay Integration Guide

## Overview

SymphPay is Symph's payment gateway aggregator. Each product app gets its own merchant — credentials are NOT shared.

**Staging URL:** `https://symph-pay-test.df.r.appspot.com/`
**Wiki:** `git@github.com:symphco/symph-pay.wiki.git`

## Setup (Per Product App)

### 1. Create Merchant

```bash
curl -X POST "https://symph-pay-test.df.r.appspot.com/api/admin/merchant" \
  -H "x-api-key: INTERNAL_ADMIN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Your App Name",
    "callbackUrl": "https://your-app.dev.apps.symph.co/api/webhooks/symph-pay"
  }'
```

Response gives you `apiKey` and `secretKey`. Save both.

### 2. Create Products

```bash
curl -X POST "https://symph-pay-test.df.r.appspot.com/api/admin/product" \
  -H "x-api-key: INTERNAL_ADMIN" \
  -H "Content-Type: application/json" \
  -d '{
    "merchantId": "<merchant-id>",
    "name": "Pro Plan",
    "description": "Premium features",
    "amount": 599,
    "meta": {}
  }'
```

### 3. Set Environment Variables

```env
SYMPH_PAY_BASE_URL=https://symph-pay-test.df.r.appspot.com/
SYMPH_PAY_API_KEY=<apiKey from merchant creation>
SYMPH_PAY_SECRET_KEY=<secretKey from merchant creation>
```

## Critical Rules

### Price Amounts = Whole Currency Units
- ₱599 = `599` (NOT `59900`)
- SymphPay internally multiplies ×100 for gateway centavos
- If you pass `59900`, the checkout shows ₱59,900 — WRONG

### `meta` Field Must Be an Object
- Always include `"meta": {}` when creating products, even if empty
- Missing `meta` causes API errors

### Integration Type
- Use `"integration": "STRIPE"` for checkout sessions
- This routes through Stripe which provides PayMongo checkout (Card + GCash + Maya)

## API Routes

### Checkout Route (`/api/payments/checkout/route.ts`)

```typescript
import { NextRequest, NextResponse } from "next/server";

const SESSION_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes

const pendingSessions = new Map<string, { txCode: string; createdAt: number }>();

async function expireSession(txCode: string) {
  try {
    await fetch(
      `${process.env.SYMPH_PAY_BASE_URL}api/admin/expire-session/${txCode}`,
      {
        method: "POST",
        headers: { "x-api-key": process.env.SYMPH_PAY_API_KEY! },
      }
    );
  } catch (err) {
    console.error(`Failed to expire session ${txCode}:`, err);
  }
}

function cleanupExpiredSessions() {
  const now = Date.now();
  for (const [key, session] of pendingSessions) {
    if (now - session.createdAt > SESSION_EXPIRY_MS) {
      expireSession(session.txCode);
      pendingSessions.delete(key);
    }
  }
}

export async function POST(req: NextRequest) {
  const { productId, tier } = await req.json();
  const txCode = `${process.env.APP_SLUG || "APP"}-${tier}-${Date.now()}`;

  cleanupExpiredSessions();

  const res = await fetch(`${process.env.SYMPH_PAY_BASE_URL}api/payment`, {
    method: "POST",
    headers: {
      "x-api-key": process.env.SYMPH_PAY_API_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      merchantTransactionCode: txCode,
      integration: "STRIPE",
      productId,
      quantity: 1,
      paymentMethodList: ["card", "link"],
      paymentType: "checkout",
    }),
  });

  const data = await res.json();

  pendingSessions.set(txCode, { txCode, createdAt: Date.now() });
  setTimeout(() => {
    if (pendingSessions.has(txCode)) {
      expireSession(txCode);
      pendingSessions.delete(txCode);
    }
  }, SESSION_EXPIRY_MS);

  return NextResponse.json({
    checkoutUrl: data.sessionURL,
    paymentId: data.id,
    expiresIn: "15 minutes",
  });
}
```

### Webhook Route (`/api/webhooks/symph-pay/route.ts`)

```typescript
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  const payload = await req.json();
  const signature = req.headers.get("x-api-signature");

  const { merchantTransactionCode, paymentTransactionCode, status } = payload;

  // Verify signature: SHA-512 of "txCode|payTxCode|status|apiKey|secretKey"
  const signatureString = [
    merchantTransactionCode,
    paymentTransactionCode,
    status,
    process.env.SYMPH_PAY_API_KEY,
    process.env.SYMPH_PAY_SECRET_KEY,
  ].join("|");

  const expected = crypto
    .createHash("sha512")
    .update(signatureString)
    .digest("hex");

  if (expected !== signature) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // TODO: Update user subscription in Firestore
  // e.g., parse merchantTransactionCode to get userId/tier
  console.log(`Payment ${paymentTransactionCode}: ${status}`);

  return NextResponse.json({ received: true });
}
```

## Expire Session API

Checkout sessions should auto-expire after 15 minutes:

```
POST /api/admin/expire-session/{merchantTransactionCode}
Header: x-api-key: <merchant apiKey>
```

- Idempotent — safe to call multiple times
- Returns 201 on success, 404 if not found

## Deployment Gotchas

1. **Always restart server after rebuild** — Stale Next.js processes serve old static assets (CSS 404s). Kill old process before starting new one.
2. **In-memory session tracking** — The `Map` + `setTimeout` pattern works for MVP. For production, use Firestore or Redis.
3. **Use native `<button>` for checkout buttons** — shadcn `Button` can have hydration issues with onClick in statically prerendered pages. Use plain `<button type="button">` with explicit styling for payment CTAs.
4. **`window.location.assign()`** — More reliable than `window.location.href =` for cross-origin redirects to payment gateways.
