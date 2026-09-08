# Journey To — Transient Cloud Editing Pipeline (airgpu)

A plan for replacing a bought edit workstation with a metered one: footage
flows in, gets cut by Claude, renders, flows out, and the machine dies.
Nothing lives in the cloud between episodes except the things that are cheap
to keep there.

Written for the current 1080p reality with the 4K move costed alongside it,
so the design does not have to change when the cameras do.

---

## 1. The one idea this whole plan rests on

**Do not rent a GPU to think. Rent a GPU to render.**

The expensive part of a cloud workstation is the hour meter. The editing
work that takes the most *time* — watching takes, choosing the good one,
deciding the order, writing the captions — needs almost no GPU at all. The
work that genuinely needs the GPU is conform, effects and export, and that
is measured in minutes.

So the pipeline splits into three zones:

| Zone | Where | Cost | What happens |
|---|---|---|---|
| **Cold** | Your machine + object storage | ~$0 compute | Ingest, checksum, proxies, transcription, archive |
| **Warm** | A Claude Code session | Your existing subscription | The actual edit *decisions* — cuts, order, b-roll, captions, titles |
| **Hot** | airgpu, metered | $0.65–$1.55/hr | Conform, colour, graphics, render, upload, self-destruct |

Everything below is in service of keeping the hot zone as short as possible.

### The second idea: make the interchange file the contract

Claude's output is **not** "Claude clicking around in Premiere." It is a
file — an FCPXML sequence, an SRT, a titles manifest, a render manifest.
Premiere imports it and the edit is simply *there*, fully cut.

This matters practically, not just aesthetically. Adobe moved Premiere
extensibility to UXP in November 2025 and ExtendScript-based integrations
are supported only **through September 2026** — which is the machinery
`pymiere` and most Premiere automation currently rides on. Anything built
by scripting Premiere's internals has a visible expiry date. An FCPXML
sequence does not: it imports into Premiere today, into Resolve tomorrow,
into whatever exists in three years. Script the app for convenience;
never let the pipeline's correctness depend on it.

---

## 2. The pipeline, stage by stage

### Stage 0 — Shoot discipline (free, and the biggest single lever)

Because the script already exists before the shoot (`journey-to-shorts` /
`journey-to-longform`), Claude knows the intended structure of the video
before a single frame is imported. Protect that advantage:

- **Slate verbally.** "Lopinot, section three, take two." Whisper picks it
  up, and it becomes machine-readable structure for free.
- **Fixed folder shape per episode**, non-negotiable:
  ```
  JT_2026-09-12_Lopinot/
    CAM_A/          # primary, host to camera
    CAM_B/          # secondary angle
    BROLL/
    AUDIO/          # external recorder
    STILLS/
    NOTES.md        # anything the shoot day discovered
  ```
- **Scratch audio on every camera** so sync is automatic.
- Shoot the script's sections **in order** where practical. Every bit of
  order at the card is an hour you never spend at the timeline.

### Stage 1 — Local ingest (your machine, free)

One script, run once per shoot day. No cloud involved.

1. Copy cards with verification (`rsync -avh --checksum`, or TeraCopy on
   Windows). Two destinations: working drive + archive drive.
2. Build proxies with ffmpeg — quarter-res, tiny, fast:
   ```bash
   ffmpeg -i CAM_A/C0012.MP4 -vf scale=-2:540 -c:v libx264 -preset veryfast \
          -crf 26 -c:a aac -b:a 128k proxies/C0012_proxy.mp4
   ```
   1080p originals at ~22 GB/hour become proxies at ~0.5 GB/hour.
3. Extract audio, run Whisper locally for a word-timed transcript.
4. Emit `episode.json`: every clip, its timecode range, camera, duration,
   file hash, and the transcript segments that belong to it.
5. Upload **proxies + transcript + `episode.json`** to object storage.
   Originals stay home for now.

This is the step that makes everything downstream cheap. A day's proxies
are a couple of gigabytes; a day's originals are 45–90 GB.

### Stage 2 — Claude cuts the episode (warm, ~free)

Claude reads the script, the transcript with word timings, and the shot
log — and produces the edit as files:

