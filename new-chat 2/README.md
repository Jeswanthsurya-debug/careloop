# CareLoop

A calm voice companion for everyday care. Someone speaks, CareLoop listens, logs what matters
(medicines, mood, alerts) through an MCP tool server, and keeps the family dashboard up to date.

Built with Next.js (App Router), PostgreSQL + Drizzle ORM, Tailwind CSS v4, Web Speech API and
Amazon Polly (with a browser-voice fallback).

---

## Run it

No configuration is needed. With an empty environment CareLoop starts on an
embedded database seeded with seven days of demo data for **Margaret**:

```bash
npm install
npm run build && npm start   # http://localhost:3000
```

Development: `npm run dev` · Types: `npm run typecheck`

To use a real PostgreSQL instead, set `DATABASE_URL` and (optionally) run
`npx drizzle-kit push`. The connection is opened **lazily on the first request**,
so `next build` never touches the database.

Tests:

```bash
npm test                      # unit tests (node:test) — routing, tools, replies, SSML
npm start & npm run test:py   # pytest integration tests against the live HTTP API
```

`test:py` needs `pip install pytest requests` and talks to `http://127.0.0.1:3000`
(override with `CARELOOP_URL`).

## Configuration

Copy `.env.example` to `.env` and set only what you need — **every variable is
optional**.

| Variable | Default | What it does |
| --- | --- | --- |
| `DATABASE_URL` | *(empty)* | PostgreSQL connection string. Empty → embedded PGlite database: a file under `.careloop/` locally, in-memory on Vercel/Lambda. Either way the schema is created and Margaret's 7 days of demo data are seeded on first use. |
| `CARELOOP_DB_PATH` | `.careloop/pglite` | Where the embedded file database lives. Ignored when `DATABASE_URL` is set. |
| `USE_MOCK_LLM` | `true` | `true` uses the warm translated reply templates with no network calls. `false` calls Amazon Bedrock instead (needs `BEDROCK_MODEL_ID` and AWS keys). |
| `BEDROCK_MODEL_ID` | *(empty)* | Bedrock model id, used only when `USE_MOCK_LLM=false`. |
| `AWS_ACCESS_KEY_ID` | *(empty)* | Amazon Polly + Bedrock credentials. Without them `/tts` returns `{"fallback":"browser"}` and the browser voice speaks. |
| `AWS_SECRET_ACCESS_KEY` | *(empty)* | As above. |
| `AWS_SESSION_TOKEN` | *(empty)* | Optional, for temporary credentials. |
| `AWS_REGION` | `us-east-1` | Region for Polly and Bedrock. |
| `AWS_DEFAULT_REGION` | `us-east-1` | Fallback if `AWS_REGION` is unset. |
| `AWS_ENDPOINT_URL_POLLY` | *(empty)* | Override the Polly endpoint — used by the test suite's mock Polly. |
| `VERCEL` / `AWS_LAMBDA_FUNCTION_NAME` / `NETLIFY` | *(set by host)* | Read only to detect a read-only filesystem and switch the embedded database to memory. |

## Deploy to Vercel

The build never touches the database, so no environment variables are required.

1. Push the repo to GitHub and **Import Project** in Vercel (framework: Next.js).
2. Deploy. With no variables set it runs on an in-memory database seeded with
   Margaret's demo week, mock replies, and the browser voice.
3. Optional, under **Settings → Environment Variables**:
   - `DATABASE_URL` — a hosted Postgres (Neon, Supabase, RDS) for data that persists
     between cold starts.
   - `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` — natural Polly voices.
   - `USE_MOCK_LLM=false` plus `BEDROCK_MODEL_ID` — Bedrock phrasing.

Every route is `dynamic = "force-dynamic"`, `runtime = "nodejs"`, `maxDuration = 30`.
On Vercel the embedded database is in-memory (the filesystem is read-only), so set
`DATABASE_URL` if you need data to survive a cold start.

## Voice input

The chat box at the bottom doubles as the dictation surface:

- Live transcript appears **in the box as you speak** — committed words in dark,
  the current guess in grey underneath — and stays editable so you can fix it.
- `continuous=false`, `interimResults=true`, `maxAlternatives=3`; the alternative
  with the highest confidence wins, and `recognition.lang` is set from the current
  language every time the mic starts.
- Permission is requested up front with `echoCancellation`, `noiseSuppression` and
  `autoGainControl`, then the stream is released for the recogniser.
- The mic never opens while CareLoop is speaking, and waits 400 ms after it stops.
- A turn is finalised after 1.2 s of silence rather than cutting you off; if the
  engine ends early it restarts itself (up to twice) and keeps what it heard.
- A thin bar meter driven by an `AnalyserNode` shows the mic is hearing you.
- Buttons: mic (tap on, tap off, soft pulsing ring), **Send**, **Clear**; Enter sends;
  an **Auto-send when I stop talking** toggle (default on).
- Outside Chrome/Edge it says so and the typing box keeps working.

## Screenshots

| Hero + voice loop | Family dashboard |
| --- | --- |
| _placeholder — add `docs/screenshots/01-hero.png`_ | _placeholder — add `docs/screenshots/02-dashboard.png`_ |

```
docs/screenshots/01-hero.png        # top bar, green hero card, orb, mic, captions
docs/screenshots/02-dashboard.png   # conversation bubbles, tool chips, mood chart, adherence ring
```

---

## Design language

- Warm cream `#FAF7F0`, deep forest `#1F4D3A`, soft sand `#E9DFC8`, rare gold accent `#C9A227`, charcoal `#222`.
- Fraunces (serif display) + Inter (UI), loaded from Google Fonts with system fallbacks.
- 20px radii, thin 1px borders, very soft shadows, generous white space, one subtle hero gradient.
- Motion is deliberate: messages fade/slide 8px over 300ms, cards fade in once, mic ring pulses 2.5s,
  orb breathes 6s / shimmers while thinking / ripples while speaking. All disabled under
  `prefers-reduced-motion`.

