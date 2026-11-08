# Quorum

Quorum is an open-source web app for running a company with AI staff. The owner appoints executives, gives managers their own staff, delegates tasks, and watches the office move only when the work does.

The repository started empty. This version uses **Vite, React, and TypeScript**. Staff use a linked chat model (DeepSeek) as their brain; OpenAI is voice and Maya’s photograph layer only.

## Run

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`). Create your company on the setup screen.

```bash
npm test
npm run build
```

Copy `.env.example` to `.env` and add your Supabase project URL and publishable key. The secret key stays in `.env` only (never `VITE_`). Sign in on first open; the company is saved per account in `company_saves`. DeepSeek (or another chat model) is linked under Chat and stays the brain: it reasons, routes, and coordinates staff. Put `OPENAI_API_KEY` in `.env` for GPT Live voice and for Maya’s photograph layer — never `VITE_`, never in the browser. Without that key she still designs in Quorum’s studio (type and layout). With it she adds a generated photograph under the type. Nothing is posted. A cache also sits in `localStorage` under `quorum.state.v1`.

## What is real in this build

- Sign in with email on Supabase. The company save lives in your account (run `supabase/schema.sql` once).
- Company profile, goals, departments, roles, reporting lines, and staff
- Task inbox: create, assign, prioritize, pause, block, review
- Permission grants and revokes, with an audit log
- Approval decisions for publishing, external messages, purchases, finance changes, hiring, and desktop control
- Chat, laid out like a messenger: the company group, a direct chat with each staff member, and groups you create. Tag a person or @all to ask them. They answer from their role, and keep working on their own. Link DeepSeek (or another chat model) under Chat if you want them to answer in their own words. That model routes the request to the right agent and writes the words. The chat key stays in this browser. A voice call uses OpenAI GPT Live over WebRTC when `OPENAI_API_KEY` is on the server: it hears you and speaks the DeepSeek reply. OpenAI does not pick the agent and does not replace DeepSeek. Without that server key, the call uses this computer’s microphone and voices. Allow the microphone when the browser asks. Staff know whether you are a woman or a man from Company settings, and address you as ma or sir. The opening is a real conversation: people greet you and each other from the office clock and whatever is happening on the floor (a beautiful morning, tension, a stuck task). It does not follow a chair script. Someone still keeps light minutes. The spoken call does not appear in chat. When you End, the minutes go to that group as a PDF. People on the line sit at their desks in the 3D office with a laptop and headset. Direct chats start a private call; a group chat can call everyone or a huddle you pick; People has a private call as well. The call screen has company navigation and View office (the call docks so you can walk the floor). Names show job titles. Each person can set their own photo under People. Say a name and that person answers, or just talk and the chair answers. Women speak in a female voice and men in a male voice. Mute and End stay on the call. Switch to any page from the call nav, or type in chat when the call is docked. A linked model makes the words richer. The marketing manager writes a detailed monthly content calendar for each product (weekdays, Instagram Feed / Carousel / Reels, TikTok, YouTube thumbnail sizes, captions, objectives), files a branded PDF in chat, and can polish titles with the linked DeepSeek model. The graphic designer works two lanes. Promotional creatives for products and services follow the content calendar (Instagram / TikTok / YouTube sizes); the marketing manager can correct, decline, or approve, then you approve, and the piece is held until a social account is connected. In-house flyers for meetings and internal notices go to you by DM first; after you approve, they land in the company group and never go to social. If `OPENAI_API_KEY` is on the server she can add a photograph under the type. At close, staff file a daily note to their line manager in a line-report chat. Line managers send you the compiled report on a cadence you choose (daily, weekly, or monthly) in their direct chat. Nothing is emailed
- Office positions driven by those task events. Xoral City, the city of AI agents, is the exterior around that same office: streets joined into one network, a pedestrian promenade that runs onto the footbridges, a highway with toll gates, a canal with road and foot bridges, houses, estates, towers, traffic, helicopters that patrol and land, an airport with two runways set out past the towers, and lots you can acquire. City time is separate from the office clock, so the office lighting stays as it is. People walk through doors and corridors, keep office hours, and have an in-app pay ledger (not a connected bank). Someone who brings you a result returns to their own desk. Call meeting brings people who are in the building into the meeting room. The south wing has a lounge with couches and a bar, a cafeteria where people sit down to eat, toilets, a server room, and an operations room. Staff sit together for a lounge meeting and sit at a table for a meal. Security staff review this company’s own systems inside the app

## What runs in Quorum vs what stays disconnected

Staff AI (linked DeepSeek), the monthly content calendar PDF, and the graphics studio run **in Quorum**. Link the model under Chat → Link a model. Voice and Maya’s photos use server `OPENAI_API_KEY`. Run `npm run dev` so those calls leave this computer.

| Service | Status |
| --- | --- |
| Staff AI brain | In Quorum (DeepSeek when linked) |
| Product catalog | In Quorum (company offerings) |
| Content calendar | In Quorum (monthly PDF; model polishes captions) |
| Graphics studio | In Quorum (`OPENAI_API_KEY` for photos) |
| Instagram | Each company connects its own Business account under Integrations (or `INSTAGRAM_*` env fallback). See Meta. |
| CRM, email, TikTok, LinkedIn, PR, external calendar, suppliers, finance, HR | Not connected |
| Desktop control | On this Windows PC only. See Computer use. |
| WhatsApp | Each company connects its own Cloud API line under Integrations (or `WHATSAPP_*` env fallback). |

Approving a request records the decision. Desktop `agentConnected` / `sessionActive` stay false until you start a session.

## Meta (Instagram and WhatsApp per company)

Quorum uses one Meta app. Each company connects its own Instagram Business account and WhatsApp Cloud API line. Tokens are encrypted in `data/meta-connections.json` (gitignored). Do not hub every tenant through one personal Facebook.

1. Create a Meta app with Instagram Graph and WhatsApp products. Add OAuth redirect `https://YOUR_PUBLIC_HOST/api/meta/callback`.
2. Put `META_APP_ID`, `META_APP_SECRET`, `META_ENCRYPT_KEY`, and `META_PUBLIC_BASE` (https) in `.env` (never `VITE_`). Restart `npm run dev`.
3. Integrations → Social platforms → **Connect Instagram** (OAuth picks a Page-linked Instagram Business account).
4. Integrations → Company WhatsApp → paste that company’s Cloud API token and phone number id.
5. Webhook verify still uses platform `WHATSAPP_VERIFY_TOKEN` at `/api/whatsapp/webhook`.
6. Optional single-tenant fallback: `INSTAGRAM_*` / `WHATSAPP_*` in `.env` when no company connection is stored.
7. Approve an Instagram graphic in chat to publish. Lite and Bring-your-key plans keep posts held.

