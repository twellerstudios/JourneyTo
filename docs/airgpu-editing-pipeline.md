# Journey To — Cloud Edit Bay: Real Costs and the 2026 Tool Landscape

You already pay for Creative Cloud and Claude Code, so neither appears as a
cost below. This is what the *rest* of it costs, what tools exist right now,
and what I'd actually pick.

---

## Part 1 — What airgpu actually costs

The whole bill is two things added together:

> **Monthly bill = storage + (hours used × hourly rate)**

Storage is charged **every month whether the machine is on or off**. The
hours are only charged while it runs.

### Storage — the part you can't avoid

| Storage | Per month |
|---|---|
| 100 GB (the minimum — you cannot go lower) | **$7.00** |
| 200 GB | $14.00 |
| 300 GB | $21.00 |
| 500 GB | $35.00 |

$3.50 per 50 GB. Windows plus Premiere plus your presets eats roughly
60–70 GB, so 100 GB is the floor and leaves only ~30 GB of working room.
For 4K you'll want 250–300 GB.

### Machines — the hourly part

| Machine | Power | Per hour |
|---|---|---|
| Quadro RTX 4000 · 8 CPU · 16 GB RAM | Fine for 1080p | **$0.65** |
| Tesla T4 · 4 CPU · 16 GB RAM | Avoid — only 4 CPU cores | $0.65 |
| L4 | ≈ RTX 4060 | $0.90 |
| A10G · 8 CPU · 32 GB RAM | ≈ RTX 3080 — **the 4K pick** | **$1.05** |
| L40S | ≈ RTX 4080 | $1.20 |
| RTX A5000 · 12 CPU · 24 GB RAM | ≈ RTX 3080, more cores | $1.55 |

A CPU/RAM upgrade adds about **+$0.30/hr** on the non-raytracing tiers.
Premiere cares far more about CPU and RAM than these gaming-oriented tiers
assume, so on the cheap machines it's usually worth it.

### Your actual monthly bill

**Today — 1080p, on the RTX 4000, 100 GB storage:**

| If you use | You pay |
|---|---|
| 10 hours a month | **$13.50** |
| 20 hours a month | **$20.00** |
| 40 hours a month | $33.00 |

**Later — 4K, on the A10G, 300 GB storage:**

| If you use | You pay |
|---|---|
| 10 hours a month | $31.50 |
| 20 hours a month | **$42.00** |
| 40 hours a month | $63.00 |

**The short answer: about $20/month now, about $42/month when you go 4K** —
assuming you're disciplined about 20 hours. That's the number to hold in
your head.

### Three things about airgpu that will cost you money if nobody tells you

These are the reasons airgpu is *not* a perfect fit for a fully automated
pipeline, and they're worth knowing before you commit.

**1. It bills by the hour, not the minute.** A 12-minute render job costs a
full hour. This one fact means: **never boot the machine for one video.**
Batch a whole week's work into a single session. Vagon, by contrast, bills
by the minute — which matters a lot if you work in short bursts.

**2. There is no automatic idle shutdown** (as of August 2026). Leave it
running overnight by accident and you've spent $25 on nothing. Fix this on
day one with a Windows scheduled task inside the machine:

```
shutdown /s /t 0
```

Trigger it on idle, and put a second one on a hard 4-hour timer as a
backstop. A shutdown from inside Windows stops the instance and stops the
meter.

**3. There's no public API to start or stop machines from a script.** You
press the button in their dashboard. So "fully automatic, no human touches
it" isn't achievable on airgpu — it's "you press start, everything after
that is automatic, and it shuts itself down." That's still good. But if
true unattended automation matters to you later, RunPod or Vast.ai bill by
the *second* and have proper APIs.

### The one line item people forget

Getting footage *to* the machine. Nothing in the pricing above covers your
internet bill, and at Flow's 50 Mbps upload a 100 GB 4K shoot day takes
about 4.5 hours to upload. On Digicel fibre's 350 Mbps it's about 40
minutes. Before you go 4K, upgrading upload speed does more for this
workflow than any GPU choice.

---

## Part 2 — Everything else available right now

Grouped by the job it does. Prices are current as of September 2026.

### A. The machine (rent one)

| Service | Price | Worth knowing |
|---|---|---|
| **airgpu** | $0.65–$1.55/hr + $7/mo storage | Cheapest hourly. Bills by the hour, no auto-shutdown, no API. |
| **Vagon** | $0.65–$1.15/hr + $3.50 per 50 GB | Nearly identical pricing but **bills by the minute** — better for short bursts. Aimed at creatives rather than gamers. |
| **Shadow PC** | ~$34–55/month flat | Flat fee. Only wins if you're on it constantly. For 20 hrs/month, airgpu is cheaper. |
| **Paperspace (DigitalOcean)** | ~$0.80/hr (RTX A4000) and up | More expensive, more serious hardware. Overkill here. |
| **RunPod / Vast.ai** | $0.29–$0.39/hr for an RTX 4090 | **Per-second billing, free egress, real API.** Linux, not a Windows desktop — so no Premiere. But an excellent unattended *render node* for ffmpeg or headless Resolve later. |

