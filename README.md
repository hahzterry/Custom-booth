# MyBishBash Photobooth

MyBishBash is a personalised photobooth experience for a real event. A host
creates the event identity and vibe before the party, opens its event entrance
on a suitable phone or tablet, and deliberately starts the event. Guests then
take three photographs once, use all three for a Photo Strip or Moving Polaroid,
pick their favourite for a Magazine Cover, and save or share what they make. The
public funnel, booth and Business surface all live in this standalone repository.

The implementation remains local-first and uses one shared three-photo session.
The established Strip consumes all three, Magazine consumes the guest's chosen
favourite, and the Moving Polaroid animates the same three real captures inside
one instant-film print. Magazine's established renderer and editorial finish
remain unchanged.

Productisation was baselined before editing at `main` commit
`e6313f8d8115164e9e8ecdbfaaa131fd6c3bc41a`. The current pass deliberately
evolves capture, Strip geometry and Moving Polaroid while preserving the
Magazine finish, local IndexedDB gallery, native sharing fallbacks and
service-worker offline flow.

## Planning documents (authoritative)

Product direction for this repository is governed by three documents. Where this
README and those documents disagree about what *should* happen next, they win;
this README remains the description of how the product *works*.

- **[docs/product/AUDIT-2026-08-09.md](docs/product/AUDIT-2026-08-09.md)** — white-box
  audit of the live product and this repository. Diagnostic only. Accepted in full
  on 2026-08-09.
- **[docs/product/IMPLEMENTATION-SPEC.md](docs/product/IMPLEMENTATION-SPEC.md)** — the
  accepted findings, amendments and numbered work packets. This is the binding
  plan unless a later consolidated owner instruction explicitly supersedes it.
- **[WORK.md](WORK.md)** — execution state: what has landed, what is next, owed
  manual verifications, inputs needed, and the decision log.

**Execution rules.** Follow the accepted order in `WORK.md`, except where a later
consolidated owner instruction expressly changes the scope. There is no build
step, so every commit must remain deployable. Run the complete browser and Worker
checks before shipping.

**Protected assets.** Earlier packets treated the complete rendering/capture engine
as frozen. The accepted output-upgrade pass expressly reopened the canonical Strip
and Moving Polaroid capture paths. The Magazine renderer, its adaptive editorial
finish, local-first photo boundary, storage migrations and cancellation protections
remain protected from incidental rewrites.

Work packages in this repository use the **`PB`** prefix, registered in the portfolio
prefix registry. A session seeing a foreign prefix here should stop and ask.

## Product surfaces

- `/` is the Personal landing page. Its short first-visit entrance demonstrates
  the event-arrival idea; **Start Photobooth** opens the real free three-photo
  capture with no login, checkout or email gate.
- `/business` is the separate For Business surface. `vercel.json` rewrites the
  static route back to `index.html`, where the client selects the surface.
- Host setup creates a small personalised event entrance and configures event
  identity, one of four curated vibes, optional Guest PIN and output defaults. Advanced controls stay
  in host mode and do not appear in the normal live guest flow.
- Customisation is preview-first: Event Home shares the production entrance
  treatment, while Photo Strip, Magazine and Moving Polaroid use the production
  renderers in a large live workspace. A host can keep the built-in
  sample or choose up to three device-local design photos; those photos remain
  in memory only and never become Event Gallery sessions.
- **Test real camera** runs the normal shared three-photo capture and Review loop
  in an explicit host-test context. Test captures never write to IndexedDB, advance
  the Magazine edition sequence, change entitlement or activate the event. Retake
  stays in that context, and Back to Event Setup restores the same host screen and
  in-progress form. Only **Start Event** begins the 48-hour period.
- The homepage product examples are produced by the real Strip, Magazine and
  Polaroid renderers. `assets/demo-photos.jpg` supplies only three ordinary
  input photographs; it is not a set of pre-baked product outputs.

## Product access and attribution

`product.js` is the single entitlement and capability boundary. Application
behaviour derives from `FREE`, `ONE_EVENT`, the retained annual identifier
`PERSONAL_12_MONTH`, legacy restore entitlements or `BUSINESS`; prices never act
as feature flags.

