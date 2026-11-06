# Lumee Booth Stripe checkout and webhook patch

## Changed
- `vercel.json`: serve the SPA at `/photobooth` for Stripe return URLs.
- `app.js`: on successful Stripe return, open the Personal product route and display secure access restoration instead of scrolling to pricing.
- `product.js`: Personal paid output does not require Lumee Booth attribution. This does not necessarily hide all website UI logos.
- `worker/src/billing.ts`: clarified plan pricing validation comments; policy already includes ONE_EVENT and BUSINESS.

## Important: webhook vs browser redirect
Stripe webhook is server-to-server and cannot navigate the buyer's browser. The success URL navigates to `/photobooth`. The current application deliberately requires a secure emailed restore token to activate paid access. This patch DOES NOT implement automatic immediate activation, which would require a secure session-bound redemption flow.

## Deployment and verification
1. Deploy the frontend ZIP content to Vercel; deploy Worker separately if changed.
2. Check `PUBLIC_APP_ORIGIN` is the frontend HTTPS origin.
3. In Stripe Workbench, check `checkout.session.completed` was delivered to your Cloudflare Worker `/v1/webhooks/stripe` with a 2xx response.
4. Check D1 `checkout_requests`, `purchases`, and `entitlements` records exist for the paid session.
5. Confirm the entitlement email queue consumer sends the restore email.
6. Test `/photobooth?checkout=success` loads the application and offers the secure restore flow.

Note: ONE_EVENT and BUSINESS already exist in `PERSONAL_PLANS` and `PersonalPlan` in the uploaded ZIP. An earlier diagnosis claiming they were missing was incorrect.
