# Seed data bible

All seed meetings belong to the demo account, **Jordan Lee (VP Product, Fieldnote)**.
Fieldnote makes field-service software for HVAC, plumbing and electrical companies: a web
dispatch board for office staff and a mobile app for technicians. About 120 employees.
Today is early October 2026.

Seed transcripts are scripted (this is stated in the README) and voiced with macOS TTS.
They should read like a real recorded call, not a screenplay.

## Transcript file format

Plain text, one spoken turn per line: `Name: what they said`. First names only, exactly
as listed in the cast. No stage directions, no blank lines, no markdown, no timestamps.
A turn is usually 1–4 sentences. Occasional long turns (a presenter walking through
numbers) can run 6–8 sentences. Mix in short replies ("Yeah.", "Right, makes sense.",
"Sorry, go ahead.").

Speech style: contractions, natural hedges, people building on each other, the odd
interruption or correction ("sorry, I mean October 27th, not the 20th"). Use fillers
sparingly; the audio is TTS, so a few "um"s are fine but not every line. Write numbers
the way a transcript shows them: "$14.2 million", "38%", "4.8 seconds", "October 27th",
"p95". Avoid symbols that TTS can't read (no "~", "→", "&", "/" between words, no emoji).

Make action items explicit when they happen in conversation, with a clear owner and date,
e.g. "Priya, can you send Karen the criteria by Friday?" / "Yep, I'll have it to her by
Friday." The AI summary and action items are generated from these transcripts later, so
the decisions, numbers and owners must actually be said out loud.

## Meeting 1: Q4 Planning: Product & Engineering (Tue Sep 29 2026, 10:00, 60 min, 8 people)

Cast (name, role, TTS voice, how they talk):
- **Jordan** Lee: VP Product, runs the meeting. Warm, keeps time, summarises. (Samantha)
- **Daniel** Mercer: VP Engineering. Dry British humour, careful about capacity and risk. (Daniel)
- **Priya** Raman: Engineering Manager, Mobile. Direct, owns the offline-mode slip honestly. (Tara)
- **Rishi** Kapoor: Staff Engineer, Platform. Precise, numbers-heavy, a bit blunt. (Rishi)
- **Moira** Byrne: Head of Design. Pushes on user experience, asks "what does the tech actually see?" (Moira)
- **Karen** Walsh: Head of Customer Success. Speaks for customers, cites specific accounts. Joins about a minute late. (Karen)
- **Aman** Sethi: PM, Billing and Pricing. Enthusiastic, slightly over-prepared, has a deck. (Aman)
- **Tessa** van der Merwe: Data and Analytics lead. Calm, corrects numbers, models scenarios. (Tessa)

Target length is about 10,500 spoken words in total. Chapter word targets are below.