- Free guests get the full capture, creation, Share and Save experience. Every
  exported Strip PNG, Magazine PNG, Moving Polaroid still and Moving Polaroid video
  carries a designed-in `MYBISHBASH PHOTOBOOTH` attribution.
- One Party access enables one personalised EventConfig lifecycle and uses the
  quieter `POWERED BY MYBISHBASH PHOTOBOOTH` attribution. It does not grant
  logo upload or white-labelling.
- Business access can add validated brand assets and event-level collection,
  consent and sharing controls. Guest-photo collection is off by default and
  is eligible only when both the event setting and the attendee's explicit
  publicity/photo-use permission are present.

Attribution is rendered into the assets, not placed above them in HTML: Strip
uses its reserved footer; Magazine draws after the selected real template; and
Polaroid draws on the stationary print chrome shared by the still and every
video frame.

The locked catalogue is Free £0, One Party $44 and Annual $377. Founding Lifetime
and the old six-month plan are retired from sale, while their identifiers and
recovery compatibility are retained. Checkout and the recovery service remain
gated; these amounts describe the intended products and do not make a purchase
possible.

A personalised event stays DRAFT while the host edits, previews or transfers it.
Only an explicit **Start Event** action begins its 48-hour LIVE period; purchase,
the planned date and Setup Pass import do not. Reaching ENDED stops new
personalised capture but never removes already-created gallery records. One Party
is scoped to that event lifecycle, not to a photo or guest-session count.

EventConfig schema 3 stores one curated `themeId` plus canonical flat roles for
colour, background, foreground, buttons, borders, decoration, typography and
the existing renderer defaults defined in `event.js`. Version 1 `look`/`accent`
and version 2 palette settings migrate to the closest curated theme and are then
removed, so Event Home and every output resolve their visual treatment from one
source. The role-shaped boundary leaves a clean extension point for later
validated custom colours without exposing that option today.

## Local-first data and migration

Free and Personal photographs remain on the device. New settings and gallery
data use MyBishBash-neutral storage names. On a device with the earlier live
build, settings and readable gallery records are copied forward from
the `raePhotoBoothLiveSettings` / `raePhotoBoothGallery` stores while the
original data is deliberately left intact.

An optional **Setup Pass** copies sparse event configuration in a versioned URL
fragment. URL fragments are not sent to the hosting server. A Setup Pass carries
no photographs, logo, payment entitlement or event clock, and importing it always
produces a DRAFT event. It is device setup information, not a durable guest-facing
event link or a cloud backup. There is currently no backend that stores or retrieves
a Personal event by public link.

The optional four-digit **Guest PIN** is a lightweight local gate. Only a salted
SHA-256 verifier is persisted and attempts are briefly throttled, but verification
is performed on the event device rather than a server. It must not be described as
secure password protection, and the Setup Pass should be treated as private setup
information.

The optional server boundary lives under `worker/`: Cloudflare Workers for the
API, D1 for customers, purchases, entitlements, Business events and versioned
consent decisions, and R2 only for validated Business brand assets or
explicitly enabled, permission-backed Business output collection. Stripe
Checkout grants nothing on its return URL; only a verified webhook can create
or update an entitlement. See `worker/README.md` for the API and setup.

The browser calls `/v1` on the same origin by default. A deployment can proxy
that path to the Worker, or set the `photobooth-api-base` meta value in
`index.html` to the Worker origin after configuring its CORS allowlist. No
production credentials are included in this repository.

The checked-in Worker still speaks the retired catalogue and does not yet bind
`ONE_EVENT` to EventConfig lifecycle. That is an intentional release gate: keep
`BILLING_LIVE` off until the Worker schema, Stripe products, restore path and
event binding have been migrated to $44 / $377 and verified together.

## Guest flow
Event entrance → take three photos → choose what to make → Save / Share → Next Guest.

- **Photo Strip:** all three photographs in the host's selected treatment.
- **Moving Polaroid:** all three photographs animated through one instant-film print.
- **Magazine Cover:** the guest's favourite of the three through the host's selected real cover.

Next Guest starts a clean three-photo session immediately. Retake replaces the
current guest's three source photographs without consuming another local edition;
Event Home returns to the personalised entrance. Temporary capture, video and
render state is cleared between guests.