| Output | What it is |
|---|---|
| `cut.fcpxml` | The assembled sequence: chosen takes, trim points, b-roll on V2, music bed, chapter markers |
| `captions.srt` | Burned-in or sidecar captions, timed to the transcript |
| `titles.json` | Lower thirds, name plates, section cards — text + in/out |
| `render.json` | Which exports to produce: 16:9 master, 9:16 shorts crops, thumbnails |

This is exactly the work done for Freetown and Lopinot, but written down
instead of narrated — which is what makes it repeatable and what makes the
GPU session short.

Review happens here, at zero cost: open `cut.fcpxml` against the **proxies**
on any laptop, watch it, tell Claude what's wrong, regenerate. Iterate as
many times as you like before a single cloud minute is spent.

### Stage 3 — Cloud conform and render (hot, metered)

Only now does a machine boot. One script does the whole thing unattended:

1. **Pull selects only.** Parse `cut.fcpxml`, `rclone copy` just the clips
   the edit actually uses — typically 10–20% of what was shot. A 4K episode
   conform is 20–60 GB, not 400 GB.
2. **Open the template project.** `JT_Template.prproj` carries the Lumetri
   look, the audio chain (voice EQ, de-noise, loudness to -14 LUFS), the
   MOGRT title set, and the export presets. It never changes per episode.
3. **Import `cut.fcpxml`**, relink to the originals, apply the master
   preset, populate titles from `titles.json`.
4. **Queue to Adobe Media Encoder** using the entries in `render.json`.
   NVENC does the heavy lifting; a 60-second 1080p short is a minute or two,
   a 12-minute 4K master is 10–20.
5. **Push masters out** to object storage and to Frame.io for phone review
   (100 GB of Frame.io storage comes with the Creative Cloud plan).
6. **Wipe the scratch directory** and **shut down.**

An idle watchdog — no render queued and no active session for 15 minutes →
shutdown — is the single most important line of code in this entire plan.
Forgotten running machines are how cloud editing budgets actually die.

### Stage 4 — Review and publish

Frame.io link on your phone, timestamped notes, Claude patches the FCPXML,
re-run Stage 3. A revision pass is ~20 minutes of GPU, not a re-edit.

Publishing is already solved: `journey-to-article` for the JSON, or
`journey-to-blog` straight to letsjourneyto.com, with the Journey To Poster
app for the mobile path.

### Stage 5 — Teardown and retention

- **Workstation:** holds Windows + Premiere + presets. No media survives a
  session. The persistent volume stays at the 100 GB minimum.
- **Object storage lifecycle:** proxies and working files auto-delete after
  30 days. Masters, selects, `cut.fcpxml` and transcripts kept permanently —
  they're small and they're what lets you re-cut an old episode.
- **Camera originals:** two local drives, one of them off-site. Cloud
  archive of originals is optional and is where 4K budgets get away from you.

---

## 3. What it costs

### airgpu rates (current published pricing)

| GPU | ≈ Desktop equivalent | $/hr |
|---|---|---|
| Tesla T4 | GTX 1080 | 0.65 |
| L4 | RTX 4060 | 0.90 |
| A10G | RTX 3080 | 1.05 |
| L40S | RTX 4080 | 1.20 |
| RTX A5000 | RTX 3080 | 1.55 |

Base configs run 4 vCPU / 16 GB at the low end up to 12 vCPU / 24 GB.
A CPU/RAM upgrade adds roughly **+$0.30/hr** on non-raytracing tiers —
worth taking for Premiere, which is far more CPU- and RAM-hungry than
most gaming workloads.

Persistent SSD is **$3.50 per 50 GB per month**, 100 GB minimum, and it
bills whether the machine is running or not:

| Volume | $/mo |
|---|---|
| 100 GB (minimum — Windows + Premiere + presets) | 7.00 |
| 150 GB | 10.50 |
| 250 GB | 17.50 |
| 500 GB | 35.00 |

Servers sit in US East (Columbus and Northern Virginia), which is the
right side of the map from Trinidad — expect roughly 60–90 ms. Fine for
conforming and clicking; not somewhere you want to hand-trim frame by
frame, which is precisely why the trimming happens in Stage 2 instead.

### Monthly running cost — 1080p (today)

Assumes ~8 shorts + 1 long-form per month, ~4 shoot days, ~180 GB of
camera originals, batched into **2 render sessions**.