## Languages

Ten languages, driven by **one shared value** — a full BCP-47 tag such as `hi-IN`
(see `src/lib/languages.ts`). That same tag drives the interface, the microphone,
every `/api/chat` call and every `/tts` call, and is saved in `localStorage`.
Nothing truncates it, so *English (India)* and *English (US)* stay distinct.

| Language | Tag | Voice |
| --- | --- | --- |
| English (India) | `en-IN` | Polly (Kajal) |
| English (US) | `en-US` | Polly (Joanna) |
| हिन्दी | `hi-IN` | Polly (Kajal) |
| தமிழ் | `ta-IN` | browser voice — Polly has none |
| తెలుగు | `te-IN` | browser voice — Polly has none |
| Español | `es-ES` | Polly (Lucia) |
| Français | `fr-FR` | Polly (Léa) |
| Deutsch | `de-DE` | Polly (Vicki) |
| العربية | `ar-AE` | Polly (Hala), right-to-left |
| 日本語 | `ja-JP` | Polly (Tomoko) |

- **Replies** are translated for every language (`src/lib/replies.ts`), so CareLoop
  answers in the chosen language with no AWS keys at all. With Bedrock configured
  (`BEDROCK_MODEL_ID`) the same answer is re-phrased with the system prompt
  *"Reply only in &lt;language&gt;, in 1-2 short simple sentences, warm tone."*
- **Tool chips and tool-result sentences** are translated too; tool *names* such as
  `log_medication` stay English because they are part of the MCP contract.
- **Voices are never hardcoded.** On first use `/tts` calls Polly `DescribeVoices`,
  caches the catalogue, and picks the best *verified* neural voice for the tag. If a
  voice cannot be verified, the browser speaks instead.
- **Tamil and Telugu** have no Polly voice, so `/tts` returns
  `{"fallback":"browser","reason":"language-unsupported"}`. The browser picks a voice
  whose `lang` matches (preferring *Google/Natural/Neural*), waiting for `voiceschanged`
  first. If nothing is installed, CareLoop shows *"No voice installed for this language,
  showing text only"* and keeps the subtitles running.

## Voice: loud, clear, easy to follow

- `/tts` sends SSML to Polly's **neural** engine:
  `<speak><prosody rate="90%" volume="+6dB">…<break time="250ms"/>…</prosody></speak>`,
  with a 250 ms breath between sentences. Verified voice/language/engine combos:
  Joanna · en-US, Kajal · en-IN, Kajal · hi-IN, Lucia · es-ES, Léa · fr-FR (all neural).
- The browser plays the MP3 at `volume = 1.0` through a Web Audio chain —
  `GainNode(1.4 × your volume)` → `DynamicsCompressorNode` → speakers — so quiet
  words are lifted while peaks stay gentle.
- No Polly credentials? The browser voice takes over at volume 1, rate 0.9, pitch 1,
  preferring voices named *Natural*, *Neural*, *Google* or *Online* in the chosen language.
- **Voice settings** popover: Volume, Speed (0.7–1.2), Voice, and *Test voice*.
  Choices are saved in `localStorage` and restored on the next visit.
- Replies are at most two short, warm sentences with no raw numbers
  ("your mood has been good this week"). Low mood is answered with kindness first,
  then an offer to alert family or keep talking.
- While CareLoop speaks, the reply appears as **live subtitles that highlight word by word**
  (audio timing for Polly, `onboundary` events for the browser voice).

## Voice loop

`idle → listening → thinking → speaking → idle` — one state at a time, every transition wrapped in
try/catch with a friendly spoken-tone message. Live captions while listening, an editable final
transcript with **Send** / **Re-record**, Mute and Stop, four languages, and a typed fallback for
browsers without the Web Speech API.

## MCP server

`GET /mcp` returns the catalogue; `POST /mcp` speaks JSON-RPC 2.0 (`initialize`, `ping`,
`tools/list`, `tools/call`).

| Tool | Purpose |
| --- | --- |
| `log_medication` | record a dose as taken or missed |
| `get_care_plan` | today's scheduled medicines and what is still due |
| `daily_checkin` | meals eaten/skipped plus a 1–5 mood check-in |
| `get_wellness_summary` | mood trend + adherence + recent alerts |
| `detect_anomalies` | missed doses, skipped meals, low hydration, low-mood streaks |
| `log_hydration` | record glasses of water against an eight-glass daily goal |
| `add_appointment` | save an upcoming visit (title + calendar date), duplicates ignored |
| `alert_family` | notify the family circle (info / warning / urgent) |

```bash
curl -s localhost:3000/mcp | jq '.toolCount'   # 8
curl -s -X POST localhost:3000/mcp -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"daily_checkin","arguments":{"mood":4}}}'
```

## Other routes

- `POST /api/chat` – intent routing → MCP tool calls → localized reply + tool chips
- `GET /api/dashboard` – weekly care summary for the dashboard cards
- `POST /tts` – Amazon Polly neural speech, or a `fallback: browser` hint
- `GET /health` and `GET /api/health` – liveness probes

## Project layout

```
src/app         routes: page, /mcp, /tts, /health, /api/chat, /api/dashboard, /api/health
src/components  TopBar, HeroCard, Orb, Conversation, Dashboard, CareLoopApp
src/hooks       useVoice (recognition + speech, mute/stop)
src/lib         tools (MCP catalogue), agent (intent + replies), i18n, types
src/db          Drizzle schema and client
tests           node:test suites (agent, tools, i18n) + pytest API tests
```