## Strip
Host-selectable treatments currently include:
- White
- Black
- Editorial
- Film

Strip finishes currently include:
- Original
- B&W
- Vintage
- Warm
- Glow

Frame and filter are separate systems. **Both apply to the strip only** — filters
are not carried over to magazine covers, which have their own finish. In a live
personalised event these are host defaults, not guest editing controls.

The canonical Strip is one 600 × 1800 renderer shared by preview, Save and Share:
three equal print-style apertures, narrow separators, slim outer border and one
controlled footer. White and black use identical photo geometry. Event copy and a
strictly contained future Business logo belong only in the footer; photographs
remain the dominant surface.

Filters are applied as a pixel pass, not with `ctx.filter` — see **Grading**. On an older booth iPad the `ctx.filter` version silently did nothing at all.

## Magazine
Four cover styles, each laid out separately for portrait and landscape sessions:
- **Keepsake** (default) — the party cover: framed, didone masthead over condensed stacked lines, left rail of event detail, script + condensed hero line, hearts and an icon strip. Each guest gets their own **numbered edition** ("EDITION 14 OF 63") counted from the booth's local gallery; set the expected headcount in Admin.
- **Editorial** — full-bleed high-fashion cover: oversized didone masthead, three feature columns, huge cover line bottom-right.
- **Noir** — deep tonal drama, centred masthead and cover line. It retains the photograph's original hues.
- **Press** — solid sidebar carrying the masthead, accent issue chip, name and standfirst on the photo.

Magazine receives the shared session's three photographs. The host selects the
event's default cover before going live; the guest picks their favourite source
photograph and receives the finished cover without entering a freeform editor.

**Editorial finish.** Every magazine cover — all four styles — puts the same deterministic, adaptive luxury-print pass on the photograph. It samples the untouched capture before making a bounded midtone exposure and colour-cast correction, then applies a gentle S-curve, soft highlight shoulder, protected shadow density, clean whites and an almost imperceptible matte floor. The analysis keys exposure from the median and upper midtones instead of applying one fixed brightness value. Dark venues receive a lift; bright, complex scenes receive a restrained reduction; flat pale scenes are specifically protected from being made unnecessarily dark.

White balance listens primarily to genuinely low-chroma surfaces. A strongly yellow or blue room may contribute a deliberately quiet 25% fallback vote only when reliable neutral evidence is absent. Ambiguous equal-gap orange — which could be tungsten light, complexion or brown fabric — gets a separate 10% fallback. Both room votes fade continuously to zero as neutral support reaches 1% of analysed samples, so a coloured wall cannot rotate a valid grey surface. Correction is bounded to ±6.5% per channel and continuously reduced on coloured pixels; protection rises again for highly saturated clothing. Warm-pigment protection is also a continuous confidence rather than an on/off colour class, so adjacent skin or wall pixels cannot split into different colour treatments. There is no separate selective wall/clothing recolouring pass. Colour gets +8 vibrance and −6% global saturation; deep-shadow chroma remains at least 86% before that global colour shaping. Template character remains tonal, so clothing hue is not deliberately changed between styles.

Definition is luminance-only: very light shadow noise reduction, two restrained local-contrast scales, micro-contrast and two edge-masked detail stages around one deterministic 2.5% fine monochrome grain pass. A separate sub-one-code monochrome paper tooth is visible only in close comparison. Noise reduction and micro-contrast occupy different frequency bands, so real skin texture is retained rather than smoothed away and replaced with grain. Broad local contrast is limited to five output code values. A Sobel edge-flow guard limits coherent contours to two additional code values while allowing four only at non-edge texture extrema, preventing HDR outlines while making eyes, hair and fabric visibly clearer.

The signature vignette is part of this single house finish: the central 70% is untouched, side-centres receive only about one quarter of the already-low fall-off, and 7.5–9.5% is reached only at the extreme corners. The ellipse is heavily feathered and protects dark tones. It does not create a brighter subject zone or paint light onto the person. No face detection or reconstruction, skin smoothing, background isolation or blur, relighting, bloom, glow or flare is used. The original camera capture is never overwritten; the finish exists only inside the transient cover canvas.

