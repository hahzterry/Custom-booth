# MyBishBash Photobooth — Master Implementation Specification

**Date:** 2026-08-09
**Source:** [AUDIT-2026-08-09.md](AUDIT-2026-08-09.md) (accepted in full, 2026-08-09)
**Work-package prefix:** `PB` — claimed 2026-08-09 in `~/.claude/portfolio.md`. Never reuse; never renumber.
**Executor:** one competent model per packet, working from this document and the repository only.
**Status tracker:** [WORK.md](../../WORK.md)

---

## 1. Executive implementation strategy

The audit's verdict was that the craft is 9/10 and commercial completeness is 0/10. This programme is therefore almost entirely about the second number, and it is explicitly **forbidden from touching the first**.

The capture engine, the cover renderer, the editorial finish, the Living Polaroid, `covers.js`, `polaroid.js`, `mp4.js` and the grading pipeline are **protected assets**. No packet in this programme modifies them. Where a packet's work sits adjacent to them — the landing page uses the real renderers — the packet says so in its Constraints and the acceptance criteria include proving the renderers still produce output.

Three things govern the ordering.

**Honesty before capability.** The site currently advertises four prices it cannot take and four contact routes that 404. The first three packets do not build a shop; they stop the site lying. That is a day of work and it removes every Blocker except compliance. A working "email us" beats a broken "buy now" on every metric that matters.

**Irreversibility last.** Two steps in this programme freeze other steps' mistakes. Creating Stripe products freezes the pricing model, so **repricing happens before billing** (C4). Changing the origin invalidates every absolute URL, so **social metadata is written against a single constant** that the migration packet repoints (C6). Both are cheap now and expensive in the wrong order.

**Every packet leaves the product deployable.** This is a static site with no build step; a broken commit is a broken production deploy the moment it is pushed. There are no half-finished renames and no "the next packet fixes it" states anywhere in this plan.

What this programme deliberately does **not** do: deploy Stripe to live, rewrite the app, introduce a framework or build step, restructure `app.js`, or redesign anything. The audit found no architectural defect worth a rewrite, and a spec that quietly authorises one will get one.

---

## 2. Guiding principles

Every decision below must satisfy these. Where a packet needs an exception, it states the reason in-line.

1. **Never regress the engine.** Capture, grading, covers, Polaroid and export are untouched. Adjacent work proves they still render.
2. **A refusal must always name a reason and offer a route.** The product's current idiom — return `false`, do nothing — is banned. This is the direct fix for RC-2 and applies to every gate added or touched.
3. **Prices grant nothing.** `product.js`'s separation of `PLAN_METADATA` from `CAPABILITY_MATRIX` is the house standard. No packet may make a capability depend on a price, a label, or a string.
4. **One origin constant.** Every absolute URL in the product derives from one value. Nothing hardcodes a hostname twice.
5. **Storage keys are contracts.** No packet renames a `localStorage` or IndexedDB key without an explicit migration specified in that packet. Silent resets are invisible in review and obvious to users.
6. **Extend the existing concept.** `mailto:` is the contact mechanism, one settings screen is the configuration surface, `#checkoutStatus` is the commerce status surface. Do not mint siblings.
7. **Never regress accessibility.** The 3px `:focus-visible` ring, `prefers-reduced-motion` and `lang` are existing assets. Every packet leaves them intact.
8. **Local-first is constitutional.** Free and Personal photographs never leave the device. No packet may add an upload path outside the existing, doubly-gated Business consent flow.

---

## 3. Challenges to the audit

The audit is a set of claims; this is where they were re-examined adversarially. Six survived as disagreements.

### C1 — The audit implied two packets where there is one decision, not two problems
**Audit said:** F-15 (localStorage unlocks Personal) and F-10 (grandfathering expires at the new origin) are separate findings with separate remedies.
**Disagreement:** They are the same decision seen twice. F-15's recommended fix — "grandfather by issuing real entitlements to known legacy users" — is **not executable**: the product has no accounts, no server, and no record of who the legacy users are. Their existence is known only from a key on their own device. There is therefore exactly one available action for both findings: decide the posture and write it down.
**Instead:** No code packet. Both are resolved by an ADR in PB-04's decision log, and the migration (PB-15) ends grandfathering as a side effect of the origin change. Cost of being wrong: near zero — if grandfathering later matters commercially, it can be reissued through the restore flow once billing exists.

### C2 — Building a paywall before a checkout would point it at a dead end
**Audit said (F-03):** convert the silent save into the paywall moment, because the user has just seen their own event name in the preview.
**Disagreement:** That is the right end state and the wrong first move. With no live checkout, "convert to paywall" means routing the most engaged users on the site to three buttons that say *"This service is not available yet."* That is a worse experience than the silent failure, because it wastes their intent twice.
**Instead:** Split it. **PB-03** makes the refusal honest and lossless — the configuration is preserved, the reason is named, and the route offered is the founding-list email. **PB-12** upgrades that same surface into a purchase moment once billing exists. One surface, two states, no sibling concept. Cost of being wrong: one extra packet.

### C3 — "Deploy the Worker **or** ship a waitlist" is not a specification
**Audit said (F-01):** either deploy the Worker and proxy `/v1`, or replace the price CTAs with a waitlist.
**Disagreement:** A spec that offers the executor a choice guarantees improvisation. One must be chosen, and the dependency chain chooses it: live billing requires terms and a privacy policy (F-13) for Stripe's own account review, and it requires the pricing model to be settled (C4). Both are downstream work.
**Instead:** The waitlist path is specified now (**PB-02**), and billing activation becomes a **gate packet** (**PB-16**) whose honest outcome may be NO-GO. Live Stripe deployment is explicitly **out of scope** for this programme — it needs Lizzie's credentials and a legal sign-off, and no executor should attempt it. Cost of being wrong: the site earns email addresses instead of payments for a few more weeks, which is the current state anyway, minus the lying.

### C4 — The audit under-sequenced its own pricing recommendation
**Audit said (F-22):** reprice around the event; it is "among the cheapest changes in the whole audit."
**Disagreement:** True today, false the moment billing is live. `checkoutProductKey` values (`personal_6_month`, `personal_12_month`) map to Stripe Price objects. Once real customers hold entitlements against those keys, changing the model means migrating live price objects and honouring existing purchases — the cheapest change becomes one of the most expensive.
**Instead:** Pricing is a **freezing step**. PB-11 lands **before** the billing gate, not after it. This is the single most important ordering decision in the programme.

### C5 — Social metadata written before the domain move would be written twice
**Audit said (F-05):** add the full `og:`/`twitter:` set — a High-severity quick win.
**Disagreement:** `og:url` and `og:image` require absolute URLs. Adding them now against `raes-photo-booth.vercel.app` means every one is wrong on migration day, and "update the OG tags" becomes a fiddly checklist item that will be half-done.
**Instead:** PB-05 introduces a single `SITE_ORIGIN` constant that every absolute URL derives from, and PB-15 changes that one value. The quick win still lands immediately; it just cannot rot. Cost of being wrong: one constant's worth of indirection.

### C6 — `robots.txt` and `sitemap.xml` should not ship before the final domain
**Audit said (F-07):** add both, noting they should name the final domain.
**Disagreement:** The audit was right to hedge and then filed it as a Medium quick win anyway. Publishing a sitemap naming a domain you are about to abandon actively teaches search engines the wrong canonical URL, then requires an explicit correction.
**Instead:** PB-07 authors both files against `SITE_ORIGIN` but the acceptance criteria require them to be correct *after* PB-15. They ship in the same programme; they simply carry the same constant as everything else. No separate work.

---

## 4. Dependency map

The ordering rationale, shortest first:

1. **Honesty fixes depend on nothing.** PB-01, PB-02, PB-03 are independent of domain, backend and each other.
2. **Compliance precedes billing.** Stripe account review expects reachable terms and privacy URLs, so PB-04 must land before PB-16 can pass.
3. **The origin constant precedes every absolute URL.** PB-05 must land before PB-07, and PB-15 repoints what both established.
4. **Pricing precedes billing.** PB-11 before PB-16 — see C4. This is the prerequisite pair that matters most.
5. **Honest refusal precedes the paywall.** PB-03 before PB-12 — see C2.
6. **Subpath readiness precedes cutover.** PB-13 and PB-14 both before PB-15. **Prerequisite pair:** PB-13 and PB-14 must *both* land before PB-15 runs; cutting over with only one produces either an unstyled site or stranded users.

| Packet | Depends on | Blocks |
|---|---|---|
| PB-01 Contact mailto | — | — |
| PB-02 Honest checkout state | — | PB-12 |
| PB-03 Honest Personal refusal | — | PB-12 |
| PB-04 Legal pages | — | PB-16 |
| PB-05 Origin constant + metadata | — | PB-07, PB-15 |
| PB-06 Image weight | — | — |
| PB-07 robots / sitemap / 404 | PB-05 | — |
| PB-08 Mobile nav | — | — |
| PB-09 Camera failure states | — | — |
| PB-10 Accessibility | — | — |
| PB-11 Reprice around the event | PB-02 | **PB-16** |
| PB-12 Free-vs-paid cover comparison | PB-03, PB-11 | — |
| PB-13 Subpath readiness | PB-05 | **PB-15** |
| PB-14 Settings export/import | — | **PB-15** |
| PB-15 Cut over to mybishbash.app | **PB-13 + PB-14** | — |
| PB-16 GATE: billing readiness | PB-04, PB-11, PB-15 | — |

---

## 5. Implementation phases

