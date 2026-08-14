# Reconciliation 003 — Product direction vs repository and programme

**Date:** 2026-08-11
**Status:** IN PROGRESS — written incrementally, one pass at a time, committed after each pass.
**Scope:** Reconcile the stated product direction ("tell us about your event, we'll build the photobooth") against the repository as it exists, the PB programme, the two landed packets, and existing pricing/payment/storage/trial/activation assumptions.
**Authority:** This document is diagnostic. It does **not** restart the programme, rewrite working functionality, or create a parallel roadmap. Amendments it recommends land in `IMPLEMENTATION-SPEC.md` only after Lizzie accepts them.

---

## Progress marker

**COMPLETE — all sections A–J written. Awaiting Lizzie's acceptance.**

| Section | Subject | State |
|---|---|---|
| A | Existing product capabilities | ✅ |
| B | Reusable architecture | ✅ |
| C | Current configuration model | ✅ |
| D | Product-generation feasibility | ✅ |
| E | Setup Pass feasibility | ✅ measured + schema proposed |
| F | 48-hour event model | ✅ |
| G | Owner mode vs guest mode | ✅ |
| H | Trial / payment reconciliation | ✅ |
| I | Magazine architecture | ✅ |
| J | Migration hazards | ✅ |

Nothing here is implemented. Recommended packet changes are specified in `IMPLEMENTATION-SPEC.md` Amendment 003 and are **not executable until accepted**.

---

## Headline of this pass

**The product direction is far closer to the existing code than it looks — because the "LUMEE BOOTH does the design work" mechanism is already built and shipping.**

`DEFAULTS` ([app.js:1-88](../../app.js:1)) is a flat, 75-field, fully-serialisable event configuration in which **blank means "generate it from the event title."** Strip copy, all 29 cover copy slots and all four Polaroid lines already auto-generate from `eventTitle`. The direction's core rule — *the customer provides very few inputs, LUMEE BOOTH does the design* — is the contract this file already implements.

What is missing is not the generation engine. It is the **thin resolver in front of it**: event type + name + date + Look → set `eventTitle`, `date`, `accent` and the five font roles. Everything downstream already cascades.

That reframes the work from "build a generator" to "build a preset layer over the generator that already exists."

---

## A. Existing product capabilities

### Already works — reuse untouched

| Capability | Where | Note |
|---|---|---|
| Three-photo capture with countdown, mirror, flash, prompts | `app.js` `beginSession`, `capturePhoto` [849](../../app.js:849), `startCamera` [795](../../app.js:795) | The successful flow. Protected. |
| Blank-means-generate copy contract | `DEFAULTS` [app.js:1](../../app.js:1); `Covers.copyFor` [covers.js:110](../../covers.js:110) | **This is the direction's engine, already shipping.** |
| Four magazine templates behind a registry | `TEMPLATES` [covers.js:21](../../covers.js:21), `RENDERERS` [covers.js:1433](../../covers.js:1433) | Catalogue expansion is cheap. See §I. |
| Editorial photo treatment | `FINISH` constants [covers.js:357-375](../../covers.js:357) | Separate pass from template drawing. **Do not reopen.** |
| Strip: 4 frames × 5 filters, pixel-pass grading | `Covers.applyGrade`, `FRAMES`/`FILTERS` [app.js:90](../../app.js:90) | Filters are a pixel pass, deliberately not `ctx.filter`. |
| Living Polaroid, H.264 + PNG fallback | `polaroid.js`, `mp4.js` | Protected. |
| Typography as five named roles | `fonts.js` | Device-resident faces only; canvas-drawn specimens. |
| Local gallery, IndexedDB | `saveSessionToGallery` [app.js:290](../../app.js:290) | Photos never leave the device. |
| Share/Save with iOS fallbacks | `app.js` share/save paths | Protected. |
| Offline PWA shell | `sw.js` | Network-first; entitlement responses excluded from Cache Storage. |
| Entitlement boundary | `product.js` | Prices structurally cannot grant capabilities. |

### Exists but needs adaptation