It runs on the photo rectangle only, before the existing cover scrims, typography, rules and barcode are drawn. Template tone stays in the floating-point recovery pass through tone/colour staging, so white clothing and bright venue detail are not clipped before the shoulder can recover them. Luminance detail then remains twelve-bit until the final detail write. Each output channel stays inside a print-safe 2.5–253 range.

### Exact editorial finish parameters

| Stage | Implemented values |
|---|---|
| Analysis | Up to 50,000 regular samples; scene key `max(median, p75 − 0.17)`; tonal span `median − p10` |
| Exposure | Target midtone `0.45`; adaptation `0.24`; hard range `−0.20…+0.20 EV`; negative correction on low-span scenes reduced to `30–100%` |
| Adaptive density | Gamma `1.00…1.20`, gated by median `0.20…0.38` and span `0.12…0.28`; shadow gamma `1.00…1.25` below pivot `0.22`; identical tonal curve at every image position — no radial subject brightening |
| White balance | Deadband `0.035`; full-cast point `0.10`; strength `0.95`; channel-gain ceiling `0.935…1.065`; yellow/blue tail authority `25%`; ambiguous warm/orange tail authority `10%`; both fade to zero over core support `0.002…0.010` of analysed samples; near-neutral chroma roll-off `0.025…0.10`; directional-tail chroma enters `0.06…0.14` and exits `0.35…0.50`; yellow/blue direction slopes `1.08 / 0.75` |
| Continuous colour protection | Coloured-pixel gate `0.055…0.18`; generic protection `0.40`, rising to `0.92` over chroma `0.18…0.45`; warm R/G/B protection `0.92 / 0.28 / 0.25`; warm ordering margins `−0.03…+0.03` and pigment margin `−0.06…+0.06` at R−G : G−B slope `0.85`; no cast-aligned selective desaturation |
| Tone curve | S-curve `0.065`; deep-shadow lift `0.006`; highlight shoulder `0.035` from `0.56`, peaking at `0.80` and rolling out by `0.985`; black density `0.018`; white clean-up `0.022`; matte floor `0.0035` |
| Colour | Density-following chroma floor `0.30` and cap `1.04`; saturation `0.94`; vibrance `0.08`; deep-shadow chroma floor `0.86`; no skin/clothing-specific chroma boost |
| Noise/detail | Luminance NR `0.010…0.022`; clarity `0.22`; broad structure `0.15`; micro-contrast `0.10`; pre-sharpen `2.00`; final sharpen `0.80`; texture gate `0.004…0.018`; edge gate `0.010…0.032`; strong-edge suppression `0.95` |
| Detail guards | Broad move cap `±5/255`; broad extrema radius `8 px`; Sobel strength gate `0.008…0.030` and edge-flow gate `0.35…0.55`; local 3 × 3 allowance `2/255` on coherent edges and up to `4/255` on irregular texture; smooth-plane protection `0.35` clarity / `0.65` structure |
| Texture | Seeded monochrome grain `0.025` with range `0.68`; seeded paper tooth `0.0015`; both modulated gently by luminance |
| Vignette | Scene-adaptive corner strength `0.075…0.095`; elliptical squared-radius feather `0.25…1.00`; centre at `(0.50, 0.50)`; side-centre mask `0.259`; shadow weighting `0.52…1.00` |
| Existing template tone | Editorial `contrast 1.04 / brightness 1.01`; Noir `contrast 1.07 / brightness 0.985`; Keepsake `contrast 1.05 / brightness 0.99`; Press `contrast 1.04`; folded into the float pass without a separate clamp |
| Output | High-quality cover resize; monotonic 4096-step tone LUT; gamut-safe chroma reconstruction; final range `2.5/255…253/255` |

The finish is automatic and is the **only** grade a cover photo gets beyond its template's own. The guest's filter choice is deliberately switched off for magazine — a cover has one house look, so every cover from the booth matches whatever the guest was playing with on their strip. Strips keep their selected filters and are unaffected by the finish.

Cover copy lives in one set of slots shared by all four styles (`covers.js`). Every slot is editable in Admin; **leaving a slot blank generates it from the event title** — masthead, age in words, issue lines, script line and barcode all follow "Rae's 26th Birthday" / "Sam's 30th" / "Aisha & Tom's Wedding" without any admin work.