| Phase | Purpose | Packets |
|---|---|---|
| **P0 — Stop the site lying** | Remove every Blocker that needs no backend and no domain | PB-01 · PB-02 · PB-03 |
| **P1 — Compliance** | Make it lawful to sell, and unblock Stripe review | PB-04 |
| **P2 — Be findable and fast** | Fix the acquisition channel and the page weight | PB-05 · PB-06 · PB-07 |
| **P3 — Craft defects** | The three real UI/UX bugs the audit found | PB-08 · PB-09 · PB-10 |
| **P4 — Pricing model** | Settle the model *before* billing freezes it | PB-11 · PB-12 |
| **P5 — Migration** | Move to mybishbash.app/photobooth without stranding anyone | PB-13 · PB-14 · PB-15 |
| **P6 — Billing gate** | Decide, with evidence, whether to activate payments | PB-16 |

---

## 6. Decisions taken (from audit §13)

The audit closed with five open decisions. Accepting the audit did not answer them, so this spec adopts the audit's own recommendations as defaults. **Each is cheap to reverse before its packet runs; say so now if any is wrong.**

| # | Decision | Taken | Where it binds |
|---|---|---|---|
| 1 | Worker before or after migration | **After** — billing is the last gate, migration is P5 | C3, PB-16 |
| 2 | Carry the gallery across origins | **No.** Settings yes, gallery no, with a clear warning on the old origin | PB-14 |
| 3 | Legacy users keep Personal on the new domain | **No** — grandfathering ends at the origin change, recorded as an ADR | C1, PB-15 |
| 4 | Event pricing or duration pricing | **Event pricing**, Founding Lifetime unchanged | PB-11 |
| 5 | Public price for Business | **No public price**, but a qualifying line replaces the bare "contact us" | PB-01 |

---

## 7. Information architecture — canonical vocabulary

One user-facing term per concept. The current copy drifts across three names for the paid personal tier, which is what makes the pricing section hard to scan.

| Canonical term | Definition | Replaces |
|---|---|---|
| **Personal** | The paid tier that unlocks event customisation and the quieter credit | "Personalised", "Personal access", "Personal customisation" |
| **Your event** | The organiser's configured title, date, colour and wording | "Event settings", "your booth", "custom booth" |
| **Founding Lifetime** | The capped one-off lifetime purchase | "lifetime", "Founding" |
| **Business** | The tier with brand assets, event controls and consent records | "For Business", "MyBishBash for Business" (both fine as headings, not as tier names) |
| **Keepsake** | Any of the three outputs a guest takes away | "output", "product", "asset" *(in guest-facing copy only)* |

**Code identifiers are NOT renamed.** `PERSONAL_6_MONTH`, `canPersonaliseEvent`, `ENTITLEMENTS`, every storage key and every `product.js` export keep their current names. The churn is large, the user never sees them, and `product.js` is frozen and test-covered. Change user-facing strings only. An executor that renames an entitlement constant has broken the contract with the Worker and both test suites.

**Where the vocabulary must change:** pricing card headings and body copy in `index.html`, `#outputNote` strings at [app.js:443](../../app.js:443), the settings screen heading, and the founding availability line. Nowhere else.

---

## 8. Protected assets — do not modify

An executor working a packet in this programme must not edit these files except where a packet names them explicitly:

- `covers.js`, `polaroid.js`, `mp4.js`, `fonts.js` — the rendering engine. **No packet in this programme modifies them.**
- `product.js` — the entitlement boundary. Modified by **PB-11 only**, and only within `PLAN_METADATA`. The capability matrix, consent validators and brand-asset validator are frozen.
- `worker/` — the API. **No packet in this programme modifies it.** PB-16 only reads and reports on it.
- `sw.js` `ASSETS` array — modified by **PB-06 only** (the image filename), and the list must stay finite.
- The capture path in `app.js` (`startCamera`, `beginSession`, the countdown and grading calls) — modified by **PB-09 only**, and only its `catch` branch.

**Storage keys that must not be renamed by any packet:** `mybishbashPhotoboothVerifiedAccessV1`, `mybishbashPhotoboothGallery`, `mybishbashPhotoboothGalleryMigratedV1`, `mybishbashPhotoboothEditionSequenceV1`, the settings key at [app.js:226](../../app.js:226), and `raePhotoBoothLiveSettings` / `raePhotoBoothGallery` (legacy, read-only).

---

## 9. Testing strategy

There is no build step, no linter and no root `package.json`. The preflight is therefore a literal command sequence. **Every packet runs all of it.**

```bash
node tests/product.test.js && node tests/integration-contract.test.js && (cd worker && npx vitest run)
```

Expected baseline, verified 2026-08-09: **17 browser tests pass, 14 worker tests pass, 0 fail.**

Per-phase additions:

- **P0–P1:** manual — load `/` and `/business`, confirm every CTA reaches a real destination.
- **P2:** `curl -sI` each new route for status and content-type; re-measure total transfer with the command in PB-06.
- **P3:** re-run the mobile measurement in PB-08's verification; real Tab press to confirm the focus ring survives.
- **P4:** `node tests/product.test.js` must still pass after `PLAN_METADATA` changes — if it fails, the executor has changed a capability, not a price.
- **P5:** the migration checklist in PB-15, run against the live domain before DNS/proxy is announced.
- **Regression risk to watch throughout:** the landing page drives the real renderers. Any packet touching `index.html` or `styles.css` must confirm all ten demo canvases still report `data-demo-ready="true"`.

---

## 10. Success metrics