| Capability | Where | Gap against the direction |
|---|---|---|
| Event configuration | `DEFAULTS` + `settings` | Is a flat bag with no identity, no lifecycle, no versioning. Needs an `EventConfig` contract extracted around it — see §C. |
| "Example booth" preview | `applyExampleBoothSettings` [app.js:511](../../app.js:511) | Hardcodes `Rae's 26th Birthday`. This is the *shape* of generation, with one baked-in event instead of a resolver. |
| Accent colour | `settings.accent`, single hex | Direction wants **Event Looks** coordinating many surfaces. One colour is not a Look. See §16 of the brief. |
| Free tier identity | `DEFAULTS.eventTitle = "Your Celebration"` | PB-18 already owns replacing this with event-type identity. |
| Settings screen | 5-step setup, all fields exposed | Direction wants *constrained* post-generation editing, not the full surface first. |

### Genuinely missing

- **The resolver**: event type + name + date + Look → config. Nothing exists.
- **Event Look as a coordinated multi-surface concept** — only `accent` exists.
- **Event identity and lifecycle** — no event ID, no DRAFT/LIVE/ENDED, no activation. PB-20 owns this.
- **Setup Pass / device transfer** — nothing. PB-14 owns export/import but as a file, not a QR/link.
- **Multi-photo magazine layouts** — capture keeps all three photos, but no template consumes more than one.
- **Owner vs guest mode distinction** — see §G.

---

## B. Reusable architecture

**Reuse, do not replace.** Everything in the "already works" table above. Specifically:

- **The capture pipeline is the product's crown jewel and the direction depends on it** — clause 4 ("trial means using the real booth") is satisfied by *not touching* `startCamera`/`capturePhoto`/the countdown. The only sanctioned change is PB-09's `catch` branch.
- **`covers.js` is a renderer library, not a page.** It exports `TEMPLATES, RATIO, coverSize, derive, copyFor, copyKeys, render, placeholder, FONT` ([covers.js:1538](../../covers.js:1538)). `marketing.js` already drives it from outside the booth to render landing-page demos — proving the renderers are reusable headlessly. A generation preview can use the same route.
- **`product.js` stays the entitlement boundary.** The direction's trial/paid progression must express itself in `CAPABILITY_MATRIX` terms via PB-21, not in a parallel concept.
- **`sw.js`'s finite-shell rule** must survive: any new bundled theme/template asset joins `ASSETS` explicitly, and its contract test in `tests/integration-contract.test.js:193` updates with it. PB-06 proved that pair is load-bearing — a stale entry makes `cache.addAll` reject and breaks offline install entirely.

**Replace nothing.** No packet in this reconciliation proposes replacing a renderer, the capture flow, the storage layer or the entitlement module.

---

## C. Current configuration model

### What an event configuration *is* today

One flat object, `settings`, initialised from `DEFAULTS` ([app.js:1-88](../../app.js:1)).

Measured composition:

```
field count: 75
value types: 69 string, 1 number, 5 boolean
non-primitive fields: NONE — fully serialisable, no embedded assets
```

Field groups: event identity (2) · strip copy (4) · cover copy (29) · Polaroid lines + transition (5) · typography roles (5) · guest-facing screen text (22) · booth behaviour (`accent`, `countdown`, `mirror`, `prompts`, `shutter`, `flash`, `confetti`) (7).

### Where things live

| Concern | Location | Persists? |
|---|---|---|
| Event configuration | `settings`, key `mybishbashPhotoboothSettingsV1` [app.js:94](../../app.js:94), written by `persistSettings` [app.js:367](../../app.js:367) | ✅ localStorage |
| Guest photographs | IndexedDB `mybishbashPhotoboothGallery`, `sessions` store | ✅ IndexedDB |
| Edition counter | `mybishbashPhotoboothEditionSequenceV1` | ✅ localStorage |
| Verified access token | `mybishbashPhotoboothVerifiedAccessV1` | ✅ localStorage |
| **Business brand incl. `logoImage`** | `businessBrand` module variable [app.js:~166](../../app.js:166) | ❌ **not persisted anywhere** |
| Free user's draft settings | `temporarySettingsSnapshot` | ❌ ephemeral |
| Lifecycle / activation state | — | ❌ does not exist |

### How values reach the renderers

