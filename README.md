# Quorum

Quorum is an open-source web app for running a company with AI staff. The owner appoints executives, gives managers their own staff, delegates tasks, and watches the office move only when the work does.

The repository started empty. This version uses **Vite, React, and TypeScript**: a typed client app with no server, so the demo task engine and the screens can later be swapped for a real agent backend without rewriting the interface.

## Run

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`). Choose **Open the Northline sample**, or create your own company.

```bash
npm test
npm run build
```

Copy `.env.example` to `.env` and add your Supabase project URL and publishable key. The secret key stays in `.env` only (never `VITE_`). Sign in on first open; the company is saved per account in `company_saves`. DeepSeek (or another chat model) is linked under Chat and stays the brain: it reasons, routes, and coordinates staff. Put `OPENAI_API_KEY` in `.env` for GPT Live voice only — never `VITE_`, never in the browser. A cache also sits in `localStorage` under `quorum.state.v1`.

## What is real in this build

- Sign in with email on Supabase. The company save lives in your account (run `supabase/schema.sql` once).
- Company profile, goals, departments, roles, reporting lines, and staff
- Task inbox: create, assign, prioritize, pause, block, review
- Permission grants and revokes, with an audit log
- Approval decisions for publishing, external messages, purchases, finance changes, hiring, and desktop control
- Chat, laid out like a messenger: the company group, a direct chat with each staff member, and groups you create. Tag a person or @all to ask them. They answer from their role, and keep working on their own. Link DeepSeek (or another chat model) under Chat if you want them to answer in their own words. That model routes the request to the right agent and writes the words. The chat key stays in this browser. A voice call uses OpenAI GPT Live over WebRTC when `OPENAI_API_KEY` is on the server: it hears you and speaks the DeepSeek reply. OpenAI does not pick the agent and does not replace DeepSeek. Without that server key, the call uses this computer’s microphone and voices. Allow the microphone when the browser asks. Staff know whether you are a woman or a man from Company settings, and address you as ma or sir. The opening is a real conversation: people greet you and each other from the office clock and whatever is happening on the floor (a beautiful morning, tension, a stuck task). It does not follow a chair script. Someone still keeps light minutes. The spoken call does not appear in chat. When you End, the minutes go to that group as a PDF. People on the line sit at their desks in the 3D office with a laptop and headset. Direct chats start a private call; a group chat can call everyone or a huddle you pick; People has a private call as well. The call screen has company navigation and View office (the call docks so you can walk the floor). Names show job titles. Each person can set their own photo under People. Say a name and that person answers, or just talk and the chair answers. Women speak in a female voice and men in a male voice. Mute and End stay on the call. Switch to any page from the call nav, or type in chat when the call is docked. A linked model makes the words richer. The marketing manager writes a content calendar for each product and names Instagram, TikTok, or YouTube on every post. The graphic designer designs whatever that calendar schedules for today. The marketing manager then looks at the graphic and can correct it, decline it, or approve it for you. Turn that off in Chat if you want to review graphics yourself. You can still approve one while they are looking. A graphic still waits for your approval, and nothing is posted because no social account is connected. At close, staff file a daily note to their line manager in a line-report chat. Line managers send you the compiled report on a cadence you choose (daily, weekly, or monthly) in their direct chat. Nothing is emailed
- Office positions driven by those task events. Xoral City, the city of AI agents, is the exterior around that same office: streets joined into one network, a pedestrian promenade that runs onto the footbridges, a highway with toll gates, a canal with road and foot bridges, houses, estates, towers, traffic, helicopters that patrol and land, an airport with two runways set out past the towers, and lots you can acquire. City time is separate from the office clock, so the office lighting stays as it is. People walk through doors and corridors, keep office hours, and have an in-app pay ledger (not a connected bank). Someone who brings you a result returns to their own desk. Call meeting brings people who are in the building into the meeting room. The south wing has a lounge with couches and a bar, a cafeteria where people sit down to eat, toilets, a server room, and an operations room. Staff sit together for a lounge meeting and sit at a table for a meal. Security staff review this company’s own systems inside the app

## What is still a demo

The task engine in `src/engine/apply.ts` advances sample playbooks. Those playbook steps do not call a model. Stock counts, quotes, drafts, and campaign copy are sample figures. Chat can call DeepSeek after you link it under Chat → Link a model. Voice on a call uses OpenAI GPT Live from the server `OPENAI_API_KEY`. Run `npm run dev` so those calls go out from this computer.

Integrations in `src/integrations/registry.ts` are connection points only:

| Service | Status |
| --- | --- |
| Product catalog | Demo data on this device |
| CRM, email, social, PR, calendar, suppliers, finance, HR | Not connected |
| Desktop control | Not connected |

Approving a request records the decision and says the outside system was not contacted. It does not send mail, publish a post, place an order, change books, hire anyone, or touch the computer.

Desktop access is a separate permission. This build has no desktop agent. `desktop.agentConnected` and `desktop.sessionActive` stay false, so staff cannot see the screen or use the pointer. A future agent should be a visible session the owner starts and can revoke.

To replace the demo engine, keep `Command` and `AppState` in `src/types.ts` and change `applyCommand` in `src/engine/apply.ts`, or point `src/store/Store.tsx` at another client. Set an integration’s status to `connected` only after a real client exists.

## License

MIT
