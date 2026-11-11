# Second Act

**Live web app:** [https://second-act-workbench.harryworld.chatgpt.site/](https://second-act-workbench.harryworld.chatgpt.site/)

Second Act helps retired and semi-retired professionals find collaborators and test small business ideas with a personal founder guide. The Portland pilot includes textile, accessories and repair experiments.

## Sign in

Open [Second Act](https://second-act-workbench.harryworld.chatgpt.site/) to explore the studio home, experiment starters and learning library without signing in. Continue with ChatGPT to use a guide or open a member workspace. **My profile** shows the account information supplied at sign-in, a short private brief, and the facts your guide has learned from your founder conversations. Open “What you said” to see the source of a remembered fact, or forget the detail to remove it and update the brief. Directory sharing is controlled separately.

Use Node.js 24 or later for development. `npm start` opens a loopback entry point on port 4317 that directs members to the signed-in Site. To explicitly run the isolated development version with local SQLite accounts, use `npm run dev:local`. Local API access reads the process environment or `../.env.local`.

## Take a venture through a trial

1. Start in **My workbench**. Ask the founder guide about an idea by typing or speaking. Review suggested profile edits, notes, and experiments before applying them. Live speech requires browser microphone permission. Spoken turns appear inline and are automatically saved in the same conversation. Send a typed follow-up while speaking to switch to text. The next voice session receives recent turns from that guide.
2. Fill in **My profile**. Directory listing is opt-in. Your ChatGPT sign-in identifies your hosted workspace across visits.
3. Your guide privately remembers explicit work goals, skills and preferences from your own founder messages in the background. Inspect, forget or pause memory in **My profile → Your personal guide**. Clearing the conversation and forgetting a saved memory are separate controls.
4. In **People & circles**, search skills, review an introduction or host a working circle. Real requests appear in the recipient’s inbox. Example profiles accept practice drafts only. Members can accept or decline, block other members, and report posts in hosted circles. Hosts can schedule sessions and moderate reported posts. Two listed members who enable guide introductions can open **Guide connections** to see their agents’ proposal and reply. Only listed profile fields enter the discussion. Each member decides whether to send a human introduction. Background work runs while the local server is on and resumes from SQLite.
5. Create a **venture** from an experiment starter or guide suggestion. Invite collaborators with a single-use code. Review shared tasks and a working agreement. Each participant accepts their own revision. Record evidence, choose a review date, and continue, revise, pause or finish.
6. Use **Pricing** to explore labor, materials, fees, overhead, and break-even volume. **Records** accepts reviewed cash entries, receipt attachments and CSV imports. Estimates and accepted records remain separate. Export CSV for accounting review.
7. In **Public profile**, the owner approves a versioned export of customer information. Test customer questions against only that package, then use the link to OpenAI’s Business Hub setup. The application records local approval. External verification, claiming, publication and payments are outside this pilot.

## Sophie’s temporary story

Open `/#sophie` and choose **Enter as Sophie** for a fictional walkthrough available until November 18, 2026 at 20:00 in Taipei. Each browser gets a separate short-lived demo session. Sophie wants to open a pet care store. Her written and spoken guide can draw on Harry’s recorded experiences from five years running a flower shop. After three substantive exchanges, the guide offers a practice introduction to Harry. Drafts stay in the demo. Exiting deletes that visit’s transcript. The demo cookie never grants access to a real member workspace.

## Conversation memory

Your private founder conversation stores both typed and spoken turns. **New conversation** starts a fresh thread and keeps earlier turns searchable in **Conversation history**. You can save a passage from either speaker as a reference or review it as a standing instruction.

When memory is enabled, the guide can extract references from your own words and suggest instructions. In **My profile → Conversation memory**, review an instruction to activate it, inspect its source, edit a memory or forget it. The personal text and voice guides use approved instructions, saved references and eligible earlier passages. Team guides, member-to-member guide discussions and the public customer preview use their own contexts. Earlier turns recorded before conversation indexing are available for manual selection. Clearing founder history deletes the transcripts; selected memory excerpts can be forgotten separately.

Members can use **Share an experience** on a profile fact or member-authored reference. The owner reviews the exact topic and excerpt that other signed-in founder guides may consult. The lookup excludes the requesting member and blocked relationships, and returns only matching shared excerpts and dates. Text replies identify which excerpts were used. The live voice guide looks up shared experiences as the spoken topic changes and identifies evidence consulted during the call. Editing or forgetting the source invalidates its shared copy. Withdrawal stops subsequent lookups; previously delivered replies may still contain a paraphrase.

## AI and storage

- [GPT-6.1 Terra](https://developers.openai.com/api/docs/models/gpt-6.1-terra) runs at high reasoning effort through Responses for text. The founder guide can consult official sources for US operating questions. Suggestions become changes only through the member’s review controls.
- [Decisions](https://developers.openai.com/api/docs/guides/decisions) uses `gpt-6-luna` to classify the next step for a venture.
- [GPT-Live](https://developers.openai.com/api/docs/guides/voice-webrtc) uses `gpt-live-1` over WebRTC. The server exchanges the SDP offer and returns the answer. The browser never receives the project key.
- SQLite stores member accounts, private notes and conversations, venture memberships, agreements, reviewed records, and approved public versions in `.data/workbench.sqlite`. Session cookies are HTTP-only. Passphrases use salted scrypt hashes. Personal, team and customer requests are scoped separately.
- A live API error is visible and does not substitute fabricated responses. The directory samples and experiment starters remain available.
- For an isolated run, set `PORT` and `SECOND_ACT_DB` (a file path or `:memory:`). Tests run with an in-memory database and do not need a key.

## Verify

```sh
npm test
```

The suite exercises money calculations, CSV parsing, member isolation, introductions, shared venture access, agreement revisions, records, host moderation, private/public context boundaries, and same-origin API enforcement.

Fonts are self-hosted under the SIL Open Font License. Icon artwork is from Lucide. The workshop hero is original generated artwork. Other workshop images come from the supplied Second Act storyboard.


## Sites deployment

The hosted version uses ChatGPT sign-in, the `DB` D1 binding, and the encrypted `OPENAI_API_KEY` runtime secret. Source and deploy archives exclude local member data and environment files. Run `npm ci` and `npm run build` to bundle the shared application routes and public assets into the Worker. The Sites archive includes the schema migration from `drizzle/`.

Hosted memory and guide exchanges are queued in D1. Requests start eligible jobs with `waitUntil`, and subsequent visits resume pending work. Site access controls determine which members can sign in.