### B. The machine (buy one) — the honest challenger

| Option | Price |
|---|---|
| Mac mini M6, base | $899 |
| Mac mini M6, 24 GB RAM / 512 GB — the one that's actually comfortable for 4K | $1,299 |
| Mac mini M5 Pro | $1,699 |

This changes the maths from my last version. A $2,500–3,000 tower is no
longer what "buying a machine" costs. A **$1,299 Mac mini M6 edits 4K
comfortably** — Apple's media engines handle H.265 and ProRes in a way that
embarrasses much pricier PCs.

At ~$55/month all-in for the cloud route, that Mac mini pays for itself in
roughly **20 months** — and it deletes the upload problem entirely, which
is the single biggest friction in the cloud plan. I'm not saying don't go
cloud. I am saying the gap is much narrower than it was, and if you can find
$1,300 in the next year, buying probably wins.

### C. Who actually makes the cut

This is the part that's changed most in the last year.

| Tool | Price | What it does |
|---|---|---|
| **Premiere's own AI** (v26, 2026) | **$0 — you already pay for it** | Text-based editing from the transcript, **silence detection**, **filler-word removal** ("um", "ah", "like"), AI object masking, Media Intelligence search ("find me the shot of the waterfall"). |
| **Premiere MCP servers** (open source) | **$0** | Community-built bridges that let **Claude drive Premiere directly** — import media, build timelines, apply effects, export. Several exist; the local-first ones that show you a preview and ask for approval are the sane choice. |
| **Eddie AI** | Pay-as-you-go: $10 = 1,000 credits | Purpose-built AI assistant editor. Logs footage, builds rough cuts, places b-roll, sends timelines back to Premiere/Resolve/FCP. **Runs as an MCP server**, so Claude can drive it. ~500 credits per hour of footage imported, 100 credits per export. |
| **DaVinci Resolve Studio** | $295 once, no subscription | IntelliScript builds a timeline straight from your script. AI Multicam SmartSwitch cuts between angles by who's speaking. Runs headless with a real Python API. |
| **AutoPod** | $29/month | Premiere plugin. Multi-camera switching, jump cuts, social clips. Built for podcast/interview formats. |
| **TimeBolt** | $17/mo, $97/yr, or **$347 lifetime** | Cuts silence and filler words locally. Largely redundant now that Premiere does this natively. |
| **Gling** | $10–20/month | Same job as TimeBolt, browser-based. Also largely redundant. |

**The important finding:** two separate paths now exist for "Claude takes
over and does the edits," and neither existed in usable form a year ago —
the open-source **Premiere MCP servers**, and **Eddie AI's MCP server**.
That's the direct answer to what you asked for.

### D. Turning long videos into shorts

| Tool | Price |
|---|---|
| **Vizard** | from ~$14.50/mo (annual) — best value |
| **Opus Clip** | from $15/mo — most features, credit-based |
| **Klap** | $29/mo — cheapest per minute, podcast-focused |

Honestly: with the script already written by `journey-to-shorts` and the
shorts shot deliberately, you may not need any of these. They exist to
rescue clips from long videos that weren't planned. Yours are planned.

### E. Storage and moving files

| Service | Price | Notes |
|---|---|---|
| **Backblaze B2** | $6.95/TB/month | Cheapest. Free downloads up to 3× what you store. |
| **Cloudflare R2** | ~$15/TB/month | Zero download fees ever. Costs more to store. |
| **Frame.io** | **Free — 100 GB, included with your CC** | Review and approval on your phone. Use this. |
| **Blackmagic Cloud** | $5/library + $15/TB | Only relevant if you move to Resolve. |
| **Whisper (local)** | **Free** | Transcription on your own machine. No subscription needed. |

### F. One warning about Adobe's generative features

Standard Creative Cloud includes only **25 generative credits a month**.
Generative Extend and the flashier Firefly features effectively need the
**Creative Cloud Pro plan at $69.99/month**, or a Firefly add-on
($9.99/mo for 2,000 credits). Don't design a workflow around Generative
Extend unless you're prepared to pay for it. Everything else listed under
Premiere's own AI above — text-based editing, silence and filler removal,
Media Intelligence — works on the standard plan.

---

## Part 3 — Three routes, costed

All three assume you keep your existing Creative Cloud and Claude
subscriptions, and shoot ~4 days a month producing 8 shorts and 1 long-form.

### Route 1 — Free first (start here)