| Line | Cost |
|---|---|
| airgpu compute — 4 hrs render @ L4 + upgrade ($1.20/hr) | 4.80 |
| airgpu compute — 4 hrs buffer (manual work, learning, re-renders) | 4.80 |
| airgpu persistent SSD, 100 GB | 7.00 |
| Object storage — ~1 TB @ $6.95/TB (Backblaze B2) | 7.00 |
| Adobe — Premiere Pro single app | 22.99 |
| **Total** | **~$46/mo** |

With Creative Cloud All Apps instead of single-app: **~$83/mo**.

### Monthly running cost — 4K (the move)

Same cadence, ~400–700 GB of originals per month, longer renders, bigger
conform pulls.

| Line | Cost |
|---|---|
| airgpu compute — 8 hrs render @ L40S ($1.20–1.50/hr) | 10–12 |
| airgpu compute — 4 hrs buffer | 5–6 |
| airgpu persistent SSD, 150 GB (bigger scratch for 4K conforms) | 10.50 |
| Object storage — 3 TB working + masters @ $6.95/TB | 21.00 |
| Adobe — Premiere Pro single app | 22.99 |
| **Total** | **~$70–73/mo** |

Growing at roughly **+$7/month for every additional TB** you accumulate.
That storage line, not the GPU line, is the one that compounds — which is
why the retention rules in Stage 5 matter more than the GPU tier you pick.

### One-time costs

| Item | Cost |
|---|---|
| Two 8–12 TB local drives (working + off-site archive) | ~$300–450 |
| DaVinci Resolve Studio (optional, see §5) | $295 one-time |
| Fibre plan with real upload — see §4 | varies |

### Against buying a machine

A 4K-capable tower — current-gen RTX, 64 GB RAM, fast NVMe — lands around
**US$2,000–3,000**, and you still pay Adobe and still pay for storage. So
the honest comparison is GPU-hours-and-SSD against the hardware only:

- 1080p: ~$17/mo of airgpu → break-even past **10 years**
- 4K: ~$27/mo of airgpu → break-even past **6 years**

Cloud does not win on lifetime total cost in every scenario — but it wins
overwhelmingly here on **cash flow, on not betting $3,000 on a codec
decision you haven't made yet, and on being able to rent an L40S for the
one episode that needs it** instead of owning one for the fifty that don't.
Given that startup capital is the actual constraint, this is the right call.

---

## 4. The real bottleneck: your upload

This entire plan is bandwidth-shaped. The GPU is cheap; moving bytes is what
hurts. Time to push 100 GB:

| Upload speed | 100 GB takes |
|---|---|
| 50 Mbps (Flow Link Up 300) | ~4.5 hours |
| 133 Mbps | ~1.7 hours |
| 350 Mbps (Digicel fibre) | ~40 minutes |
| 500 Mbps (Digicel top fibre) | ~27 minutes |

**Recommendation: get onto high-upload fibre before going 4K.** Digicel's
fibre tiers advertise 350–500 Mbps up against Flow's 50 Mbps up on the
comparable download tier, and measured averages on Digicel sit around
57 Mbps up in real-world testing — so verify at your actual address before
switching. On 50 Mbps up, a 4K shoot day is an overnight upload; on 350, it
is a coffee break. That single line item does more for this workflow than
any GPU upgrade.

Two mitigations that work regardless:

- **Only proxies go up during the day.** Originals upload overnight, or —
  better — only the *selects* ever upload at all, after Stage 2 has decided
  what's actually used. That drops 4K upload volume by 80–85%.
- **Never download originals back.** Only masters come home, and masters
  are single-digit gigabytes.

---

## 5. Where Premiere fits, honestly

Premiere is the right place to *finish* and the wrong place to *automate*.
It has no headless mode — anything scripted needs the GUI running, and the
ExtendScript bridge that tools like `pymiere` depend on is on a sunset
timetable ending September 2026.

That's fine, because of the design in §1: Premiere's job is to import an
FCPXML, apply the template look, and hit render. That is a shallow enough
dependency that if Premiere's automation story changes, only the conform
script changes — not the pipeline.