Nothing is instrumented today; there is no analytics of any kind. That is a deliberate state (privacy is the product's trust asset), so these are stated as observable checks rather than dashboard metrics.

| Metric | Baseline (2026-08-09) | Target | Instrumented? |
|---|---|---|---|
| Working commercial exits | **0 of 8** (3 checkout, 4 contact, 1 save) | 8 of 8 | Manual check |
| Blocker findings open | 4 | 0 after P1 | Tracker |
| Critical-path transfer weight | 2,331,527 bytes | < 400,000 bytes | PB-06 command |
| Pages with complete social metadata | 0 of 2 | 2 of 2 | PB-05 verification |
| Legal pages reachable from footer | 0 | 3 (terms, privacy, refunds) | Manual check |
| WCAG AA contrast failures on sampled roles | 1 of 8 | 0 of 8 | PB-10 script |
| Preflight | 31 pass / 0 fail | unchanged | Preflight command |

Adding analytics is **out of scope** and would require its own consent decision (see §13).

---

## 11. Packets

Execute strictly in order. Later packets assume earlier constants and vocabulary.

---

### Packet PB-01 — Replace the dead Business contact URL with a working route
**Phase:** P0
**Objective:** Make it possible to contact the business at all, closing audit F-02.
**Depends on:** nothing
**Files:** `index.html` (the `business-contact-url` meta at line 11; the four CTA anchors), `app.js` if the meta is read anywhere.
**Constraints:** Do not build a contact page or form — that is a separate decision and a different domain. Keep exactly one source of truth for the address (the existing meta tag); do not hardcode it into four anchors. Do not change the Business page's content or layout.
**Acceptance criteria:**
- [ ] `<meta name="business-contact-url">` contains a `mailto:` address that Lizzie monitors, supplied at execution time.
- [ ] All four CTAs (`TALK TO US` ×3, `Talk to us` ×1) resolve to that address; zero references to `mybishbash.app/contact` remain in the repository.
- [ ] The `mailto:` carries a prefilled subject identifying the Business enquiry.
- [ ] A qualifying line is added beside the primary CTA per decision 5 (§6) — indicative scale, not a price.
- [ ] Preflight green.
**Verification checklist:** `grep -rn "mybishbash.app/contact" --include=* .` returns nothing outside `docs/`. Load `/business`, click each of the four CTAs, confirm the mail client opens with the subject prefilled.
**Rollback:** Revert the commit. No data, no storage, no migration.
**Complexity:** Low
**Definition of done:** preflight green, criteria in the commit message, tracker updated, deployable.

---

### Packet PB-02 — Make the commerce state honest
**Phase:** P0
**Objective:** Stop advertising three prices that cannot be paid, and capture intent instead, closing audit F-01 and F-11.
**Depends on:** nothing
**Files:** `index.html` (pricing section), `app.js` (`startCheckout` [1534](../../app.js:1534), `loadFoundingAvailability` [1526](../../app.js:1526), the `[data-checkout-plan]` wiring at [1697](../../app.js:1697)), `styles.css` if a state class is needed.
**Constraints:** **Do not delete the checkout code.** `startCheckout`, `handleCheckoutReturn` and the restore flow must remain intact and callable — PB-16 re-enables them. Gate them behind a single flag, do not rip them out. Do not remove the prices from `product.js`. Do not invent a new status surface; `#checkoutStatus` already exists.
**Acceptance criteria:**
- [ ] A single boolean constant in `app.js` controls whether billing is live; it is `false` in this packet and flipping it to `true` restores the current checkout behaviour with no other edit.
- [ ] While billing is off, the three plan buttons invite a founding-list email (reusing PB-01's address with a distinct subject) instead of calling `startCheckout`.
- [ ] The prices remain visible and are labelled as forthcoming, in wording that does not imply a purchase is currently possible.
- [ ] The unevidenced scarcity line is removed or reworded while `/v1/billing/founding` is unreachable; no failed request is left to error silently in the console.
- [ ] Clicking any plan button produces a visible, non-error next step. The string "This service is not available yet." no longer appears to a user.
- [ ] Preflight green.
**Verification checklist:** Load `/`, click all three plan buttons, confirm each opens mail with a distinct subject. Open devtools console; confirm no failed `/v1/*` request on page load. Flip the constant to `true` locally and confirm `startCheckout` is reached again, then set it back to `false` before committing.
**Rollback:** Revert. No storage involved.
**Complexity:** Medium
**Definition of done:** as above.

---

### Packet PB-03 — Never silently discard a guest's configuration
**Phase:** P0
**Objective:** Replace the silent `return false` with a preserved-and-explained refusal, closing audit F-03 and the F-12 half that needs no checkout.
**Depends on:** nothing
**Files:** `app.js` (`savePersonalSettings` [1494](../../app.js:1494), `openPersonalSettings` [1489](../../app.js:1489), the entry wiring at [1690-1691](../../app.js:1690)), `index.html` (a status region in the settings screen), `styles.css`.
**Constraints:** Free users must **keep** access to the setup flow — do not gate the entrance. The audit's point is that configuring it is the persuasion. Do not grant Personal capability. Do not write the free user's settings to the real settings key; hold them in the existing `temporarySettingsSnapshot` mechanism rather than inventing a second store. Do not use `alert()`.
**Acceptance criteria:**
- [ ] A free user pressing save sees an in-page message naming the reason and offering the PB-02 founding-list route.
- [ ] The configuration the free user typed is **still on screen** after the refusal — nothing is cleared.
- [ ] `savePersonalSettings` no longer returns `false` without a user-visible consequence.
- [ ] An entitled user's save path is byte-for-byte unchanged in behaviour.
- [ ] The message region is announced to assistive technology (`role="status"` or equivalent) and does not steal focus mid-typing.
- [ ] Preflight green.
**Verification checklist:** With empty `localStorage`, open Customise My Booth from the landing page, type an event title, press save; confirm the message appears, the title is still in the field, and `Object.keys(localStorage)` still contains no settings key. Repeat with `raePhotoBoothLiveSettings` set to confirm the legacy path still saves.
**Rollback:** Revert. No storage migration.
**Complexity:** Medium
**Definition of done:** as above.

---

### Packet PB-04 — Publish terms, privacy and cancellation, and link them
**Phase:** P1
**Objective:** Make it lawful to advertise and later sell, closing audit F-13 and F-14, and unblocking PB-16.
**Depends on:** nothing
**Files:** new static pages, `vercel.json` (routes), `index.html` (both footers).
**Constraints:** These are static pages, not app screens — do not add them as `.screen` sections, because they must be reachable and indexable without JavaScript. Do not copy boilerplate that contradicts the product: photographs genuinely do not leave the device on Free and Personal, and the privacy policy must say so accurately. Legal content requires Lizzie's review before the packet is marked done; the executor drafts, it does not sign off.
**Acceptance criteria:**
- [ ] `/privacy`, `/terms` and a cancellation/refund statement all return 200 with `text/html`.
- [ ] All three are linked from the footer on **both** the Personal and Business surfaces.
- [ ] The privacy policy states the local-first position, and separately describes the Business consent-record processing that `product.js` already implements.
- [ ] The refund statement covers UK distance-selling cancellation rights for the tiers named in `PLAN_METADATA`.
- [ ] **Cancellation treatment is legally classified before sale.** Do **not** implement a blanket "non-refundable after the first live photo" rule as a product policy. UK rules treat digital content and services differently: for digital content supplied within the 14-day cancellation period, losing the cancellation right requires the consumer's **express consent to immediate supply and their acknowledgement that the right is lost**; for a service begun during the cooling-off period, the position can instead involve **proportionate payment** for what has been supplied, with the right ending only on full performance plus the required request and acknowledgement. The one-event entitlement has characteristics of **both**, so the classification must be made — not assumed — and checkout must capture whatever express consent and acknowledgement the applicable regime requires.
- [ ] The classification reached, and who made it, is recorded in the tracker decision log.
- [ ] Pages render with JavaScript disabled.
- [ ] Two ADRs are recorded in the tracker decision log per C1: grandfathering posture, and client-side entitlement posture.
- [ ] Preflight green.
**Verification checklist:** `curl -sI` each of the three routes. Load each with JS disabled. Confirm footer links on `/` and `/business`.
**Rollback:** Revert; routes 404 again as they do today.
**Complexity:** Medium
**Definition of done:** as above, **plus Lizzie's explicit sign-off on the legal content.**

---

### Packet PB-05 — Introduce the origin constant and complete the social metadata
**Phase:** P2
**Objective:** Make a shared link render as a keepsake instead of a bare URL, closing audit F-05, F-06 and F-18, on a foundation the migration can repoint (C5).
**Depends on:** nothing
**Files:** `index.html` (`<head>`), `app.js` (surface routing — `showProductRoute`).
**Constraints:** Exactly one constant holds the origin; nothing else hardcodes a hostname. Do not generate `og:image` at runtime from a canvas — it must be a real, cacheable, crawlable file. Do not change the visible page content.
**Acceptance criteria:**
- [ ] A single `SITE_ORIGIN` constant exists and every absolute URL in the head derives from it.
- [ ] Complete `og:` and `twitter:` sets are present: `og:title`, `og:description`, `og:image`, `og:url`, `og:type`, `twitter:card`, `twitter:title`, `twitter:description`, `twitter:image`.
- [ ] `og:image` is a real committed file showing a rendered keepsake, at least 1200×630, under 300 KB.
- [ ] `<link rel="canonical">` is present and correct on both surfaces.
- [ ] Selecting the Business surface updates `title`, `description`, `canonical` and `og:url` to Business-specific values; returning to Personal restores them.
- [ ] Exactly one `<h1>` is present in the DOM per active surface.
- [ ] Preflight green; all ten demo canvases still report `data-demo-ready="true"`.
**Verification checklist:** Load `/`, read every `meta[property]` and `meta[name]`; repeat after switching to Business and confirm the values changed. `curl -sI` the `og:image` URL for 200 and content-type. Paste the deployed URL into a link-preview validator.
**Rollback:** Revert. No storage.
**Complexity:** Medium
**Definition of done:** as above.

---

### Packet PB-06 — Cut the demo contact sheet from 2.23 MB to under 200 KB
**Phase:** P2
**Objective:** Remove 96% of the page's weight, closing audit F-17.
**Depends on:** nothing
**Files:** `assets/` (new encoded image), `marketing.js` (source constants at [8-10](../../marketing.js:8)), `index.html` if a `<picture>` element is used, `sw.js` (the `ASSETS` entry only).
**Constraints:** **The three demo photographs must remain visually unchanged** at their rendered sizes — this image feeds the real renderers, so degrading it degrades the product demo. `SOURCE_WIDTH`, `SOURCE_COLUMN` and `SOURCE_CROP_HEIGHT` are used for column arithmetic in `marketing.js`; if the source dimensions change, every one must be updated consistently. Keep the `sw.js` asset list finite and correct — a stale filename there breaks offline install.
**Acceptance criteria:**
- [ ] Total critical-path transfer is **under 400,000 bytes** (baseline 2,331,527).
- [ ] The image carries only the rows actually displayed (currently 640 of 1024 — 37% is never shown).
- [ ] A modern format is served with a working fallback for older Safari, or a single format is used that all supported targets decode.
- [ ] All ten demo canvases report `data-demo-ready="true"` and are visually indistinguishable from the current output at rendered size.
- [ ] `sw.js` `ASSETS` references the shipped filename; no 404 during service-worker install.
- [ ] Preflight green.
**Verification checklist:**
```bash
total=0; for f in index.html styles.css fonts.js covers.js polaroid.js mp4.js product.js app.js marketing.js; do total=$((total+$(curl -s -H 'Accept-Encoding: gzip, br' -o /dev/null -w "%{size_download}" "$DEPLOY_URL/$f"))); done; echo "JS/CSS/HTML: $total"
```
Add the image's transfer size and confirm the sum is under 400,000. Open devtools Application → Cache Storage and confirm the install succeeded with no missing entry.
**Rollback:** Revert; the old PNG returns. Note that clients holding the old service-worker cache need one refresh cycle — the existing `checkForUpdate` handles this.
**Complexity:** Medium
**Definition of done:** as above.

---

### Packet PB-07 — Ship robots.txt, sitemap.xml and a branded 404
**Phase:** P2
**Objective:** Close audit F-07 and F-08 against the origin constant, so nothing must be rewritten on migration day (C6).
**Depends on:** **PB-05** (requires `SITE_ORIGIN`)
**Files:** new `robots.txt`, new `sitemap.xml`, `vercel.json` (catch-all and 404 handling), a 404 page.
**Constraints:** Both files must derive their URLs from the same origin value PB-05 established — if the toolchain cannot template a static file, the packet must state where the value is duplicated so PB-15 can update it, and the tracker must record it. The 404 page must not require JavaScript to show a route home.
**Acceptance criteria:**
- [ ] `/robots.txt` returns 200 `text/plain` and references the sitemap.
- [ ] `/sitemap.xml` returns 200 and lists both surfaces with correct absolute URLs.
- [ ] An unknown path returns a **branded** 404 with a working link to the booth, `content-type: text/html`.
- [ ] Every location holding a hardcoded origin is listed in the tracker for PB-15 to update.
- [ ] Preflight green.
**Verification checklist:** `curl -sI` for `/robots.txt`, `/sitemap.xml`, `/nonexistent-page-xyz`. Load the 404 with JS disabled and confirm the link home works.
**Rollback:** Revert. No storage.
**Complexity:** Low
**Definition of done:** as above.

---

### Packet PB-08 — Fix the mobile navigation containing block
**Phase:** P3
**Objective:** Reattach the audience nav to the header on mobile, closing audit F-21.
**Depends on:** nothing
**Files:** `styles.css` (line [364](../../styles.css:364) media block only).
**Constraints:** This is a **pure CSS fix with a known root cause** — do not restructure the header markup, and do not change the desktop layout. The intended design (a tab bar hanging off the header's bottom border, `border-top:0`) is correct and must be preserved. Do not "fix" it by increasing `.hero-section` padding; that hides the symptom and leaves the nav in the wrong place.
**Root cause, for the executor:** `.audience-nav` carries both `grid-row:2; grid-column:1/-1` and `position:absolute`. For an absolutely-positioned grid item the containing block is its **grid area**, not the grid container's padding box, so `top:72px` is measured from the top of implicit row 2 (~y=71) and the 72px header height is counted twice. Removing the grid placement properties, or setting `top:100%`, resolves it.
**Acceptance criteria:**
- [ ] At 375×812 the nav's top edge is flush with the header's bottom edge (within 1px).
- [ ] The nav's bounding rect does not intersect `.hero-kicker`'s bounding rect.
- [ ] Desktop layout at 1280×800 is unchanged.
- [ ] The nav remains centred and keeps its border treatment.
- [ ] No horizontal document overflow is introduced at 375px.
- [ ] Preflight green.
**Verification checklist:** At 375×812 evaluate:
```js
const n=document.querySelector('.audience-nav').getBoundingClientRect(), h=document.querySelector('.site-nav').getBoundingClientRect(), k=document.querySelector('.hero-kicker').getBoundingClientRect();
({gap: Math.round(n.top-h.bottom), overlapsKicker: !(n.right<k.left||n.left>k.right||n.bottom<k.top||n.top>k.bottom), overflow: document.documentElement.scrollWidth>document.documentElement.clientWidth})
```
Expected: `gap` 0±1, `overlapsKicker` false, `overflow` false. Baseline today: gap 71, overlaps true.
**Rollback:** Revert one CSS declaration block.
**Complexity:** Low
**Definition of done:** as above.

---

### Packet PB-09 — Differentiate camera failures and remove the native alert
**Phase:** P3
**Objective:** Replace one Safari-specific `alert()` covering six causes with recoverable in-page states, closing audit F-04.
**Depends on:** nothing
**Files:** `app.js` (the `catch` at [915-935](../../app.js:915) only), `index.html` (an error state region), `styles.css`.
**Constraints:** **Do not modify `startCamera`, the countdown, capture, grading or gallery-save logic** — only the failure branch. Preserve the existing `cancelled` short-circuit and the `sid !== captureSessionId` session guards exactly; they prevent a stale session from writing over a new one. Do not add a permissions pre-prompt screen — that is a redesign, not a fix.
**Acceptance criteria:**
- [ ] The `catch` branches on `err.name`, handling at minimum `NotAllowedError`, `NotFoundError` and `NotReadableError` distinctly, with a sensible default for everything else.
- [ ] No `alert()` remains in the capture path.
- [ ] No message names a specific browser unless that browser was actually detected.
- [ ] In-app browsers (no `getUserMedia`, or a blocked call) get an explicit "open in your normal browser" route.
- [ ] The error state offers a retry that re-enters capture without a page reload.
- [ ] Session guards and the `cancelled` path are unchanged; a cancelled session still produces no message.
- [ ] Preflight green.
**Verification checklist:** In devtools, override `navigator.mediaDevices.getUserMedia` to reject with `new DOMException('x','NotAllowedError')`, then `NotFoundError`, then `NotReadableError`, then `delete navigator.mediaDevices`; confirm four distinct recoverable states and that retry works. **[verify by hand]** — before this packet is marked done, confirm on real hardware what WhatsApp and Instagram in-app browsers actually do on iOS and Android, and check the copy matches.
**Rollback:** Revert. No storage.
**Complexity:** Medium
**Definition of done:** as above, **plus the owed manual verification recorded in the tracker.**

---

### Packet PB-10 — Close the measured accessibility gaps
**Phase:** P3
**Objective:** Fix the one AA contrast failure, the small demo targets and the missing skip link, closing audit F-24, F-25 and F-26.
**Depends on:** nothing
**Files:** `styles.css`, `index.html` (skip link).
**Constraints:** **Do not touch the focus ring, `prefers-reduced-motion` or `lang`** — all three are correct and are existing assets. The demo chips are at 29px, which *passes* WCAG 2.2 SC 2.5.8 (24×24 minimum); raising them to 44px is a usability improvement against Apple's guidance, not a conformance fix, and must not change the demo's layout on desktop.
**Acceptance criteria:**
- [ ] `.product-kicker` reaches ≥4.5:1 against its background (baseline 3.60:1).
- [ ] All demo frame/filter/style chips are ≥44×44 CSS px at 375px width.
- [ ] A skip-to-content link is the first focusable element, visible on focus.
- [ ] All eight text roles sampled in the audit pass their AA threshold.
- [ ] A real Tab press still produces the 3px `:focus-visible` outline.
- [ ] Desktop demo layout is unchanged.
- [ ] Preflight green.
**Verification checklist:** Re-run the audit's contrast script over the eight roles; all must report `passesAA: true`. At 375px, confirm no `#landing button` has height < 44. Press Tab from page load and confirm the skip link appears and works.
**Rollback:** Revert. No storage.
**Complexity:** Low
**Definition of done:** as above.

---

### Packet PB-11 — Reprice Personal around the event
**Phase:** P4
**Objective:** Replace duration-based tiers with event-based pricing before billing freezes the model, closing audit F-22 (see C4).
**Depends on:** PB-02
**Files:** `product.js` (`PLAN_METADATA` **only**), `index.html` (pricing copy), `tests/product.test.js` if plan assertions exist.
**Constraints:** **This is the one packet permitted to edit `product.js`, and only within `PLAN_METADATA`.** `CAPABILITY_MATRIX`, `ENTITLEMENTS`, `CHECKOUT_POLICY`, the consent validators and the brand-asset validator are frozen. Entitlement **constant names do not change** — the Worker's D1 schema and both test suites depend on `PERSONAL_6_MONTH` and `PERSONAL_12_MONTH` as identifiers. Change what they *mean and cost*, not what they are called. Founding Lifetime is unchanged at £100 with its 500 cap. `checkoutProductKey` values must remain stable or the change must be recorded for PB-16.
**Acceptance criteria:**
- [ ] Personal is sold as an event, not a duration, in all user-facing copy.
- [ ] `PLAN_METADATA` reflects the new model with `amountMinor` in integer minor units and `currency: "GBP"`.
- [ ] No entitlement constant is renamed; `grep -c "PERSONAL_6_MONTH" product.js` is unchanged.
- [ ] `CAPABILITY_MATRIX` is byte-identical to before this packet.
- [ ] No capability anywhere derives from a price, label or amount.
- [ ] Any `checkoutProductKey` change is recorded in the tracker for the Stripe products PB-16 will need.
- [ ] Preflight green — **all 17 browser tests still pass.** A failure here means a capability was changed, not a price.
**Verification checklist:** `git diff product.js` and confirm every changed line is inside `PLAN_METADATA`. Run the preflight. Load `/` and confirm the pricing section reads coherently with no orphaned "6 months" or "1 year" strings: `grep -rn "6 months\|1 Year\|six months\|twelve months" index.html`.
**Rollback:** Revert. No storage, no live Stripe objects exist yet — which is precisely why this packet runs now.
**Complexity:** Medium
**Definition of done:** as above.

---

### Packet PB-12 — Show the free-vs-paid cover difference, and make the refusal a purchase moment
**Phase:** P4
**Objective:** Surface the paywall's real value and complete the F-03 end state, closing audit F-23 and the remainder of F-12 (see C2).
**Depends on:** **PB-03, PB-11**
**Files:** `index.html` (pricing section), `marketing.js` (an additional comparison render), `app.js` (the PB-03 refusal message gains a route to pricing).
**Constraints:** The comparison must be produced by the **real cover renderer**, exactly as the existing demos are — no mockups, no screenshots. Reuse the existing `.compare-card` / `.compare-versus` pattern the landing page already uses for the welcome screen; do not mint a new comparison component. Do not change `DEFAULTS.eventTitle` — `"Your Celebration"` is the correct free-tier behaviour and is the very thing being demonstrated. Do not gate the setup flow's entrance.
**Acceptance criteria:**
- [ ] The pricing section shows two real rendered covers side by side: one mastheaded from `DEFAULTS.eventTitle`, one from a sample event title.
- [ ] Both are rendered by `Covers`, not embedded as static images.
- [ ] The Free pricing card's copy names the masthead difference, not just the credit line.
- [ ] The PB-03 refusal message links to the pricing section.
- [ ] The existing `.compare-card` pattern is reused; no new comparison component is introduced.
- [ ] Preflight green; all demo canvases still report ready.
**Verification checklist:** Load `/`, confirm both comparison canvases carry `data-demo-ready="true"` and show visibly different mastheads. From an empty `localStorage`, run the PB-03 flow and confirm the message routes to pricing.
**Rollback:** Revert. No storage.
**Complexity:** Medium
**Definition of done:** as above.

---

### Packet PB-13 — Make the app subpath-ready
**Phase:** P5
**Objective:** Guarantee the product works under `/photobooth/` before anything points at it, closing audit F-19 and F-20.
**Depends on:** PB-05
**Files:** `vercel.json`, `index.html` (`<base>` guard), possibly `manifest.webmanifest`.
**Constraints:** **Do not convert relative paths to absolute** — relative paths are the correct choice for a portable subpath app and are what make this migration possible at all. The fix is a trailing-slash guarantee and a catch-all rewrite, not a path rewrite. The service worker registers `./sw.js` and will correctly scope to `/photobooth/`; do not add a `scope` option or a `Service-Worker-Allowed` header. Keep the `sw.js` `ASSETS` list relative.
**Acceptance criteria:**
- [ ] A request to the subpath **without** a trailing slash permanently redirects to the version **with** one.
- [ ] A catch-all rewrite serves the app for any path under the subpath; enumerating routes in two places is removed.
- [ ] `/photobooth/business` serves the app and the client selects the Business surface.
- [ ] The app is verified working end to end when served from a subpath — not only from a root — with all assets 200 and the service worker registering with the subpath scope.
- [ ] `manifest.webmanifest` `start_url` still resolves correctly under the subpath.
- [ ] Preflight green.
**Verification checklist:** Serve the repo locally under a `/photobooth/` prefix. Load `/photobooth` and confirm the redirect. Confirm `styles.css`, `app.js`, `covers.js` and the manifest all return 200 under the prefix. In devtools Application → Service Workers, confirm the scope is `/photobooth/`. Load `/photobooth/business` directly with a hard navigation. **[verify by hand]** — audit F-20 recorded one unexplained hard-navigation timeout to `/business`; confirm hard navigation works under the subpath before PB-15.
**Rollback:** Revert. The current root deployment is unaffected either way.
**Complexity:** High
**Definition of done:** as above.

---

### Packet PB-14 — Give organisers a way to carry their booth to the new domain
**Phase:** P5
**Objective:** Stop the origin change from silently destroying every organiser's configuration, closing audit F-09 (settings half).
**Depends on:** nothing
**Files:** `app.js` (settings screen — export and import), `index.html`, `styles.css`.
**Constraints:** **Settings only. The gallery is explicitly out of scope** per decision 2 (§6) — photographs are large and the decision is recorded, not drifted into. Do not upload anything anywhere; this is a local file download and a local file read, consistent with the local-first principle. Do not rename any storage key. The import must validate its input and refuse malformed data rather than writing a broken settings object.
**Acceptance criteria:**
- [ ] An organiser can export their event settings to a file from the settings screen.
- [ ] An organiser can import that file on a different origin and recover their configuration.
- [ ] The export carries a schema version so a future format change is detectable.
- [ ] Import validates and rejects malformed input with a visible message; it never writes a partial settings object.
- [ ] Nothing is transmitted over the network at any point in either operation.
- [ ] The gallery is not exported, and the UI states plainly that saved sessions stay on the old device.
- [ ] Preflight green.
**Verification checklist:** Export from `http://localhost:PORT_A`, import at `http://localhost:PORT_B` (a different origin), confirm settings match. Import a truncated and a malformed file; confirm both are refused with a message and the existing settings survive. Watch the network panel during both operations and confirm zero requests.
**Rollback:** Revert. Exported files remain readable by the reverted build only if the format is unchanged — note this in the tracker.
**Complexity:** High
**Definition of done:** as above.

---

### Packet PB-15 — Cut over to mybishbash.app/photobooth
**Phase:** P5
**Objective:** Move the product to its real address without stranding anyone, completing F-09, F-10 and F-19, and repointing everything PB-05 and PB-07 established.
**Depends on:** **PB-13 and PB-14 — prerequisite pair. Both must have landed.**
**Files:** `SITE_ORIGIN` (PB-05), any duplicated origin recorded by PB-07, `vercel.json`, the old origin's configuration.
**Constraints:** This is the **only irreversible-feeling packet** in the programme and the only one that changes what the public sees at a new address. Do not run it until PB-13's subpath verification has actually passed on a deployed environment, not just locally. Do not delete the old deployment — it must keep serving the hand-off. Do not announce or share the new URL as part of this packet; that is Lizzie's call.
**Acceptance criteria:**
- [ ] `https://mybishbash.app/photobooth` (no slash) redirects to `/photobooth/`, which returns 200 and renders fully styled.
- [ ] `SITE_ORIGIN` and every duplicate recorded by PB-07 now name the new address; `grep -rn "raes-photo-booth"` returns nothing outside `docs/`.
- [ ] `canonical`, `og:url`, `sitemap.xml` and `robots.txt` all name the new address.
- [ ] `/photobooth/business` works on a hard navigation.
- [ ] The service worker registers with scope `/photobooth/` and offline load works after one visit.
- [ ] The old origin serves a hand-off explaining the move, linking to the new address, and pointing organisers at PB-14's export before they lose access.
- [ ] The grandfathering ADR from PB-04 is confirmed still accurate now that the origin has changed.
- [ ] Preflight green.
**Verification checklist:** `curl -sIL https://mybishbash.app/photobooth` and confirm the redirect chain ends 200. Load the new URL cold, confirm styling, then go offline and reload to confirm the service worker serves the shell. Paste the new URL into a chat app and confirm the preview card renders. Load the old origin and confirm the hand-off.
**Rollback:** Repoint the constant and revert the proxy rules. **Users who exported settings after cutover keep working files.** Users who installed the PWA from the new origin will hold a stale scope — note this in the tracker as a known cost.
**Complexity:** High
**Definition of done:** as above.

---

### Packet PB-16 — GATE: decide whether to activate billing
**Phase:** P6
**Objective:** Establish, with evidence, whether payments should go live — and record NO-GO as a valid, successful outcome.
**Depends on:** PB-04, PB-11, PB-15
**Files:** tracker decision log; `worker/README.md` if setup gaps are found. **No application code changes.**
**Constraints:** **This packet is a measurement and a decision, not a deployment.** The executor must not deploy the Worker, must not create Stripe products, must not handle live keys, and must not flip PB-02's billing constant. Live Stripe activation requires Lizzie's credentials and legal sign-off and is **out of scope for this programme** (§12). A NO-GO outcome is a success, not a failure — say so plainly in the report.
**Acceptance criteria:**
- [ ] The report states GO or NO-GO with reasons.
- [ ] Each precondition is verified and recorded: terms/privacy/refunds reachable (PB-04); pricing model settled and `checkoutProductKey` values final (PB-11); the product live at its final domain (PB-15); worker tests green; `worker/README.md` sufficient to configure D1, R2, Stripe keys and the webhook secret from scratch.
- [ ] Any gap between `PLAN_METADATA` and the Stripe products that would need creating is enumerated.
- [ ] The exact steps to flip PB-02's billing constant and proxy `/v1` are written down for whoever holds the credentials.
- [ ] Confirmation that no browser code path grants a paid entitlement — `CHECKOUT_POLICY.clientSuccessRedirectGrantsEntitlement` is still `false` and `handleCheckoutReturn` still treats a success redirect as presentational only.
- [ ] Preflight green.
**Verification checklist:** `cd worker && npx vitest run`. `curl -sI` the three legal routes on the live domain. Read `handleCheckoutReturn` ([app.js:1565](../../app.js:1565)) and confirm it grants nothing.
**Rollback:** Nothing to roll back; no code changed.
**Complexity:** Medium
**Definition of done:** report written into the tracker, GO/NO-GO recorded, no code changed.

---

## 12. Out of scope

Named so nobody drifts into them and calls it diligence:

- **Live Stripe deployment and Worker hosting.** Needs credentials and legal sign-off. PB-16 prepares it; a human performs it.
- **Any change to the rendering engine** — covers, editorial finish, Polaroid, MP4, filters, fonts. The audit found nothing wrong with them.
- **Refactoring `app.js`.** At 1,790 lines it is large, but the audit found no defect caused by its size, and sunk-cost-free honesty cuts both ways: churn without a user-visible reason is not improvement.
- **A build step, framework, bundler or TypeScript migration.** The no-build static architecture is why this product runs offline on an old iPad.
- **Analytics or any tracking.** Would require its own consent decision and contradicts the privacy position that PB-04 is about to make binding.
- **A visual redesign or re-theme.** The audit rated marketing craft 7/10 with two specific defects, both packeted.
- **Gallery migration across origins.** Decision 2, recorded, deliberate.
- **A contact form or contact page on `mybishbash.app`.** PB-01 uses `mailto:`; a page is a different project's work.
- **Server-side entitlement enforcement.** C1 — documented as a posture, not built.

---

---

# Amendment 001 — Four experiences, event lifecycle, and the £19/$377 model

**Date:** 2026-08-10
**Trigger:** Commercial and product decisions taken by Lizzie after the audit was accepted.
**Status:** Authoritative. Where this amendment and §1–§12 disagree, **this amendment wins**; §1–§12 are otherwise unchanged and still binding.

## A1.1 — What changed at the product level

The programme was written against a product with one booth and four entitlement booleans. The decisions now taken define **four conceptually distinct experiences** — Landing Demo, Free Photobooth, Personalised consumer Photobooth, Business Photobooth — of which only the first and a partial second exist today.

Three of those are new **domain concepts**, not new capability flags: a persistent free booth with its own identity, an event lifecycle with an activation clock, and a consumable one-event licence. §7 of this spec froze `CAPABILITY_MATRIX` precisely so that a packet could not quietly widen the entitlement model to make a commercial idea fit. That freeze holds. The correct response is a packet that owns the widening explicitly — **PB-21** — not an exception granted to PB-11.

## A1.2 — Factual corrections to the programme's assumptions

Five things the original spec assumed, which inspection disproved. Each changes a packet.

1. **The landing demo never touches the camera or storage.** It is `marketing.js` rendering `assets/demo-photos.png` through the real `Covers`/`Polaroid` renderers onto canvases. It is therefore *already* disposable, and needs no work to make it so. What does not exist is a distinction between "try the demo" and "create a real booth" — `START PHOTOBOOTH` goes straight to the camera.

2. **Free does not persist configuration today — it is actively wiped.** `launchFreeBooth` ([app.js:1501](../../app.js:1501)) sets `settings={...DEFAULTS}` and stashes the previous values in `temporarySettingsSnapshot`. Free persistence is a behaviour change, not a configuration change.

3. **Free photos DO persist, and are silently deleted after 20 sessions.** `saveSessionToGallery` runs regardless of entitlement and calls `trimGallery(20)` ([app.js:301](../../app.js:301)). A 40-guest party silently loses its first 20 sessions. This is exactly the arbitrary limit the new decisions forbid, and the audit did not surface it because the capture path was never exercised.

4. **Stored photos are full-resolution base64 JPEG data URLs.** `capturePhoto` returns `toDataURL("image/jpeg",.96)` at capture resolution ([app.js:859](../../app.js:859)), stored directly into IndexedDB. Measured at 1920×1080 q0.96: **548,468 bytes raw → 731,290 bytes as a data URL → 2.19 MB per three-photo session → a 43.9 MB ceiling at the current 20-session cap.** Real party captures will exceed this, since the measured source has less high-frequency detail than a live scene.

5. **There is no storage-exhaustion handling of any kind.** No `QuotaExceededError` handling, no `navigator.storage.estimate()`, and `saveSessionToGallery` ends in `catch(e){}` — so when quota is hit mid-event, photos stop saving silently and nobody is told.

6. **`boothExampleMode` is never consulted by any render or export path.** Preview outputs are byte-identical to real ones. The preview-must-be-marked requirement has no existing mechanism to extend.

7. **`FOUNDING_LIFETIME` cannot be deleted.** It is referenced in the Worker's D1 queries (`worker/src/billing.ts:230,520,563`) and asserted in 8 places in `tests/product.test.js`. **Retire it from sale via `PLAN_METADATA`; do not remove the entitlement constant.**

## A1.3 — Revised decisions

These supersede the corresponding rows in §6.

| # | Original decision | Revised | Why |
|---|---|---|---|
| 4 | Per-event pricing; Founding Lifetime unchanged at £100 | **FREE £0 · ONE EVENT £19 · ANNUAL $377/yr. No Lifetime tier on sale.** `FOUNDING_LIFETIME` retired from sale, constant retained | Owner decision. The £19/$377 ladder breaks even at 3 events, which resolves the tier-domination problem raised against the earlier $44/£50 proposal |
| 5 | Business keeps no public price | **Unchanged and reinforced** — "Request a demo / Contact us", no invented figures | Owner decision: test willingness to pay through pilots first |
| — | *(new)* | **Free gets generic celebration identity by event type; full custom event identity is the paid lever** | Makes personalisation the conversion mechanism rather than crippling |
| — | *(new)* | **Storage management is an engineering concern, never a pricing mechanism** | `trimGallery(20)` must go, but only after storage is managed |

**Unchanged and still binding:** decisions 1 (billing after migration), 2 (gallery not carried across origins), 3 (grandfathering ends at origin change); challenges C1–C6; and the §12 out-of-scope list, extended in A1.6.

## A1.4 — Amendments to existing packets

| Packet | Amendment |
|---|---|
| **PB-02** | The founding-list framing is retired with the Lifetime tier. The interest-capture route remains; its wording must not reference a founding or lifetime offer. |
| **PB-11** | **Now depends on PB-21.** Prices `FREE £0`, `ONE_EVENT £19`, `PERSONAL_12_MONTH $377`. Adds a not-for-sale flag to `FOUNDING_LIFETIME` rather than deleting it. Its constraint is otherwise unchanged: `PLAN_METADATA` only, `CAPABILITY_MATRIX` byte-identical. **`tests/product.test.js` lines 64–70 assert the old amounts and must be updated in the same packet** — that is expected, not a violation. |
| **PB-12** | The free side of the comparison is no longer `DEFAULTS.eventTitle = "Your Celebration"`; it is the event-type identity introduced by PB-18. **Now depends on PB-18.** |
| **PB-14** | Promoted from a migration utility to a standing product feature: device-loss insurance, not just an origin hand-off. Adds a truthful storage-location statement in the UX and a private-browsing warning where detectable. Schema versioning was already required and remains. |
| **PB-16** | Gate preconditions extended: Annual must not be offered for sale until entitlement recovery exists, per A1.5. |

No other packet changes. **PB-01, PB-03…PB-10, PB-13, PB-15 are unaffected and remain executable exactly as written.**

## A1.5 — New packets

Numbers continue from PB-16 and are **identity, not execution order** — the tracker's `#` column is the execution position. Never renumber a landed packet.

---

### Packet PB-17 — Make local photo storage survivable
**Phase:** P3 · **Objective:** Replace silent data loss and silent quota failure with a managed, measurable storage strategy — the prerequisite for removing the 20-session cap.
**Depends on:** nothing
**Files:** `app.js` (`capturePhoto` [859](../../app.js:859), `saveSessionToGallery` [290](../../app.js:290), `trimGallery` [301](../../app.js:301)), `index.html`/`styles.css` for a warning surface.
**Constraints:** **Do not change what the guest sees rendered.** The strip, cover and Polaroid must be pixel-identical to today at their output sizes — the retained representation may change, the product may not. Do not introduce a commercial limit; this packet exists so that limits are unnecessary. Do not remove `trimGallery` in this packet — replace the arbitrary 20 with a storage-aware policy. `catch(e){}` swallowing write failures must end.
**Acceptance criteria:**
- [ ] The retained per-session representation is measured before and after, and the reduction is recorded in the tracker (baseline: 2.19 MB/session, 731,290 bytes/photo as a data URL).
- [ ] Photos are no longer retained as base64 data URLs where a binary representation is available to the storage layer.
- [ ] Capture resolution and rendered output quality are unchanged; the full-resolution capture remains available for the duration of the guest's session so the cover finish is unaffected.
- [ ] `QuotaExceededError` and a failed write are handled explicitly and surfaced to the booth operator, not swallowed.
- [ ] Remaining storage is checked via `navigator.storage.estimate()` where supported, and the operator is warned before exhaustion rather than at it.
- [ ] The session cap is storage-derived, not the hardcoded 20; the change in effective capacity is recorded.
- [ ] Preflight green.
**Verification:** Fill the gallery to quota in a constrained profile and confirm a visible warning and no silent loss. Compare a strip, cover and Polaroid rendered before and after the change at identical settings.
**Complexity:** High
**Rollback:** Revert. **Sessions written under the new representation may not be readable by the reverted build — state the migration posture in the packet commit.**

---

### Packet PB-18 — Make Free a real, persistent photobooth with its own identity
**Phase:** P3 · **Objective:** Turn Free from a settings-wiped single run into a booth someone can set up at a party and return to, with generic celebration identity by event type.
**Depends on:** **PB-17** (removing the cap before storage is managed kills the booth mid-party)
**Files:** `app.js` (`launchFreeBooth` [1501](../../app.js:1501), `DEFAULTS` [1](../../app.js:1), settings persistence [226](../../app.js:226)/[367](../../app.js:367)), `index.html`, `styles.css`.
**Constraints:** **Free must not gain full custom event identity** — that is the paid lever. Free chooses an event *type* and receives generic identity (`MY BIRTHDAY`, `MY PARTY`, `CELEBRATE`), never `Rae's 26th Birthday`. Free keeps heavy MyBishBash branding; `OUTPUT_BRANDING_POLICIES.FREE` is unchanged and `product.js` is not touched. Do not gate the camera, impose photo limits, or degrade capture quality to drive conversion. Do not require an account. Storage keys are contracts — persisting free settings must not collide with or overwrite the paid settings key without a stated migration.
**Acceptance criteria:**
- [ ] A free user's booth configuration persists across page reloads and across separate guest sessions on the same device.
- [ ] `launchFreeBooth` no longer discards the user's configuration into a temporary snapshot.
- [ ] Free offers exactly four event types — **Birthday · Wedding · Party · Celebration** (locked 2026-08-10; `Celebration` is the deliberate catch-all, so no further taxonomy is added) — each yielding a generic identity used by the welcome screen and all three outputs.
- [ ] No free path produces a fully custom event title.
- [ ] Free exports still carry the `FREE` branding policy unchanged.
- [ ] There is no session, photo or time limit on Free beyond the storage-derived policy from PB-17.
- [ ] Preflight green; the entitled-user settings path is unchanged.
**Verification:** Configure a free booth, run three guest sessions, reload, confirm configuration and gallery survive. Confirm no free route reaches a custom title. Confirm a paid-path save still behaves as before.
**Complexity:** High

---

### Packet PB-19 — "Your Photobooth": return access and three honest entry routes
**Phase:** P3 · **Objective:** Stop marching an existing booth owner through the marketing journey, and make the demo/free/mine distinction legible in seconds.
**Depends on:** **PB-18**
**Files:** `index.html` (landing hero and nav), `app.js` (boot-time state detection, routing), `styles.css`.
**Constraints:** Extend the existing surface/history model (`HISTORY_SURFACE`, `showProductRoute`, `enterEventHome`) — **do not mint a parallel routing concept**. The demo must remain camera-free and storage-free; do not wire it to `getUserMedia`. Do not add an account, a login or a magic link. A visitor with no booth must still reach a free booth in one action.
**Acceptance criteria:**
- [ ] On load, locally persisted booth state is detected and an `OPEN MY PHOTOBOOTH` route is offered with the booth's identity shown.
- [ ] A visitor with no booth sees `TRY THE DEMO` and `CREATE MY FREE PHOTOBOOTH` as distinct actions with distinct outcomes.
- [ ] The demo neither requests camera access nor writes to storage.
- [ ] An existing owner reaches their booth without passing through setup.
- [ ] An `Edit setup` route exists from the booth identity.
- [ ] Back/forward behaviour remains coherent across all three routes.
- [ ] Preflight green.
**Verification:** With empty storage, confirm two routes and that the demo touches neither camera nor storage. With a booth configured, reload and confirm the return route appears with the correct identity. Exercise back/forward across all three.
**Complexity:** Medium

---

### Packet PB-20 — Event lifecycle as a domain concept
**Phase:** P4 · **Objective:** Introduce `DRAFT → LIVE → ENDED` with explicit activation and a 48-hour live period, mark DRAFT outputs unmistakably, and make repeat purchase frictionless by duplicating a previous event's design.
**Depends on:** PB-18
**Files:** `app.js` (new lifecycle state and persistence, `boothExampleMode` call sites), `index.html`, `styles.css`.

**Locked decisions (2026-08-10) — these are settled; do not re-derive them:**
- **Three states, not four.** PREVIEW is folded into DRAFT. DRAFT is editable, costs nothing, and permits test capture whose outputs are marked.
- **ENDED never removes the customer's photos.** It stops new *personalised* capture and export under that event entitlement. The complete existing gallery stays viewable, downloadable and shareable, permanently. Expiry must never become hostage-taking of customer-created content.
- **ENDED events are not reactivated.** A further purchase creates a *new* event entitlement. Offer "Use these settings again" to duplicate the previous event's design and settings into the new DRAFT.

**Constraints:** **This packet does not sell anything and does not touch `product.js`.** It models the lifecycle for both free and paid use; the entitlement that consumes it arrives in PB-21. **The clock starts on explicit activation only** — never on configuration, never on opening the booth, never on taking a DRAFT test photo. **The design must remain editable while LIVE**; correcting a typo mid-party is a requirement, not a bug. Draft marking must be rendered *into* the exported asset, consistent with how attribution already works — a DOM overlay would not survive Save. Do not build purchase, extension, reactivation or refund mechanics. "Use these settings again" copies configuration only — never photos, never an entitlement.
**Acceptance criteria:**
- [ ] The three states exist as an explicit, schema-versioned, persisted domain concept — not a boolean.
- [ ] Activation is a deliberate user action; editing a DRAFT or taking a DRAFT test photo never starts the clock.
- [ ] The LIVE period is 48 hours from activation, held as configuration rather than a literal.
- [ ] Every DRAFT output — strip, cover, Polaroid still and **every MP4 frame** — carries a conspicuous mark rendered into the asset, so a draft output cannot substitute for the live experience.
- [ ] Configuration remains editable in LIVE; the first live photo does not freeze the design.
- [ ] In ENDED, the full existing gallery remains viewable, downloadable and shareable; only new personalised capture stops.
- [ ] Creating a new event offers "Use these settings again", which copies design and settings into a fresh DRAFT and copies no photos and no entitlement.
- [ ] `boothExampleMode` is folded into this model or removed; two parallel preview concepts must not survive this packet.
- [ ] Preflight green.
**Verification:** Confirm marks on all four output types **as saved files**, not just on screen. Activate; confirm the clock starts only then, and that a DRAFT test photo did not start it. Edit copy while LIVE and confirm it applies. Force ENDED, then confirm every prior photo still opens, downloads and shares, and that new personalised capture is refused with a reason and a route. Duplicate settings into a new event and confirm no photos and no entitlement came with them.
**Complexity:** High

---

### Packet PB-21 — Extend the entitlement model for ONE_EVENT
**Phase:** P4 · **Objective:** Add the one-event consumable entitlement to `product.js` — the single packet authorised to widen the frozen boundary.
**Depends on:** **PB-20** (a consumable licence is meaningless without a lifecycle to consume)
**Files:** `product.js` (`ENTITLEMENTS`, `CAPABILITY_MATRIX`, and the one-event scope rules), `tests/product.test.js`.
**Constraints:** **This packet, and only this packet, may add to `ENTITLEMENTS` and `CAPABILITY_MATRIX`.** §7's freeze is otherwise unchanged and resumes immediately afterwards. Do not delete or rename any existing entitlement — `FOUNDING_LIFETIME` is referenced in `worker/src/billing.ts` D1 queries and 8 test assertions. Do not add pricing here; PB-11 owns `PLAN_METADATA`. Do not implement checkout, purchase credit or upgrade mechanics. **Do not implement client-side consumption enforcement as if it were secure** — record honestly that a one-event licence tracked locally fails *open* when storage is cleared, which is why sale is gated behind PB-16.
**Acceptance criteria:**
- [ ] `ONE_EVENT` exists as an entitlement with a capability row consistent with the licensing principle: full personal event identity, lighter attribution, **no commercial rights**.
- [ ] No personal entitlement — `ONE_EVENT`, `PERSONAL_12_MONTH`, `FOUNDING_LIFETIME` — grants any `business: true` capability.
- [ ] The one-event scope is expressed against PB-20's lifecycle, not as a photo or session count.
- [ ] Prices, labels and copy grant nothing; the §2.3 separation holds.
- [ ] The local-enforcement limitation is documented in code where a future reader will meet it.
- [ ] Existing entitlement constants are unchanged; the Worker's D1 queries still match.
- [ ] Preflight green with new assertions covering the added entitlement.
**Verification:** `node tests/product.test.js`. `git diff product.js` — every addition is a new key; no existing key is modified or removed. `grep FOUNDING_LIFETIME worker/src/billing.ts` still matches.
**Complexity:** High

---

## A1.6 — Revised sequencing

Execution order, with the two prerequisite chains that matter:

**Storage before freedom:** PB-17 → PB-18 → PB-19. Removing the 20-session cap before storage is managed converts a silent trim into a dead booth at a live party.

**Lifecycle before licence before price:** PB-20 → PB-21 → PB-11 → PB-16. This inverts the original plan, where PB-11 came first. PB-11 cannot price `ONE_EVENT` before the entitlement exists, and the entitlement cannot bound an event before the lifecycle does. C4 still holds — **pricing remains the freezing step and still lands before the billing gate.**

Full order: PB-01 · PB-02 · PB-03 · PB-04 · PB-05 · PB-06 · PB-07 · PB-08 · PB-09 · PB-10 · **PB-17 · PB-18 · PB-19** · PB-13 · PB-14 · PB-15 · **PB-20 · PB-21** · PB-11 · PB-12 · PB-16.

## A1.7 — What stays gated, and why

- **Both paid products are gated behind PB-16 (locked 2026-08-10).** Annual ($377) must not be offered for sale until entitlement recovery exists: a 12-month entitlement held only in `localStorage` means a customer who clears storage loses eleven months they paid for, which is a refund queue rather than a product. One Event (£19) is gated identically, and additionally fails *open* locally — the worse failure mode, but not the one that decides the gate. Model both in PB-21, price both in PB-11, sell neither until PB-16 passes. Early manual recovery for One Event is acceptable only if PB-16 records it as a deliberate, temporary posture.
- **All Business capability** — brand kits, multi-device, lead capture, analytics, consent databases, agency use — remains out of scope. Lead generation and attendee PII require a separately governed data architecture that does not exist.
- **The Business speculative-preview sales motion** is a manual process for now; PB-20's preview marking is the only architectural support it needs. **No website ingestion, no automated branding engine.**

## A1.8 — Additions to §12 out of scope

Extends, does not replace, the original list: accounts, authentication and magic links; cross-device synchronisation of any kind; automatic cloud recovery of booth or gallery; lead capture, attendee databases and analytics; automated brand ingestion; purchase-credit and upgrade mechanics; a 7-day or any additional duration tier; music, audio tracks and mute controls in any form — the existing shutter sound is unrelated and stays.

---

---

## A1.9 — Amendment 002: decisions locked 2026-08-10

The four questions Amendment 001 raised are now settled, plus one correction to it. All are folded into the packets above; this section records that they were decided, not assumed.

| # | Locked decision | Packet |
|---|---|---|
| 1 | **ENDED never removes the customer's photos.** It stops new personalised capture and export; the gallery stays viewable, downloadable and shareable permanently | PB-20 |
| 2 | **No reactivation.** A further £19 creates a *new* event entitlement, with "Use these settings again" to duplicate the previous design | PB-20 |
| 3 | **Four free event types only** — Birthday · Wedding · Party · Celebration. `Celebration` is the catch-all; no further taxonomy | PB-18 |
| 4 | **Neither paid product goes on sale before entitlement recovery exists.** PB-16 gates both | PB-16, A1.7 |
| — | **Lifecycle simplified to three states**, DRAFT → LIVE → ENDED. PREVIEW folds into DRAFT, which is editable, free, and permits marked test capture | PB-20 |

**Correction to Amendment 001.** A1 previously carried an instruction to state in the cancellation terms that the £19 licence becomes non-refundable once the first live photo is taken. **That is withdrawn.** It asserted a conclusion about which statutory exception applies, which is not a product decision to make by assertion. PB-04 now requires the cancellation treatment to be *legally classified before sale*, and requires checkout to capture whatever express consent and acknowledgement the applicable UK regime demands. The rationale — that the entitlement has characteristics of both digital content and an ongoing service, which are treated differently — is written into PB-04's criteria.

**Commercial note.** The £19/$377 ladder breaks even at **2.6 events**, against the six required by the earlier $44/£50 proposal. The tier-domination objection raised against that model does not apply to this one.

**Execution priority.** PB-17 is promoted to the next executable packet. The 20-session silent deletion and the swallowed quota failure are live defects in a shipped product, not future commercial architecture, and they are independent of every gated decision above.

---

---

# Amendment 003 — Reconciling the "we build your photobooth" direction

**Date:** 2026-08-11
**Source:** [RECONCILIATION-003.md](RECONCILIATION-003.md) — full evidence, sections A–J.
**Status:** **PROPOSED, NOT ACCEPTED.** Nothing in this amendment is executable until Lizzie accepts it. Amendments 001 and 002 remain binding meanwhile.

## A3.1 — The programme survives

**The existing packet programme still leads to the right product and does not need restarting.** The direction is largely additive to it.

**The immediate run is unchanged: `PB-17 → PB-10 → PB-05 → PB-07 → PB-09 → PB-03`.** Every packet in it is a live-defect fix or a marketing-surface fix; none touches configuration, lifecycle, pricing or the capture flow. The direction changes what comes *after* that run, not the run itself. PB-06 and PB-08 stay closed — the reconciliation found no regression or incompatibility in either.

The reason the fit is this good: **the generation engine already exists.** `derive()` produces all 28 cover copy slots deterministically from the event title, and `DEFAULTS` implements a blank-means-generate contract across 75 primitive-only fields. The work is a resolver in front of an engine, not a new engine.

## A3.2 — Amendments to existing packets

| Packet | Amendment |
|---|---|
| **PB-14** | **Becomes the Setup Pass.** Its objective (portable configuration off one device onto another) is the same mechanism the direction needs; building a file export *and* a Setup Pass would be two solutions to one problem. Now carries: sparse diff vs `DEFAULTS`, deflate-raw + base64url, delivered in a **URL fragment** (never a query string — fragments are not transmitted to servers, so configuration never lands in an access log), `setupVersion: 1`, bundled themes/templates referenced by ID. Hard exclusions: guest photographs, and `businessBrand.logoImage`. |
| **PB-18** | Its four Free event types must reconcile with the direction's seven creation-flow types — see decision 1 below. Otherwise unchanged. |
| **PB-19** | Gains the owner/guest separation. It already owns "Your Photobooth" return access, which is the same surface. |
| **PB-20** | Gains `PURCHASED_UNUSED` — see decision 2. Also gains the two-step activation confirm naming the event and the consequence. |
| **PB-21** | Unchanged in principle. `ONE_EVENT` remains the widening packet. |
| **PB-11** | Unchanged. Still the only owner of `PLAN_METADATA`. The direction explicitly does not change pricing. |

## A3.3 — New packets

**PB-22 must run first of these.** Hazard J.2: no event identity exists today, and retrofitting an ID after Setup Passes are in circulation is materially harder than adding one now.

| # | Packet | Grade | Objective |
|---|---|---|---|
| **PB-22** | Event identity and the `EventConfig` contract | **Execution-grade** | Add `schemaVersion`, `eventId`, `eventType`, `look` to the existing settings object. Purely additive — no restructuring, since `DEFAULTS` is already flat, primitive-only and fully serialisable. |
| **PB-23** | Deterministic generation: event-type copy presets | **Execution-grade** | `derive()` selects a copy preset table keyed by `eventType`. **Today's table becomes the `birthday` preset and the default, so current output is preserved byte-for-byte.** `occasionWord()` prefers the declared type over last-word inference. |
| **PB-24** | Event Look tokens | Directional | Promote `accent` into a named Look resolving to accent + five font roles. Widening to further surfaces (clause 16) needs a design pass first. |
| **PB-25** | BUILD MY PHOTOBOOTH creation flow | Directional | The four questions, the visual transition, "your photobooth is ready". Needs PB-22–24. Explicitly **not** a builder. |
| **PB-26** | Magazine per-template field schemas | **Execution-grade** | Give each template its own field list, limits and hierarchy. `COPY_KEYS` is currently one global list of 28 shared by all four templates; per-template schemas must stay backwards compatible with configs already saved under the shared keys. |
| **PB-27** | Magazine catalogue expansion | Directional | New original editorial systems on the existing registry (`TEMPLATES` + `RENDERERS`). Needs PB-26 and art direction. **The photo treatment is not reopened.** |
| **PB-28** | Multi-photo template support | Directional | Widen `render()` from a single `opts.img` to optional `img2`/`img3`. `photos[]` already holds three, so the data exists; template-specific by construction. |

## A3.4 — Proposed sequencing

Unchanged immediate run, then the direction's work:

`PB-17 → PB-10 → PB-05 → PB-07 → PB-09 → PB-03` *(unchanged)*
→ `PB-22 → PB-23` *(config contract, then generation)*
→ `PB-13 → PB-14 → PB-15` *(migration; PB-14 is now the Setup Pass)*
→ `PB-26` *(template schemas)*
→ `PB-20 → PB-21 → PB-11 → PB-16` *(lifecycle → licence → price → gate, unchanged)*
→ `PB-24, PB-25, PB-27, PB-28` *(directional; need a planning pass before execution)*

PB-22 before PB-14 is deliberate: the Setup Pass should carry an event ID from its first version.

## A3.5 — Decisions required before this amendment can be accepted

1. **Event type list.** Amendment 002 locked four Free types (Birthday · Wedding · Party · Celebration). The direction's creation flow lists seven (adds Baby shower, Anniversary, Graduation, and "Other"). **Recommendation: one list of seven, used by both**, with Free rendering a generic identity per type. Two lists for one concept is sibling synthesis.
2. **`PURCHASED_UNUSED`.** Amendment 002 locked three lifecycle states. Clause 10 requires a state where the customer owns an unused event. **Recommendation: model it as two orthogonal axes — lifecycle (`DRAFT`/`LIVE`/`ENDED`) × entitlement (none/held) — so `PURCHASED_UNUSED` is `DRAFT` × held.** This honours the locked three-state decision rather than reopening it, and keeps the two clocks (§F) separate.
3. **Does the Setup Pass replace the email restore flow for consumers?** Today the post-payment step is "request a restore link by email" ([app.js:1570](../../app.js:1570)), which does not fit "pay, then get a Setup Pass". They solve the same problem. Not a decision this document should take.

## A3.6 — Preserved without change

The capture flow (`startCamera`, countdown, `capturePhoto`, review) — the direction's clause 4 depends on the trial *being* the real booth, so the correct action is to leave it alone. The photo treatment (`FINISH`, [covers.js:357-375](../../covers.js:357)) — a separate pass from template drawing, which is exactly why the design layer can be upgraded without reopening it. The photos/configuration storage boundary. `product.js` as the entitlement boundary. The §12 and A1.8 out-of-scope lists, extended with: DSLR tethering, print servers, arbitrary overlay designers, professional booth hardware, and runtime generative AI for event copy.

---

---

# Amendment 004 — Amendment 003 ACCEPTED; blockers resolved

**Date:** 2026-08-11
**Status:** **ACCEPTED AND BINDING.** Amendment 003 is hereby accepted; PB-22…PB-28 and the PB-14/18/19/20 amendments are executable. Amendments 001 and 002 remain binding except where explicitly superseded below.

## A4.1 — The three blocking decisions, resolved

| A3.5 decision | Resolution |
|---|---|
| 1 — Event type list | **Seven, one list, used everywhere:** Birthday · Wedding · Baby Shower · Anniversary · Graduation · Party · Other. Supersedes Amendment 002's four. `Other` must degrade gracefully and must never infer something ridiculous from a name or a trailing title word. |
| 2 — `PURCHASED_UNUSED` | **Rejected as a lifecycle state.** Lifecycle and entitlement stay orthogonal: lifecycle `DRAFT / LIVE / ENDED` × entitlement `trial \| paid`. A customer who has paid but not pressed START EVENT is **`DRAFT` + paid**. This preserves Amendment 002's three-state lock. *(The direction wrote `EXPIRED`; `ENDED` is the already-locked name and is retained. Trivial to overrule.)* |
| 3 — Setup Pass vs email restore | **Adopted as the V1 transfer method, and it does not replace the restore flow — they solve different problems.** Setup Pass moves **configuration** to the event device. Restore recovers **entitlement**. Do not build email infrastructure to transport configuration. |

## A4.2 — New requirements not present in Amendment 003

These are additions, and they change packet scope.

### Event timing is three-valued (new)

`date` is today a single free-text string ([app.js:3](../../app.js:3), `<input id="setDate" maxlength="32">`) carrying **no precision information**. The product now requires three distinct timings:

| Precision | Customer enters | Rendered as (example) |
|---|---|---|
| Exact | 15/08/2026 | `15.08.26` |
| Approximate | August 2026 | `AUGUST 2026` |
| Unknown | "not sure yet" | omit date furniture, or year only if genuinely known and aesthetically right |

**Do not fabricate precision** — "August 2026" must never become "15/08/2026". **Never render `TBC`, `UNKNOWN` or `NO DATE`** on a guest-facing output unless the customer deliberately chose that wording.

**Owned by PB-22** (config: add a precision field alongside `date`) and **PB-23** (generator and templates render each precision appropriately).

### Planned date never activates anything (new, locked)

Entering a date does not start the event. **Reaching** that date does not start the event. Only a deliberate START EVENT on the event device begins the 48 hours. Planned timing exists for personalisation, planning, eventual grace logic and customer clarity. **Owned by PB-20.**

### Timing is amendable before activation (new) — *already satisfied*

Changing planned timing must regenerate deterministic defaults while preserving intentional overrides. **The existing contract already does this**: `copyFor` re-derives every blank slot on each call and lets a stored non-blank value win ([covers.js:110](../../covers.js:110)). So a date change automatically refreshes `dateLine`, `skyline2` and `barcode` unless the customer overrode them. No second generator, and no new mechanism. Recorded so nobody builds one.

### Unused paid entitlements (new, directional)

"Paid but unused forever" must not be the commercial contract, **and** no arbitrary short activation deadline may make advance planning awkward. A long-stop/grace mechanism may eventually attach to unused paid events. For the backend-free MVP: retain planned timing, do not over-engineer expiry, do not pretend client-side enforcement is secure, and **never start the 48 hours at purchase as a workaround**. **PB-04** must consider how cancellation wording interacts with this; **accounting treatment must not be invented in application code.**

### Setup Pass does not activate (new, locked)

`PAY → GENERATE SETUP PASS → IMPORT SETUP PASS` must **not** start the event. After import the event is paid and unused — `DRAFT` + paid. **Owned by PB-14 and PB-20.**

## A4.3 — Packet scope changes

| Packet | Change |
|---|---|
| **PB-22** | Adds the timing precision field. Event types become the seven-value list. |
| **PB-23** | Presets keyed by the seven types; **today's copy remains the Birthday preset and the default**, so Birthday output is unchanged. Must render all three timing precisions without fabricating precision or emitting placeholder text. |
| **PB-14** | Setup Pass confirmed as the V1 method. Must not activate on import. |
| **PB-18** | Its event-type list becomes the seven. |
| **PB-20** | Lifecycle stays three states; entitlement is a separate axis. Planned date is not a trigger. |
| **PB-04** | Additionally reconciles cancellation wording against unused paid entitlements. |

## A4.4 — Execution order confirmed

`PB-17 → PB-10 → PB-05 → PB-07 → PB-09 → PB-03` — unchanged and now authorised to proceed. **PB-17 starts immediately.**

## A4.5 — PB-01 is NOT actually unblocked

The direction states PB-01 is unblocked "by the Business contact decision below", but **the message ended mid-sentence at §26 and no contact address arrived.** PB-01 remains blocked on one input: the monitored email address. It will not be executed on a guessed or invented address.

Similarly **PB-04 can now be drafted** against the guidance above, but still needs Lizzie's sign-off and the cancellation classification before it can be marked done.

---

*Twenty-eight packets, all accepted. The engine is still not touched. `CAPABILITY_MATRIX` is widened exactly once, by exactly one packet, on the record.*