`settings` → `Covers.copyFor(settings)` derives cover copy (blank → generated from `eventTitle`) → `Covers.render()` applies the photo finish, then the selected template renderer draws. `fonts.js` resolves the five roles. Strip and Polaroid read `settings` directly. Nothing in the render path reads storage — it all flows from the in-memory `settings` object, which is why `marketing.js` can drive the same renderers with a literal object.

### Is there a clean `EventConfig` contract?

**Effectively yes, and it can be extracted without a rewrite.** `settings` is already the contract: flat, primitive-only, fully serialisable, consumed by every renderer, and with a documented blank-means-generate semantic.

What it lacks is not structure but **metadata**: no `schemaVersion`, no event identity, no lifecycle, no Look reference. Those are additive fields, not a restructuring.

Two hazards to record now:

1. **Photo data and event configuration are already cleanly separated** — photos live only in IndexedDB, configuration only in localStorage, and the two never mix. This is exactly the boundary clause 14 demands, and it is already true. **Preserve it.**
2. **`businessBrand.logoImage` is the only place a large asset could enter configuration, and it is currently not persisted at all.** Any future work that starts persisting it must keep it *out* of the Setup Pass payload, or reference it by ID. Recorded as a §J hazard.

---

## E-evidence — Setup Pass payload, measured

Recorded now because the measurement was cheap and it de-risks §E. Prose assessment still owed.

Realistic fully-populated event (Rae-style: title, date, accent, four strip fields, five font roles):

| Payload | Raw | deflateRaw | → base64url |
|---|---|---|---|
| Full defaults | 1,349 B | 471 B | — |
| Full populated config | 1,461 B | 544 B | **728 chars** |
| **Sparse — non-default fields only (11 fields)** | **310 B** | **198 B** | **264 chars** |

QR byte-mode capacity at error-correction level M: v10 (57×57) ≈ 271 chars · v15 ≈ 412 · v20 ≈ 666 · v25 ≈ 1003.

**Provisional conclusion: a self-contained V1 Setup Pass is comfortable, provided it carries the sparse diff rather than the full object.** 264 chars fits a **QR v10 (57×57)** — small, printable, reliably scannable by a phone camera. The full object needs ~v20 (97×97), still viable but denser and more failure-prone in poor light.

This is measured, not assumed. Compression earns its place: 310 → 198 bytes (36%) on the sparse payload, and the gap widens as customers fill in more fields.

---

## D. Product-generation feasibility

**Verdict: feasible, additively, with no rewrite — because the generator already exists.**

`derive(s)` ([covers.js:~95](../../covers.js:95)) already produces **all 28 cover copy slots deterministically** from `eventTitle` and `date`, using pure string functions (`firstName`, `eventAge`, `occasionWord`, `numberWords`, `ordinal`). No LLM, no API, no runtime dependency — exactly what the direction requires. `copyFor` then overlays any explicitly stored value, which is the blank-means-generate contract.

Two gaps, both narrow:

1. **The generated copy has exactly one voice, and it is birthday-flavoured.** `"Confidence is the best outfit"`, `"Not just an age. A whole vibe."`, `"Confidence · Beauty · Energy"`, `"ISSUE 26"`. A baby shower, graduation or wedding currently receives birthday copy with the noun swapped.
2. **Event type is inferred, not declared.** `occasionWord()` takes the **last word of the title** if it is 4+ letters, else `"CELEBRATION"`. So `"Rae's 26th Birthday"` → `BIRTHDAY` and `"Aisha & Tom's Wedding"` → `WEDDING`, but `"Sam's 30th"` → `CELEBRATION` and `"Baby Shower for Jo"` → `JO`. Asking event type explicitly, as the direction proposes, **replaces fragile inference with a declared value and is strictly better**.

### Smallest resolver layer required

Four additive changes. Do **not** implement yet.

| # | Change | Surface |
|---|---|---|
| 1 | Add two config fields: `eventType`, `look` | `DEFAULTS` (2 of 75 → 77) |
| 2 | `derive()` selects a copy preset table keyed by `eventType`; **today's table becomes the `birthday` preset and the default** | `covers.js` |
| 3 | `occasionWord()` returns the declared `eventType` when present, falling back to today's inference | `covers.js` |
| 4 | Resolver: `{type, name, date, look}` → writes `eventTitle`, `date`, `accent`, five font roles | `app.js` |