Legibility is measured, not assumed: the renderer samples the finished photo beneath each cover zone and adjusts the existing scrim where required, so typography remains readable over varied captures.

## Grading
Every colour adjustment in the booth — the five strip filters, each cover
template's tone and the editorial finish — is a **pixel pass**. Nothing uses
`ctx.filter`.

That is not a preference. `CanvasRenderingContext2D.filter` only shipped in
Safari 17 and fails *silently* before it: on an older iPad the filter buttons
did nothing and no cover got its template tone —
while the pixel-based editorial finish carried on working, which is exactly
why the magazine looked right and the filters looked broken.

`Covers.applyGrade(ctx, x, y, w, h, spec)` reads the same CSS-filter syntax the
code already used, so the recipes did not change. brightness, contrast,
saturate, grayscale and sepia are each affine in sRGB, so each compiles to a
3x3 matrix and an offset. Strip filters are applied **in sequence**, including
CSS's between-step clamp, so they remain within 2/255 of `ctx.filter` on
browsers that support it. Magazine template tone instead folds into the
adaptive tone/colour pass as one floating-point transform before its staging
write; otherwise highlight recovery would be asked to recover pixels already
discarded by the template. The later luminance-detail pass keeps twelve-bit
working luma until its final output write.

`grayscale(g)` is exactly `saturate(1-g)`, so one matrix serves both.

## Typography
Five roles, set in Admin, driving every keepsake:

| Role | Drives |
|---|---|
| Headlines | Cover mastheads and the strip's title |
| Small caps | Cover detail lines, dates, footers |
| Condensed | Stacked cover lines and cover lines |
| Script | The strip signature and cover script |
| Handwriting | The Moving Polaroid's felt tip |

`fonts.js` is the only place a typeface is written down. Before it, covers.js,
app.js and polaroid.js each carried their own stacks and changing a face meant
editing three files and hoping.

**Only faces that ship with iOS and macOS are offered.** The booth runs from a
service-worker cache on an iPad with no guarantee of signal, so a web font is
not a font — it is a request that might not arrive.

**Specimens are drawn on canvas, using your own event wording.** Canvas
resolves a font stack differently from the DOM and lays type out differently,
so an HTML preview would be a promise the covers might not keep; and a face
that carries "RAE" beautifully can fall apart on "Aisha & Tom's Wedding".
Hearts are stripped from the handwriting specimen because the print draws them
as paths — showing the font's own glyph would be the one thing on that page
that is not what a guest gets.

**Faces missing from the device are detected and marked**, rather than
silently falling back to something that looks nothing like the specimen. The
laptop the settings were tuned on and the booth iPad are not the same machine,
so check the specimens on the iPad before the night.

## Moving Polaroid
A distinct keepsake next to Strip and Magazine: one instant-film object that
moves through the session's three photographs. Each image settles long enough
to read before the next transition, and the loop begins and ends inside the same
photo-one hold.

**The print.** Real Polaroid 600 geometry — a nearly square image area with
equal borders on the sides and top. Warm white paper with a gradient and fine
grain, small corner radius, soft drop shadow. Because the photo window is
near-square, a wide group shot is cropped in from the sides; that is the
format, and it is why the Polaroid supplements the strip rather than replacing
it.

One deliberate departure from the film: **the bottom border is deepened** from
the true 0.289 of print width to 0.40. On real film that space is empty and
reads as a margin; here it is carrying four lines of handwriting, and at the
true depth the writing fills it wall to wall and stops looking written on. The
photo, the sides and the top stay exactly to the film. Type is sized off the
print's *width* for the same reason — pinning it to the height would make the
writing grow every time the border deepens.

**The handwriting.** Four lines under the photograph, in whichever face is set
for the Handwriting role (default `Marker Felt`). A felt tip laid on paper does
two things a font does not: it puts down a stroke much heavier than any digital
handwriting face draws, and the ink creeps into the paper fibres around it. So
each line is drawn three times — a wide, very faint bleed, then the widened
outline, then the fill. Without the bleed the letters look stamped; without the
widening they look like a font pretending.