### Ch1. Kickoff and agenda (0–5 min, ~800 words)
Small talk as people join (someone's audio, weekend, coffee). Karen joins late and apologises
(a customer call ran over). Jordan sets the agenda: Q3 by the numbers, mobile offline mode,
pricing and packaging, infra cost, the Acme escalation and enterprise readiness, hiring,
then recap. Q4 themes: ship offline mode, new pricing, cut infra cost, be enterprise-ready.
Jordan says she'll recap decisions and owners at the end, and asks people to keep it tight.

### Ch2. Q3 by the numbers (5–14 min, ~1,550 words)
Tessa presents. ARR ended Q3 at $14.2 million, up 9% quarter on quarter against a 12% target.
Net revenue retention 104% (target 110%). SMB logo churn 2.1% monthly. Activation went from
38% to 44% after onboarding v1 shipped in August. Mobile crash-free sessions 99.1%.
Discussion of why NRR missed: SMB downgrades, shops cutting seats after summer peak (HVAC is
seasonal). Karen adds colour: three named small customers downgraded (make up plausible
names, e.g. "Bayside Plumbing"). Moira asks whether activation gain came from the checklist or
the sample data; Tessa says mostly sample data, 60/40. Daniel jokes about the dashboards.
Jordan: the activation win is the thing to double down on.

### Ch3. Mobile offline mode (14–24 min, ~1,750 words)
Priya: offline mode was due October 15th; it's slipping. Root cause: sync conflict resolution
when two people edit the same job (tech offline in a basement, dispatcher edits the job).
Options: (A) wait and ship full offline editing November 12th, or (B) ship read-only offline
first (job details, customer history, photos queued for upload) on October 27th to a beta.
Moira on the conflict UX: what does the tech see when their edit loses? Daniel worried about QA
coverage and asks for a kill switch. Karen: customers mostly need to *see* the job in a
basement, editing can wait. **Decision: ship read-only offline to a beta of 20 customers on
October 27th, full offline editing targeted November 12th, behind a feature flag.**
Actions: **Priya sends Karen beta customer criteria by Friday October 2nd**; **Moira delivers
conflict-resolution designs by October 9th**; **Daniel makes sure QA has a device lab plan
for offline before the beta**.

### Ch4. Pricing and packaging (24–35 min, ~1,900 words)
Aman presents. Today: per-seat at $39 per technician per month. Proposal: three tiers.
Starter $29 per tech (up to 5 techs, no API access), Pro $49 per tech (API, integrations,
advanced reporting), Enterprise custom (SSO, audit logs, dedicated CSM). Tessa's model: 18% of
current accounts would pay more; net effect +6% ARR over 12 months if churn stays flat.
Karen pushes back hard: small shops are the ones churning already. Debate on grandfathering.
Moira: the pricing page needs to make Starter not feel like a trap. **Decision: grandfather
existing customers on current pricing for 12 months; new pricing for new signups from
November 1st.** Open question parked: whether SSO belongs in Pro or Enterprise only.
**Jordan will decide after talking to three customers**, by October 14th. Actions: **Aman and
Moira finalise pricing page copy by October 16th**; **Tessa builds a revenue impact dashboard by
October 9th**.

### Ch5. Infra cost (35–45 min, ~1,750 words)
Rishi: AWS bill is $186,000 a month, up 31% year on year. Biggest items: oversized Postgres on
RDS, and logging (Datadog is $41,000 a month on its own). Plan: sample debug logs, move cold
logs to S3, right-size the database, buy reserved instances. Target saving $45,000 a month by
end of Q4. Daniel: winter is peak season for HVAC (heating calls in December); no risky changes
then. **Decision: infra change freeze from December 1st to January 5th.** Tessa asks whether the
analytics replica is affected (it is; Rishi will keep it). Actions: **Rishi writes the migration
RFC by October 7th**; **Daniel approves the reserved instance purchase this week**.

### Ch6. Acme escalation and enterprise readiness (45–53 min, ~1,450 words)
Karen: Acme Mechanical, the largest customer ($310,000 ARR, 400 technicians), escalated: the
dispatch board is slow at the 7am peak, and their renewal on January 31st requires SSO (SAML).
Rishi: board load p95 is 4.8 seconds at peak; cause is an N+1 query on job assignments plus no
caching. **Commitment: performance fix by October 23rd, target p95 under 1.5 seconds. SAML SSO by
December 15th.** Daniel: capacity is the problem; trade-off is pushing the customer portal project
to Q1. Jordan agrees: **customer portal moves to Q1.** Actions: **Karen schedules an exec call
with Acme next week**; **Rishi owns the perf fix**; Daniel to name an SSO owner by Friday.

### Ch7. Hiring, recap and wrap (53–60 min, ~1,300 words)
Daniel: four open reqs: two mobile engineers, one SRE, one product designer. Moira wants the
designer now; Daniel suggests holding until pricing lands; they agree the designer req stays
open (Moira has a strong candidate, Nadia, interviewing this week). Jordan recaps every decision
and owner from chapters 3–6, in order, briefly. Next check-in October 13th. Light banter to
close (someone's dog, "see you all Thursday"). Ends naturally.

## Meetings 2–6 (shorter)

2. **Discovery call: Halcyon Home Services** (Thu Oct 1 2026, 14:00, ~12 min, ~1,900 words).
   Cast: **Marcus** Bell (Account Executive, Fieldnote; Daniel), **Linda** Ortiz (Director of
   Operations, Halcyon; Karen), **Jordan** (joins for product questions; Samantha). Halcyon: 60
   technicians across HVAC and plumbing in Phoenix, running dispatch on spreadsheets and a
   whiteboard, trialled a big competitor and found it too complex. Pain: double-booked techs,
   no visibility of where techs are, invoices delayed 9 days on average. Budget approved for
   Q1, decision by mid-December, Linda plus the owner and the CFO decide. Asks about offline
   mode and QuickBooks sync. Next steps: tailored demo on October 8th with the owner; Marcus
   sends the security questionnaire and pricing by Monday; Jordan sends offline beta info.

3. **1:1: Jordan and Aman** (Fri Oct 2 2026, 09:30, ~8 min, ~1,300 words). Cast: **Jordan**
   (Samantha), **Aman** (Aman). How the pricing review landed; Aman felt Karen's pushback was
   personal; Jordan reframes it and suggests a pre-read with Karen before the next one. Aman
   wants to lead the Enterprise tier launch; Jordan says yes if the pricing page ships on time.
   Aman to set up a 30-minute sync with Karen this week. Jordan to share the SSO customer-call
   notes with Aman.

4. **Mobile standup** (Thu Oct 1 2026, 09:15, ~5 min, ~800 words). Cast: **Priya** (Tara), **Wei**
   (iOS engineer; Rishi), **Sofia** (Android engineer; Tessa), **Ben** (QA; Daniel), **Jordan**
   (mostly listening; Samantha). Yesterday/today/blockers for offline read-only mode: photo
   upload queue, SQLite schema migration, device lab. Blocker: Ben needs three older Android
   devices; Priya will order them today. Wei found a crash on iOS 17 when the cache is cold.

5. **Interview: Senior Product Designer (Nadia Hussain)** (Wed Sep 30 2026, 15:00, ~10 min,
   ~1,600 words). Cast: **Moira** (Moira), **Jordan** (Samantha), **Nadia** (candidate; Tara).
   Portfolio walk-through: redesigned a logistics driver app, offline-first, cut task time 22%.
   Jordan asks about working with PMs under pressure; Moira asks a whiteboard-style question
   about the offline conflict screen. Nadia asks good questions back. Wrap with next steps:
   reference checks, decision by October 7th.

6. **Acme Mechanical: exec sync** (Fri Oct 2 2026, 11:00, ~10 min, ~1,600 words). Cast:
   **Karen** (Karen), **Jordan** (Samantha), **Rishi** (Rishi), **Greg** Thompson (COO, Acme;
   Daniel), **Helen** Park (IT lead, Acme; Moira). Follows up on the escalation from the Q4
   planning meeting. Greg is frustrated but fair: dispatchers wait at 7am. Rishi explains the
   fix and commits to October 23rd and under 1.5 seconds. Helen asks about SAML with Okta, SCIM
   (not in scope for December, maybe Q1). Agreement: weekly status email from Karen every
   Friday; Helen sends their Okta metadata; renewal conversation in early January.