**The critical property of change 2: making today's table the `birthday` default means current output is preserved byte-for-byte.** No regression to the shipped booth, and no reopening of the photo treatment.

`applyExampleBoothSettings` ([app.js:511](../../app.js:511)) is already this resolver with one event hardcoded — it is the shape to generalise, not a thing to delete.

**Event Look** maps today onto `accent` (one hex) plus the five font roles. That is enough for a first Look implementation and honestly short of the direction's clause 16 ambition (landing, buttons, strip, magazine, Polaroid, background, share screen, QR poster). Recommend shipping Looks as `accent` + typography first, and widening the token set later — one visual choice already does real design work through the font roles.

---

## E. Setup Pass feasibility

Measurements in §E-evidence above. **A self-contained V1 Setup Pass is realistic and comfortable.**

**Recommendation: carry the sparse diff, deflate-raw compressed, base64url encoded, in a URL fragment.**

- **Sparse, not full.** 264 chars vs 728. Fits **QR v10 (57×57)** at error-correction M — small, printable, reliable under party lighting. The full object needs ~v20 (97×97).
- **Compression earns its place**: 310 → 198 bytes (36%) on the sparse payload, and the margin widens as customers fill fields.
- **URL fragment (`…/photobooth/#s=…`), not a query string.** Fragments are never transmitted to the server, so a local-first product's event configuration never lands in a server access log. That is a principled fit, not just a convenience.
- **Reference bundled content by ID, never embed it.** `eventType`, `look`, magazine `template` keys and the five font roles are all short identifiers resolving to bundled presets. Nothing design-related needs to travel as data.
- **Hard exclusions:** guest photographs (never), and `businessBrand.logoImage` — today the only route by which a large asset could enter configuration, and currently not persisted at all (§C).

### Proposed schema — specification only, do not implement

```
{
  "v": 1,                    // setupVersion — reject unknown majors, never silently coerce
  "t": "birthday",           // eventType id
  "l": "pink-purple",        // Event Look id
  "c": { … }                 // sparse diff vs DEFAULTS, config fields only
}
```

Compatibility risks worth stating rather than discovering: QR scanning is done by the **native camera app** on both iOS and Android, which hands off to the default browser — so the Setup Pass must work on first load with no service worker and no prior state. Long URLs are also truncated by some messaging clients when linkified; AirDrop and the native Share sheet do not have this problem, which is why the direction's own list of transfer routes is the right one.

**This is disposable MVP architecture.** Version it from the start; promise nobody that a Setup Pass works forever.

---

## F. The 48-hour event model

### There are two clocks and they must not be conflated

| Clock | What it is | Where it lives today | Starts on |
|---|---|---|---|
| **Entitlement validity** | "you own an event licence" | `accessTokenExpiresAt`, server-issued, server-verified ([app.js:1583-1594](../../app.js:1583)) | issuance |
| **Event live window** | "your event is running" | **does not exist** | deliberate activation |

The existing clock is **expiry-from-issuance** — a subscription shape. The direction needs **duration-from-activation** — a consumable shape, started locally on the event device, possibly offline. These are different clocks with different owners, and merging them is the single most likely architectural mistake available here.

### Smallest local state machine

`TRIAL → PURCHASED_UNUSED → LIVE → ENDED`

The existing model suggests no cleaner naming; `PURCHASED_UNUSED` is precisely the state clause 10 locks in, and it is the one with no representation today.

- **What starts the timer:** deliberate activation on the event device. Nothing else. Not payment, not import, not opening the booth, not a test photo.
- **Where the timestamp is stored:** a new localStorage key holding `activatedAt` (ISO) plus `setupVersion`. **Must not reuse `mybishbashPhotoboothVerifiedAccessV1`** — that key is the entitlement clock and mixing them destroys the distinction above.
- **After reload:** recompute remaining time from `activatedAt`. No ticking state is persisted, so a reload is free.
- **Offline:** works fully. Activation and the window are local. This matches the existing offline posture — `loadVerifiedAccess` already deliberately *"keep[s] the last server-verified offline grant until its expiry"* ([app.js:1614](../../app.js:1614)).
- **If local storage is cleared:** the event window is lost. Entitlement is recoverable through the restore flow; **the window is not.** This must be said plainly in the UX, not discovered at a party.
- **Clock tampering:** trivially defeated by changing the device clock. **Client-only enforcement is not secure and this document does not pretend otherwise.**