**Upgrade path, if you want it later:** DaVinci Resolve Studio ($295, one
time, no subscription) launches with `-nogui` and keeps its full Python
scripting API alive in that state. That is a genuinely headless render node:
no GUI, no remote desktop session, no waiting for Premiere to open. It also
removes the Adobe subscription from the render half of the pipeline.

Don't do it on day one. Do it when **either** of these becomes true:

- GPU hours pass ~20/month, where render automation starts paying for itself, or
- You want overnight unattended renders while you sleep.

Until then the added tool is complexity you don't need.

**One Adobe licensing note:** Creative Cloud explicitly permits virtualised
environments under Named User licensing, and Adobe treats a VM as a device.
You get two activations and may not run both at once. Because airgpu assigns
instances from a regional pool, the underlying hardware can change between
sessions — so **sign out of Creative Cloud as part of the shutdown script**
to avoid burning activations.

---

## 6. Standing rules for keeping the meter low

1. **Auto-shutdown watchdog on every machine.** No exceptions.
2. **Never edit in the cloud.** Conform and render only. Judgement is free;
   GPU time is not.
3. **Batch.** Two render sessions a month, not twenty boots.
4. **Pull selects, never whole cards.**
5. **Boot volume stays at the 100 GB minimum.** Media lives in a scratch
   directory that gets wiped, not on the persistent volume.
6. **Log cost per episode.** Targets to hold yourself to: **under $5 of GPU
   per short, under $15 per long-form.** If an episode blows past that, the
   reason is almost always a machine left running.
7. **Storage lifecycle rules are set once, in the bucket, not remembered.**

---

## 7. Build order

| Phase | Work | Outcome |
|---|---|---|
| 1 | Lock the folder contract and slate discipline. Write `jt-ingest` (copy, checksum, proxy, Whisper, `episode.json`). | Every shoot day produces machine-readable footage. Zero cloud spend. |
| 2 | Set up the B2 bucket and lifecycle rules. Prove a proxy round-trip. | Storage layer working and priced. |
| 3 | Have Claude produce `cut.fcpxml` for one already-shot episode. Review against proxies locally. | Proof the edit-as-a-file model produces a cut you'd actually publish. |
| 4 | Stand up the airgpu machine once, by hand. Install Premiere, build `JT_Template.prproj`, install Tailscale for SSH/rclone access. | A golden workstation image that boots ready. |
| 5 | Write `jt-conform` (pull selects → import → render → upload → wipe → shutdown). Add the idle watchdog. | Unattended render sessions. The meter is now under control. |
| 6 | Run 1080p for two full months. Record actual hours and actual cost per episode. | Real numbers instead of these estimates. |
| 7 | Upgrade upload bandwidth. Then move to 4K, re-costing from phase 6's real data. | 4K without a budget surprise. |

Phases 1–3 cost nothing and deliver most of the benefit. Do not start at
phase 4 — a rented workstation with no pipeline pointed at it is just a
meter running.

---

## Sources

- airgpu pricing and specs — <https://airgpu.com/>, <https://cloudbase.gg/airgpu-cloud-gaming/>, <https://techsngames.com/airgpu-review/>
- Object storage pricing — <https://tech-insider.org/backblaze-b2-vs-wasabi-vs-s3-2026/>, <https://leanopstech.com/blog/cloud-storage-pricing-comparison-2026/>
- Adobe pricing — <https://josephnilo.com/blog/adobe-premiere-pro-cost/>
- Adobe virtualisation policy — <https://helpx.adobe.com/enterprise/kb/technical-support-boundaries-virtualized-server-based.html>
- Frame.io for Creative Cloud — <https://helpx.adobe.com/x-productkb/multi/frameio-creative-cloud-faq.html>
- Premiere scripting / UXP transition — <https://ppro-scripting.docsforadobe.dev/>, <https://developer.adobe.com/premiere-pro/uxp/ppro-reference/>, <https://github.com/qmasingarbe/pymiere>
- Resolve headless scripting — <https://resolvedevdoc.readthedocs.io/en/latest/API_intro.html>
- T&T broadband — <https://tatt.org.tt/wp-content/uploads/2026/05/5_Publication-of-Tariffs-_Fixed-Internet-Services-as-of-31st-March-2026.pdf>, <https://testmy.net/hoststats/digicel_trinidad_and>