Prove the whole idea using only things you already pay for.

| Item | Per month |
|---|---|
| Premiere's built-in AI editing (transcript, silence, filler removal) | $0 |
| Claude driving Premiere through an open-source MCP server | $0 |
| Whisper transcription, locally | $0 |
| Frame.io review, 100 GB included | $0 |
| **Total** | **$0** |

Run this on whatever machine you have now, at 1080p, on proxies. If Claude
producing your cuts doesn't work here, no amount of rented GPU fixes it.
This is a week of setup and it de-risks everything else.

### Route 2 — Cloud edit bay (what you asked for)

| Item | Per month |
|---|---|
| airgpu — RTX 4000, ~20 hrs, 100 GB storage | $20 |
| Backblaze B2 — ~1 TB | $7 |
| Eddie AI credits (optional — ~2 hrs of footage) | $10 |
| **Total, 1080p** | **~$27–37** |
| *Same at 4K:* A10G, 20 hrs, 300 GB storage, 3 TB B2 | **~$63–73** |

### Route 3 — Buy the machine

| Item | Cost |
|---|---|
| Mac mini M6, 24 GB / 512 GB | $1,299 once |
| Two external drives (working + off-site backup) | ~$350 once |
| Running cost after that | ~$0/month |

Break-even against Route 2 at 4K: **about 20 months.** And no upload wait,
no hourly meter, no 60–90 ms of latency between you and your own timeline.

---

## What I'd do

**Do Route 1 this month.** It costs nothing, and it answers the only
question that actually matters: whether Claude-generated cuts are good
enough to publish. Everything else is plumbing.

**Then Route 2, deliberately.** Set the storage to 100 GB, put the
auto-shutdown task in place before your first real session, and batch
everything into two sessions a month. Expect ~$20/month at 1080p. Track
your real hours for two months.

**Revisit Route 3 at the 4K decision point.** When 4K roughly doubles the
cloud bill to ~$63–73/month *and* quadruples your upload time, a $1,299 Mac
mini stops being the expensive option and starts being the obvious one. If
capital is still the binding constraint then, stay in the cloud — that's a
legitimate reason and the workflow will already be built. But make it a
decision, not a default.

**One thing regardless of route:** upgrade your upload speed before 4K.
Everything in this plan flows through that pipe.

---

## Sources

- airgpu pricing, billing and storage — <https://airgpu.com/>, <https://cloudbase.gg/airgpu-cloud-gaming/>, <https://getpulsesignal.com/pricing/airgpu>, <https://techsngames.com/airgpu-review/>
- Cloud PC comparison — <https://vagon.io/blog/best-cloud-pc-services>, <https://cloudloadout.com/shadow-pc-vs-airgpu/>, <https://vagon.io/cloud-computer/pricing>
- Per-second GPU rental — <https://www.runpod.io/pricing>, <https://www.synpixcloud.com/blog/vast-ai-vs-runpod-rtx-4090-pricing>
- Mac mini pricing — <https://www.macrumors.com/guide/2024-vs-2026-mac-mini/>, <https://thepostflow.com/post-production/editing-hardware/best-mac-for-video-editing/>
- Premiere Pro 26.0 AI features — <https://www.kylerholland.com/blog/premiere-pro-january-2026-whats-new>, <https://phantomeditor.video/blog/whats-new-premiere-pro-26-2026>
- Premiere MCP servers — <https://github.com/leancoderkavy/premiere-pro-mcp>, <https://github.com/antipaster/Adobe-Premiere-Pro-MCP>, <https://github.com/ayushozha/AdobePremiereProMCP>
- Eddie AI — <https://www.heyeddie.ai/pricing>, <https://www.heyeddie.ai/devs>, <https://www.redsharknews.com/eddie-ai-nab-2026-ai-video-editing-rough-cut>
- Resolve AI tools — <https://davinciresolveclub.com/davinci-resolve-21-ai-tools/>, <https://resolvedevdoc.readthedocs.io/en/latest/API_intro.html>
- Rough-cut and clipping tools — <https://www.timebolt.io/pricing>, <https://aisotools.com/pricing/gling>, <https://www.ngram.com/blog/opus-clip-vs-vizard>
- Adobe generative credits — <https://helpx.adobe.com/creative-cloud/apps/generative-ai/generative-credits-faq.html>, <https://photoshopcafe.com/generative-credits-to-be-enforced-adobe-cc-plans-change/>
- Storage — <https://tech-insider.org/backblaze-b2-vs-wasabi-vs-s3-2026/>, <https://clipsweeper.com/blog/blackmagic-cloud-resolve-pricing.html>
- T&T broadband — <https://tatt.org.tt/wp-content/uploads/2026/05/5_Publication-of-Tariffs-_Fixed-Internet-Services-as-of-31st-March-2026.pdf>