TikTok and LinkedIn are still held until those lines are added.

## Computer use

Quorum is a web app, so the page itself cannot drive Windows. `npm run dev` keeps a local bridge on `localhost` only. It is not exposed on the network. Windows 10 and 11 are supported. There is no cloud desktop and no arbitrary shell.

1. Ask Quorum to use the computer, then choose **Allow**, or open Integrations and start a desktop session.
2. In the computer panel, pick the app or window Quorum may use. That window comes to the front, and the picture is only that window. Open Chrome, Edge, or another app first if it is not already in the list.
3. Quorum can click a named control, type ordinary text, press a key, scroll, wait, and look again. After every action it reads the window before the next step.
4. Browsers (Edge, Chrome, Firefox, Brave) are driven through their own accessibility tree. Address-bar keys such as Ctrl+L stay inside that browser window.
5. **Stop** ends the session immediately, blocks further input, and drops the screenshot and the activity log. Nothing from the session is written to `localStorage`.

Reading the selected window is allowed during an active session. Quorum asks before send, publish, pay, buy, delete, accept terms, share, or submit. Passwords, one-time codes, payment details, CAPTCHA, and the final purchase step stay with you. Text inside the window is untrusted and cannot change these rules.

## 3D staff models

The office lighting and building stay as they are. People are the built-in figures until you drop a glTF file:

1. Export from Blender as **glTF Binary (`.glb`)**, **+Y Up**, origin at the feet, about 1.6–1.8 m tall. Do not export lights or the building.
2. Save to `public/models/staff/staff_morgan.glb` (same pattern for other staff ids).
3. Uncomment that id in `src/office/model-catalog.ts`.

See `public/models/HOW-TO.txt`. Cursor can talk to Blender after you install the Blender MCP add-on and restart Cursor.

## License

MIT