Hearts are drawn as paths, not typed: no handwriting face carries ♡, so the
glyph falls back to a symbol font at half the weight of the letters beside it.
They are stroked at the marker's own **stem** width rather than the outline
width used to fatten the glyphs — a felt tip cannot draw a hairline next to
letters that heavy, and a delicate heart beside them is the giveaway.

Each line gets a tiny tilt and offset derived from a hash of its own text —
deterministic, so the animated preview and the exported file agree, and so
consecutive video frames do not shimmer.

**The motion.** The canonical compositor builds one finished plate from each of
the three captured photographs, then moves between them inside stationary instant
film. Each photograph holds long enough to read, transitions remain restrained,
and the loop seam falls inside an identical hold on photo one so iOS cannot expose
an obvious hitch. The paper, shadow, handwriting and event identity are therefore
identical in the preview and every exported frame.

**Exports.** Save and Share prefer the locally encoded H.264/MP4 where the
browser's video encoder is available. **Still photo** creates a deterministic PNG
from photo one, matching the loop seam. If video encoding is unavailable, the
finished Polaroid still remains available and the UI says so. No format or codec
terminology is shown to guests.

**The photograph** keeps the Moving Polaroid's existing lightweight fixed
print pass. The new adaptive finish is deliberately magazine-only, so this
cover change cannot alter Polaroid video plates. There is no
beautifying, relighting, glow or bloom. The fixed pass runs once per photo
rather than once per frame: it is a pass on the photograph, not on the film.

The separate `motion.js` / `composeLive()` real-camera recorder remains tested as
dormant groundwork. It is not wired into the current shared guest flow, which is
deliberately based on the same three photographs as Strip and Magazine.

## Admin
Live previews (using the real cover renderer with a stand-in photo):
- Strip
- Keepsake
- Editorial
- Noir
- Press
- Moving Polaroid (instant film has one shape, so this one ignores the orientation tabs)
- Landscape
- Portrait

**Every word a guest can see is editable.** Five groups of fields:
- *Magazine Cover* / *Keepsake Cover* — all copy printed on the covers, including the badge's own "edition" / "of" wording.
- *Strip* — the controlled footer identity and the host's selected treatment.
- *Typography* — the five font roles, each a grid of canvas-drawn specimens in your own event wording, with anything missing from the device marked.
- *Moving Polaroid* — handwritten event copy and the status lines shown while
  motion is prepared, ready, or unavailable.
- *Screen Text* — welcome eyebrow, start button and hint, cancel, shot counter (`{n}` / `{total}`), camera prompts (comma-separated, one per shot), the Strip/Magazine/Polaroid tabs, every control label, Share / Save / Next guest / Retake, and the end-screen wording.

The contract is the same everywhere: **leave a field blank and you get the default**, which the field shows in grey as its placeholder. Defaults are written to be good enough to run the night untouched; the fields are there for when something needs amending.

## Behaviour
- The booth engine does not depend on a backend.
- Free and Personal sessions never upload photographs.
- Business photo collection remains off unless the event enables it and the
  attendee grants the separately recorded photo-use permission.
- Full-frame camera preview with a restrained crop guide for the shared
  three-photo session.
- Session orientation is locked for the three captures.
- Public capture and results expose **Home**, which stops all in-flight camera,
  render and timeout work before returning to the public landing page.
- A personalised event exposes **Event Home**, returning to its Tap to Begin
  welcome screen without leaving event mode.
- Browser Back follows the same context-aware path; transient camera/results
  states are never resumed from history.
- Next Guest starts a clean three-photo session and never opens marketing.
- Retake replaces the current guest's three captures.
- Soft confetti follows a completed capture.
- Two-minute review timeout.
- Share uses the iOS Share sheet where supported.
- Save exports the current high-resolution output. Moving Polaroid prefers the
  on-device MP4 and also offers its deterministic still PNG.

## Vercel deployment
This is a plain static site.

Running or testing the repository locally does not publish it. Deployment remains
a separate explicit production action; this documentation pass performs none.

1. Create or link the standalone Photobooth Vercel project.
2. Deploy the folder containing `index.html`.
3. Framework preset: Other / static.
4. No build command.
5. No output directory.