**Why that is acceptable for the MVP:** the fraud is self-harming — the person cheating is cheating themselves out of their own party, on a £19 product, on their own device. The attacker and the victim are the same person. **Why it is not acceptable permanently:** it cannot support refunds, disputes, multi-device events or the Business product. Clause 14's future backend is where this is fixed, and §J records what to avoid so that migration stays cheap.

### Accidental-activation safeguard

Smallest sensible: a **two-step confirm naming the consequence and the event** — "Start *Rae's 26th Birthday*? Your 48 hours begin now and cannot be paused." One deliberate confirm, no PIN, no account. Anything heavier punishes the 99% of owners who meant it.

---

## G. Owner mode vs guest mode

**A concrete contamination exists today.** The `welcome` screen — the booth's start screen, which guests face all night — contains `#openSettings`, labelled **"CUSTOMISE"** ([index.html:381](../../index.html:381)), directly alongside `#startBtn`. Any guest can open the owner's full configuration mid-party.

The existing surface model is already three-way and nearly right: `HISTORY_SURFACE = {PRODUCT, EVENT_HOME, BOOTH}` ([app.js:103](../../app.js:103)) → marketing / booth start screen / capture.

**Smallest clean distinction:** an owner-mode flag, not a new surface.

- When the event is **LIVE**, the `welcome` screen renders **only** the start affordance. `#openSettings` is not rendered.
- Owner access returns via a **deliberate, undiscoverable-by-accident gesture** — long-press or triple-tap the wordmark. No PIN, no account, consistent with "no accounts" (clause 19).
- **The capture flow is not touched at all.** `startCamera`, the countdown, `capturePhoto` and review stay exactly as they are — the direction's clause 4 depends on that flow being the trial, so the correct action is to leave it alone.

---

## H. Trial / payment reconciliation

**The headline is good news: the current implementation does not conflict with clause 10 — it already agrees with it.**

- `handleCheckoutReturn` grants nothing: *"The return is presentational only. Remove the Stripe session identifier from the address without treating it as entitlement evidence."* ([app.js:1577](../../app.js:1577))
- `CHECKOUT_POLICY.clientSuccessRedirectGrantsEntitlement: false` and `paidEntitlementAuthority: "verified_webhook"` ([product.js:154](../../product.js:154)).
- Access is granted only by `verifiedAccessRecord`, which requires a server-verified token with a future expiry ([app.js:1583](../../app.js:1583)).

**Nothing in the repository assumes payment activates usage.** Searched: no timer starts on checkout return, and there is no timer at all (§F). Clause 10 is therefore a *preservation* requirement, not a repair.

Two real conflicts with the direction's `BUILD → TRY → CUSTOMISE → BUY → SETUP PASS → START EVENT`:

1. **The current post-payment step is "request a restore link by email"** ([app.js:1570](../../app.js:1570)) — a friction point the direction never mentions and which does not fit "pay, then get a Setup Pass". The Setup Pass is a *better* answer to the same problem (getting entitlement onto the event device) and may be able to replace the email restore for the consumer path. Not a decision to take here.
2. **The current entry point is the marketing landing page with a pricing section**, not `BUILD MY PHOTOBOOTH`. That is a UI change, not an architectural one.

**No parallel checkout flow should be created.** PB-02 already makes the existing checkout inert behind a single flag, so the direction can be built in front of a checkout that is switched off, and switched back on by PB-16.

**Pricing is not touched here.** PB-11 owns it.

---

## I. Magazine architecture

**Evolving into a catalogue is architecturally cheap. The hard part is not the registry — it is per-template schemas.**

### Already present

