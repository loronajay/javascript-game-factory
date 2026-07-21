# Stripe Checkout Setup

Yes, you need a Stripe account before real-money skins can go live. Start in Stripe test mode, then switch the same flow to live keys after the checkout and entitlement webhook are verified.

## Browser contract

The shop sends premium skin and skin-pack purchases to:

```text
POST https://platform-api-production-3db7.up.railway.app/payments/tactical-arena/checkout-sessions
```

That base URL comes from `js/platform-config.mjs`. For local testing, set this before `src/bootstrap.js` loads:

```js
window.__JGF_PLATFORM_API_URL__ = "http://localhost:3001";
```

You can also override only this checkout endpoint without code changes:

```js
window.TACTICAL_ARENA_STRIPE_CHECKOUT_URL = "https://your-api.example/payments/tactical-arena/checkout-sessions";
```

The browser payload intentionally does not include price. It sends the authenticated Factory player and stable offer identity:

```json
{
  "gameSlug": "tactical-arena",
  "playerId": "factory-player-1",
  "offer": {
    "id": "skin:swordsman:medieval",
    "kind": "skin",
    "sku": "ta.skin.swordsman.medieval",
    "entitlementId": "skin:swordsman:medieval",
    "type": "swordsman",
    "slug": "medieval"
  },
  "successUrl": "https://example.com/games/tactical-arena/index.html?checkout=success&session_id={CHECKOUT_SESSION_ID}",
  "cancelUrl": "https://example.com/games/tactical-arena/index.html?checkout=cancel"
}
```

For `skin-pack` offers, the payload includes `packId` and the locally unowned entitlement ids as a hint. The server must still recalculate ownership and price from trusted account data.

## Server responsibilities

The platform API now owns `POST /payments/tactical-arena/checkout-sessions` and `POST /payments/stripe/webhook`. Do not put Stripe secret keys in the browser repo.

1. Verify the Factory auth token from `Authorization: Bearer ...`.
2. Load the trusted player progress/entitlements from the Factory progress API.
3. Validate `offer.sku` against the server-side Tactical Arena catalog.
4. Recalculate the final price and the entitlement ids to grant. For packs, charge only currently unowned contents if you want proration.
5. Create a Stripe Checkout Session in `payment` mode.
6. Return `{ "url": "https://checkout.stripe.com/..." }`.

Recommended Checkout Session metadata:

```json
{
  "gameSlug": "tactical-arena",
  "playerId": "factory-player-1",
  "sku": "ta.skin.swordsman.medieval",
  "offerKind": "skin",
  "type": "swordsman",
  "slug": "medieval"
}
```

Use `client_reference_id` for the Factory player id too. That gives you another reconciliation handle in Stripe.

## Webhook fulfillment

Create a Stripe webhook endpoint on your server and listen for:

```text
checkout.session.completed
checkout.session.async_payment_succeeded
```

On those events:

1. Verify the Stripe webhook signature with `STRIPE_WEBHOOK_SECRET`.
2. Retrieve the Checkout Session and confirm `payment_status` is paid or otherwise fulfillable.
3. Use an idempotency table keyed by the Checkout Session id so duplicate webhook deliveries do not double-grant.
4. Grant the entitlement ids to the Factory progress/account backend.
5. Mark the Checkout Session fulfilled.

When the player returns to the game, `src/main.js` already calls `syncGameProgress()`, and `mergeServerEntitlementsIntoUnlockProgress()` folds server skin entitlements into owned skins.

## Environment variables

Keep these on the server only:

```text
STRIPE_RESTRICTED_KEY=rk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
APP_BASE_URL=https://loronajay.github.io/javascript-game-factory
```

`STRIPE_SECRET_KEY` also works, but a restricted key with Checkout Session write access is preferred.

## Local test flow

1. Create a Stripe account and stay in test mode.
2. Run your checkout API locally.
3. Use the Stripe CLI to forward webhooks to your local webhook endpoint.
4. Click a skin USD button in the shop.
5. Pay with Stripe's test card.
6. Confirm the webhook grants the entitlement server-side.
7. Reload/return to the game and confirm the skin is owned.