Use HTTPS so Safari can access the camera.


## Session and gallery behaviour

- A new live session stores three still photographs once and exposes the complete
  output choice from that shared source set.
- Finished still-source records are stored locally in IndexedDB. Capacity is
  storage-aware rather than a commercial session limit; the operator is warned
  when the browser is running short of space.
- Moving Polaroid video is rebuilt locally from the saved three-photo source set;
  the gallery does not need to retain a separate video recording.
- Legacy and earlier experience-specific records remain readable without
  pretending a one-photo record contains three sources.
- Nothing in a Free or Personal gallery is uploaded to a backend. Clear Event
  Gallery removes the locally stored records from that browser.


## Premium magazine architecture
- Shared capture supplies Magazine with the guest's favourite of three source
  photographs; the renderer and its photograph treatment remain unchanged.
- All four covers share one non-destructive photograph pipeline.
- The original guest capture remains unchanged in memory and IndexedDB; only the exported cover canvas is finished.
- Design remains typography, rules, barcode and graphic layers over that transient photograph render.
- All host wording remains editable.
- Text auto-fits its semantic zone.


## Editorial cover engine
- Cover rendering moved to `covers.js`: four templates over one copy model.
- Portrait covers are 1200 × 1680, landscape 1680 × 1200 (A4-adjacent magazine trim, not the old 4:3 / 3:4).
- Layout is measured from the canvas — masthead, columns and cover line re-flow rather than collide when copy is long.
- Template tone and the adaptive **editorial finish** now share one float pipeline, preserving highlight headroom until final output.
- Grain is consolidated into one deterministic 2.5% monochrome pass; the old second 4–6% template grain is gone.
- Noir retains original clothing hues; its mood comes from tonal density, typography and its existing adaptive scrims, while the canonical finish supplies the same soft edge fall-off as every other cover.
- Cover copy auto-generates from the event title; old Birthday/Fashion copy is migrated on load where it was customised.
- The cover engine remains isolated from Strip and Moving Polaroid rendering.

## Video encoding

`mp4.js` is the deterministic on-device H.264 writer for the active three-photo
Polaroid compositor. It probes WebCodecs and Safari's MP4 MediaRecorder path,
yields between frames with `MessageChannel`, and checks an abort token for every
frame. The dormant `motion.js` canvas recorder still probes MP4/H.264 and WebM
without inferring support from a browser name, but it is not part of the current
shared guest flow. Camera permission, video encoding, native Share acceptance and
download behaviour must be verified over HTTPS on the actual iPhone/iPad intended
for an event.

## Service worker
The current cache is the MyBishBash product shell. Its finite legacy list knows
about the previously shipped Rae booth caches, deletes only those application
caches during upgrade, and leaves local settings and IndexedDB gallery data
alone. Deploy a service-worker migration between booth sessions: an in-flight
camera capture is intentionally not persisted.

`sw.js` is **network first, cache as offline fallback**. Its network requests
explicitly bypass the browser HTTP cache, successful responses are fully written
before the worker can be suspended, and `index.html` is used only for an offline
page navigation — never as a fake response for a missing script or stylesheet.

`app.js` registers with `updateViaCache: "none"` and checks again when the PWA
comes online or returns to the foreground. After the v7 migration, a future
worker update reloads immediately on the welcome screen or waits until the next
between-guests boundary if a session is active.

When the app shell or its asset list changes, update `ASSETS` and bump `CACHE` in
`sw.js`. Before the event, open the installed booth once with a signal and let
the migration reload finish; it will then keep the current build available
offline.

## Verification

The repository stays build-free. Run the static product contract suite with:

```sh
node --test tests/*.test.js
```

The committed browser flow covers host customisation, own-photo preview, the
fake-camera three-photo test loop, output switching, Retake, safe exit and separate
event activation at phone portrait, iPad portrait and iPad landscape sizes:

```sh
npm install
npm run test:e2e
```

The Cloudflare boundary has its own TypeScript and policy tests:

```sh
cd worker
npm test
npm run typecheck
```

Camera permission, native iOS Share sheet behaviour and both encoder paths
still need a final pass on the target iPhone/iPad over HTTPS before an event.
