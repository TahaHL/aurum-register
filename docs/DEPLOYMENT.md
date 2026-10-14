# Deployment and operations

## Zero-cost demo: Render and Neon Free

`render.yaml` requests only a free Node web service in Frankfurt. Supply a separate Neon Free PostgreSQL connection string as the secret `DATABASE_URL`, with TLS enabled. A generated session secret stays in Render. The app derives its HTTPS origin from `RENDER_EXTERNAL_URL`; explicit `APP_ORIGIN` takes precedence for custom domains. Public demo accounts contain fictional data only.

Connect `TahaHL/aurum-register` as a Render Blueprint and verify the web instance is Free before deployment. Automatic deployments are disabled; verify GitHub checks before manually deploying a new revision. Health: `/api/health`. Startup runs migrations, seeds missing sample lots and releases expired holds, including after free-service sleep.

Do not add a card, select a paid plan, enable paid extras, or use trial-to-paid services. The Render workspace was verified on Hobby with no card and $0 current/projected charges on 14 October 2026. Render documents suspension rather than overage billing when no payment method is attached. Free web services sleep after 15 minutes idle and share 750 hours per workspace per month. Build and bandwidth limits also apply. Keep the billing configuration unchanged.

The Neon organization was verified on Free ($0/month). At compute or transfer limits, Neon Free suspends compute until the allowance resets; storage limits reject growth. The console currently includes 1 GB storage and 100 compute hours per project. Limits can change. Background database activity consumes compute while the web service is awake, so this demo may stop until its monthly allowance resets. Never upgrade automatically.

Render's 30-day free database is deliberately excluded. No provider's free tier is a perpetual guarantee. Sources: https://render.com/docs/free, https://render.com/docs/blueprint-spec and https://neon.com/docs/introduction/plans.

## Clean data and tests

New local previews use `.local/demo-v2`. The old `.local/preview-postgres` remains untouched. Fresh databases seed 20g and 100g bars, a Britannia and Sovereign, with sample premiums of 4%, 2%, 5% and 6%. Weights use milligram precision and fineness uses parts per 10,000; these are fictional sample products.

Browser tests default to port 5188 and a separate timestamped database. Native domain tests require `TEST_DATABASE_URL` and use an isolated schema. They do not consume the presentation inventory.

## Weekend policy

New live-price sale and buy-back offers pause from Friday 21:00 UTC until Sunday 22:00 UTC. This is a conservative demo desk policy, not a claim about provider trading hours. Reopening still requires an observation less than 120 seconds old. A newly fetched old timestamp never becomes fresh. Existing offers, holds and inventory actions retain their normal expiry rules. Fixture mode is exempt for offline demonstrations.

The provider documentation does not guarantee Saturday timestamp behavior. The 14 October Wednesday observation was approximately 17 seconds old; it does not prove weekend behavior. `npm run check:price` prints provider timestamp/age for a future Saturday check. Automated tests cover closure boundaries, a fresh weekend response and stale reopening data. Actual Saturday behavior remains unobserved. Provider documentation: https://gold-api.com/docs.

## Release boundaries

Buy-back acceptance does not change stock. An owner confirms matching assessed weight, purity and quantity within 15 minutes, then receipt adds a lot once and records its original purchase value. A changed assessment requires a new offer. Sales remove both total and reserved stock; releases remove only reserved stock. No payments are collected or verified.

No real customer information belongs in the public demo. Private runtime data and environment files are excluded from source. Payments, refunds, shipping, tax, hedging, user provisioning and password reset are outside scope. Lists currently cap inventory at 200 lots and histories at 50 records.