- **Template registry**: `TEMPLATES` metadata `[{key,label,hint}]` ([covers.js:21](../../covers.js:21)) and `RENDERERS = {keepsake, editorial, noir, press}` ([covers.js:1433](../../covers.js:1433)), both exported ([covers.js:1538](../../covers.js:1538)). Adding a template is: one metadata entry, one `tplX` function, one `RENDERERS` key.
- **Safe areas already exist.** `fitTracked` and `fitBlock` shrink type until it fits both a width and a `maxLines` budget, with a `minSize` floor. So arbitrary guest-supplied text cannot break a layout — it can only get small. Per-template character limits are therefore a **UX quality guard, not a correctness requirement**.
- **Photo treatment is a separate pass.** The `FINISH` constants ([covers.js:357-375](../../covers.js:357)) are applied to the photo rectangle before scrims, typography, rules and barcode are drawn. **The direction's required split between PHOTO TREATMENT and EDITORIAL DESIGN LAYER already exists structurally — which is exactly why the design layer can be upgraded without reopening the grain, matte, sharpening or vignette work.**

### Genuinely missing

**Per-template field schemas.** `COPY_KEYS` is one global list of 28 slots shared by all four templates ([covers.js:108](../../covers.js:108)), and Admin exposes all of them regardless of which template uses which. The direction requires each template to own its available fields, limits, typography, positions and hierarchy. That is the real work, and it is a change to the *contract* between config and renderer — so it must be made backwards compatible with configs already saved under the global keys.

### Multi-photo templates (clause 7)

**Straightforward.** `render(ctx, opts)` takes a single `opts.img` ([covers.js:1497](../../covers.js:1497)), while `app.js` already holds all three captures in `photos[]` for the whole session. The data is present; only the renderer contract needs widening — optional `opts.img2` / `opts.img3` that templates may ignore. Template-specific by construction, as the direction requires.

---

## J. Migration hazards

Recorded so the future-backend migration (clause 14) stays cheap.

1. **Photos and configuration are already cleanly separated** — photos only in IndexedDB, configuration only in localStorage, never mixed. This is exactly clause 14's hard boundary and it is already true. **The main hazard is losing it**, not achieving it.
2. **No event identity exists.** Nothing today has an event ID. Clause 14's backend needs one, and **retrofitting an ID after Setup Passes are in the wild is materially harder than adding it now**. Recommend the first packet that touches configuration also adds a generated event ID — cheap now, expensive later. This is the one sequencing insight in this section.
3. **Two clocks (§F).** Reusing `accessTokenExpiresAt` for the event window would collapse the entitlement/activation distinction and make clause 10 unimplementable.
4. **`businessBrand.logoImage`** is the only route for a large asset into configuration, and is currently not persisted at all. Keep it out of the Setup Pass; reference by ID if it is ever persisted.
5. **`sw.js` `ASSETS` is a finite list with a contract test** (`tests/integration-contract.test.js:193`). Any bundled Look or template asset must update both. PB-06 proved this pair is load-bearing — a stale entry makes `cache.addAll` reject and breaks offline install entirely.
6. **`COPY_KEYS` is global.** Per-template schemas (§I) must not orphan values in configs already saved under the shared keys.
7. **Origin-scoped storage** (audit F-09): the migration to `mybishbash.app` strands local state. **The Setup Pass is incidentally a solution to this** — it is a portable configuration payload, which is what PB-14 was specified to produce. The two should be built as one mechanism, not two.
8. **Client-only entitlement is not secure** and cannot support refunds, disputes or multi-device events. Acceptable for a £19 self-harming-fraud MVP; not a permanent answer.

---

## Programme impact

**The existing packet programme still leads to the right product. It does not need restarting.** The direction is largely *additive* to it, and two packets change meaning rather than content.

Recommended amendments are specified in `IMPLEMENTATION-SPEC.md` **Amendment 003**, which this document authorises but does not itself contain.

Headline: the previously proposed order `PB-17 → PB-10 → PB-05 → PB-07 → PB-09 → PB-03` **survives reconciliation unchanged**. Every packet in it is either a live-defect fix or a marketing-surface fix, and none of them touches configuration, lifecycle, pricing or the capture flow. The direction changes what comes *after* that run, not the run itself.
