/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module GenerateDailyNotes
 * @description Generates deterministic synthetic daily journal notes for the test vault.
 *
 * This script creates one note per day for the configured date range, applies realistic
 * completeness variability, and weaves a consistent persona across professional, family,
 * golf, tennis, and travel storylines.
 *
 * @example
 * ```bash
 * node scripts/generate-daily-notes.mjs
 * ```
 *
 * @since 0.0.14
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** @type {Date} */
const START_DATE = new Date("2025-10-01T00:00:00");
/** @type {Date} */
const END_DATE = new Date("2026-02-21T00:00:00");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DAILY_NOTES_DIR = path.resolve(__dirname, "..", "test-vault", "Daily Notes");

const MOOD_OPTIONS = [
  "focused",
  "grateful",
  "energized",
  "steady",
  "reflective",
  "optimistic",
  "calm",
  "driven",
  "content",
  "tired-but-positive",
];

const ENERGY_OPTIONS = ["high", "medium", "low"];

const MORNING_INTENTIONS_POOL = `
Protect two deep-work blocks for Atlas v3.0 architecture decisions before lunch.
Give Marcus clear guidance on API reliability priorities and remove blockers quickly.
Prepare for the board narrative: momentum, risks, and the hiring plan for VP Sales.
Coach Priya on sequencing GA milestones without burning out the engineering team.
Push for a crisp customer story before tomorrow's Axiom Health steering call.
Keep meetings short and protect thinking time for Series B diligence responses.
Model calm execution even when timelines feel tight.
End the day feeling present at home, not still mentally in Slack.
Be deliberate with hiring signals so the VP Sales process stays high quality.
Create clarity for Tom on enterprise deal qualification criteria.
Review Liz's product brief with an eye on adoption friction.
Focus on one strategic decision that compounds over the next quarter.
Keep communication simple: one page, three priorities, no noise.
Spend 30 minutes preparing better questions for Richard before the board check-in.
Choose progress over perfection on Atlas migration docs.
Stay patient in hard conversations and keep the team aligned on outcomes.
Move one long-standing decision from "discussing" to "decided".
Block distraction and finish the Axiom Health pilot success criteria.
Delegate aggressively so I can stay in the highest-leverage lane.
Protect family dinner and keep my phone away from the table.
Start with a rainy Bellevue walk with Benson and a strong coffee.
Use the ferry mindset: slower pace, clear horizon, steady hand.
Get outside even if it's drizzling; movement helps me think better.
Practice a compact backhand finish tonight at Bellevue Club.
Do one mobility session so golf and tennis don't feel stiff this weekend.
Leave room for Emma's science fair updates after school.
Show up for Jake's soccer prep with full attention.
Keep Saturday open for a Sahalee round with Dave if weather cooperates.
Book indoor court time early before winter slots disappear.
Use Palm Springs trip planning as motivation during Seattle gray.
Treat weather as texture, not an excuse.
Ask one better question in every leadership conversation today.
Anchor the day with priorities, not urgency.
Keep writing concise follow-ups after every key meeting.
Turn feedback into a specific experiment this week.
Protect momentum on Atlas beta readiness metrics.
Review customer notes before making roadmap tradeoffs.
Follow through on budget decisions instead of punting them.
Be explicit about ownership on every action item.
Keep my tone steady even when the pace is high.
Practice serve toss consistency for 15 minutes tonight.
Get to bed earlier so tomorrow starts clean.
Use the morning to think strategically before reactive work begins.
Check in with Priya and Marcus together to avoid crossed signals.
Give Tom support on executive sponsor outreach.
Prioritize decisions that unblock three other decisions.
Make room for gratitude before the day gets noisy.
Treat every interruption as a chance to improve the system.
Keep one eye on Q1 board prep while finishing today's commitments.
Draft a tighter narrative for Atlas GA launch readiness.
Maintain discipline on follow-through after meetings.
Keep the team focused on customer outcomes, not feature count.
Revisit my handicap goal and commit to cleaner short-game reps.
Plan a quick family outing between rain bands this weekend.
Spend five quiet minutes before calls to reset my attention.
Ship clarity to the org: what matters most today and why.
Leave Bellevue Club feeling smoother on serve rhythm.
Bring curiosity into difficult conversations, not defensiveness.
Make today a compounding day in both work and family life.
`
  .trim()
  .split("\n");

const GRATITUDE_POOL = `
Sarah's steady support when calendar pressure spikes.
Emma's thoughtful questions about science and how things work.
Jake's pure joy after a good soccer practice.
Benson waiting by the door for rainy walks anyway.
A quiet coffee before sunrise in Bellevue.
The team staying resilient through Atlas v3.0 complexity.
Marcus stepping up on incident communication.
Priya bringing calm technical rigor to hard tradeoffs.
Tom's persistence in late-stage enterprise conversations.
Liz protecting product quality while moving fast.
Richard's blunt but useful board feedback.
Axiom Health's candid pilot feedback that improves the product.
TerraForge being willing design partners.
Nexus Financial trusting us with meaningful workflows.
A clean stretch of deep work with no context switching.
PNW rain on the windows making home feel cozy.
Sahalee fairways even when they're wet and heavy.
Dave always making competitive rounds fun.
Indoor courts at Bellevue Club during stormy weeks.
Mike's doubles chemistry and positive energy.
The chance to build something that matters with people I respect.
Family dinners that reset the day.
Weekend ferry views toward the San Juans.
Cascades trails that clear my head.
Emma practicing lines for her school play.
Jake grinding through drills before soccer finals.
A good putting session that finally clicked.
Birdie opportunities earned by patience.
Palm Springs sunshine in the middle of winter.
A smooth travel day with no surprises.
Teammates who own outcomes without drama.
Honest conversations that avoid future confusion.
Progress that came from consistency, not heroics.
A calendar block that stayed protected for strategy.
Health and energy to keep showing up.
Seattle mornings that start gray but still feel full of possibility.
A text from Sarah that made me laugh between meetings.
Kids helping each other without being asked.
A cleanly run board prep session.
The privilege of coaching people into bigger roles.
Time outdoors with Benson even on wet days.
A strong second set after a shaky start.
A drive that finally found the center line.
Lessons from rounds that did not go as planned.
Supportive clients who collaborate instead of dictate.
`
  .trim()
  .split("\n");

const DAILY_LOG_PROFESSIONAL_POOL = `
Ran Atlas v3.0 stand-up with Marcus and Priya; reliability work is now clearly sequenced.
Reviewed Liz's latest onboarding flow for Atlas and tightened activation success metrics.
Met Tom to refine enterprise pipeline assumptions before QBR.
Drafted Series B diligence responses and aligned data room updates.
Worked through board deck framing with Richard's prior feedback in mind.
Held 1:1s focused on delegation and role clarity across leadership.
Set Axiom Health pilot checkpoint goals and owners.
Reviewed TerraForge integration feedback and prioritized API improvements.
Connected with Nexus Financial stakeholders on rollout timing risks.
Reworked GA cutline to protect quality over calendar optimism.
Interviewed a VP Sales candidate and clarified what success looks like in first 90 days.
Aligned engineering and product on Atlas migration sequencing.
Escalated one scope concern early to avoid silent drift.
Cleaned up action items from leadership sync and assigned single-threaded owners.
Prepared Q1 board prep notes while decisions were still fresh.
Held pricing conversation tied to customer value proof points.
Reviewed budget tradeoffs for hiring vs. contractor backfill.
Closed a loop on customer-reported friction in admin setup.
Documented launch criteria so teams stop debating definitions.
Protected deep work to write a clearer internal strategy memo.
Checked weekly metrics and flagged two leading indicators worth attention.
Updated recruiting scorecard for VP Sales process consistency.
Collaborated with Priya on incident response drills for Atlas services.
Shared a concise Friday update to reduce weekend uncertainty.
`
  .trim()
  .split("\n");

const DAILY_LOG_PERSONAL_POOL = `
Walked Benson in steady drizzle before breakfast; Bellevue looked silver and quiet.
Made pour-over coffee and watched the rain roll through the trees.
Helped Emma rehearse for school activities and she looked more confident.
Got Jake to soccer with enough time for warm-up and extra touches.
Family dinner stayed device-free and conversation was genuinely good.
Took a quick neighborhood walk with Sarah after the kids were down.
Did a short mobility routine to keep hips and shoulders happy.
Read with Jake before bed and stretched the day in a good way.
Reviewed Emma's project notes and helped tighten her presentation flow.
Ran errands between rain bursts and still squeezed in quality family time.
Spent an hour planning upcoming family travel logistics with Sarah.
Used the afternoon for recovery and reset instead of forcing productivity.
Caught a sunset break in the clouds over Bellevue unexpectedly.
Talked with Sarah about balancing launch pressure and home presence.
Took the ferry route in my head while planning a San Juans weekend.
Built Lego with Jake and lost track of time in the best way.
Spent quiet evening time planning spring hiking goals in the Cascades.
Kept Sunday intentionally light and restorative.
`
  .trim()
  .split("\n");

const DAILY_LOG_GOLF_POOL = `
Played Sahalee with Dave in light rain; carded an 87 and salvaged a birdie on 14.
Sahalee fairways were soggy but manageable; 89 today with better wedges than expected.
Grinding through winter lies at Sahalee paid off with cleaner contact on back nine.
Short game session at Sahalee practice area improved distance control from 40-60 yards.
Posted 86 at Sahalee and felt handicap trend moving the right way.
Wet greens made lag putting tricky; still kept doubles off the card for a solid 88.
Birdie on a par 5 after patient course management felt like real progress.
Rain gloves were mandatory and worth it; swing stayed stable despite weather.
Focused on tempo instead of speed and hit more fairways than last weekend.
Scored 85 with Dave keeping me honest on every pre-shot routine.
Palm Springs round at PGA West: desert lines were firm and fast, shot 84.
Desert Willow morning round delivered perfect conditions and two birdies.
Escena played wide but windy; controlled ball flight better than expected.
Indian Wells member-guest prep round sharpened approach distances.
`
  .trim()
  .split("\n");

const DAILY_LOG_TENNIS_POOL = `
Tuesday doubles at Bellevue Club with Mike: won 6-4, 6-3 by holding net pressure.
Thursday league night indoors; split sets and won super tiebreak 10-7.
Serve rhythm improved after focusing on toss height consistency.
Backhand crosscourt depth held up well in long rallies tonight.
USTA PNW league opener felt sharp: 6-3, 6-4 with disciplined shot selection.
Dropped first set but adjusted return position and turned match around.
Indoor court pace was quick; shortened backswing and reduced unforced errors.
Worked on second-serve spin and confidence improved immediately.
Mike and I communicated better at the net and closed cleaner.
Weekend doubles tournament run ended in semis after a tight 7-6 third set.
Recovery session focused on shoulder stability before next match.
Palm Springs hit on outdoor hard courts translated well after indoor stretch.
Practiced backhand down-the-line pattern for point construction.
Kept points patient and waited for high-percentage finishing balls.
`
  .trim()
  .split("\n");

const DAILY_LOG_PNW_POOL = `
Seattle rain was relentless today, but the routine still felt grounded.
The gray morning made coffee taste better and focus come easier.
Cascades were hidden behind cloud but still calling for a weekend hike.
A quick ferry view mentally reset me before afternoon meetings.
Bellevue roads were slick; slowed down and stayed unhurried.
Cold drizzle all day, perfect excuse for indoor court and warm soup.
Cloud breaks near sunset brought a surprising lift in energy.
PNW winter rhythm: wet shoes, strong coffee, steady progress.
Used a rain break for a short neighborhood loop with Benson.
Misty morning gave way to a crisp, bright late afternoon.
Seattle traffic was heavy, so I used commute time to think through priorities.
The cedar smell after rain made the evening walk worth it.
`
  .trim()
  .split("\n");

const TASK_POOL_WORK = `
Finalize Atlas v3.0 GA readiness checklist #work #atlas
Review VP Sales candidate scorecards with recruiting #work #hiring
Send Axiom Health pilot update with milestones #work #customer
Draft board pre-read outline for Richard #work #board
Confirm Priya's reliability budget proposal #work #engineering
Close Tom's open pricing assumptions doc #work #sales
Review Liz's activation funnel experiment results #work #product
Prepare Series B legal docs follow-up list #work #series-b
Schedule leadership retro for sprint learnings #work
Tighten Nexus Financial rollout plan risks #work #customer
Approve TerraForge integration test timeline #work #customer
Write weekly CEO update note to leadership #work
Clean up Atlas metrics dashboard definitions #work #atlas
Align support escalation path for beta users #work #ops
Confirm hiring plan for Q1 growth roles #work #hiring
Review security posture summary for board appendix #work #board
Prepare customer advisory council discussion prompts #work
Update product-market fit evidence slide #work #series-b
Finalize launch communications draft #work #atlas
Follow up with Marcus on incident drill action items #work #engineering
Refine enterprise qualification rubric with Tom #work #sales
Review burn multiple assumptions in finance model #work #series-b
Send thank-you notes to candidate panelists #work #hiring
Document GA cutline decisions and owners #work #atlas
Audit meeting cadence and remove low-value syncs #work
Confirm legal review timeline for key contract #work
Prepare Q1 OKR draft with leadership inputs #work
Write concise summary of customer interview themes #work #product
Plan offsite agenda for leadership alignment #work
Update board tracker with latest milestones #work #board
Escalate unresolved integration dependency #work #atlas
Check deployment rollback runbook completeness #work #engineering
`
  .trim()
  .split("\n");

const TASK_POOL_PERSONAL = `
Book Bellevue Club court for Thursday doubles with Mike #personal #tennis
Schedule short-game practice at Sahalee with Dave #personal #golf
Order rain gloves before weekend round #personal #golf
Plan Palm Springs tee times for long weekend #personal #travel
Pack kids gear for Big Bear ski trip #family #travel
Help Emma rehearse science fair presentation #family
Review Jake's soccer tournament schedule #family
Plan date night with Sarah in Seattle #family
Book ferry day trip window for San Juans planning #personal
Do 20-minute mobility routine before bed #health
Replace worn tennis overgrips #personal #tennis
Set reminder for dog vet check for Benson #family
Prep car for mountain drive conditions #travel
Buy birthday gift for Jake #family
Confirm holiday dinner grocery list with Sarah #family
Read 20 pages before sleep #personal
Plan Cascades day hike logistics #personal #outdoors
Book indoor lesson for backhand technique #tennis
Practice serves: 40 focused reps #tennis
Track handicap trend in golf notebook #golf
Plan Sunday family brunch #family
Pick up winter layers for kids #family
Set up ski rental pickup for Big Bear #travel
Organize garage bins before holiday break #home
Clean and re-grip wedges #golf
Confirm Presidents' Day Palm Springs flights #travel #golf
Pack recovery tools for travel week #health
Plan weekend board game night with kids #family
Schedule haircut before board meeting trip #personal
Put devices away by 9:30 PM #health
`
  .trim()
  .split("\n");

const EVENING_REFLECTIONS_POOL = `
I created more clarity than urgency today, and the team responded well.
Delegation felt better when I was explicit about outcomes and constraints.
I let one meeting run long; next time I need a sharper agenda.
The best decision today was narrowing scope early instead of later.
I handled pressure better once I slowed down and wrote first.
I need to protect transitions between work and home more intentionally.
Atlas progress was incremental but meaningful.
Customer feedback improved the plan more than internal debate did.
I was proud of staying calm in a tense conversation.
I could have listened longer before jumping to solutions.
The kids noticed when I was truly present tonight.
A short walk reset my mood more than another cup of coffee.
Tennis footwork improved when I trusted small adjustment steps.
Golf patience paid off; course management beat forcing shots.
I rushed a few putts and gave away easy strokes.
The rainy weather tested discipline, and discipline mostly held.
Palm Springs sunshine reminded me how much environment shapes energy.
I did a better job balancing strategic and operational work today.
I still owe myself deeper thinking time on hiring strategy.
Conversations with Sarah helped put work stress in perspective.
Emma's curiosity is contagious and keeps me grounded.
Jake's resilience after mistakes reminded me to stay playful.
I finished the day grateful, even with unfinished tasks.
Tomorrow improves if I make fewer promises and complete more.
I learned that concise written decisions reduce repeat debate.
I learned my backhand is better when I keep the finish high.
I learned fatigue shows up first in my attention, not output.
I learned to ask one more clarifying question before committing.
I stayed aligned with values even under deadline pressure.
I could have reduced context switching by saying no sooner.
The team needed confidence, and calm specificity helped.
Series B momentum feels real, but execution still matters most.
I ended the day with enough energy left for family, which felt like a win.
I missed a chance to celebrate a small team victory publicly.
I made steady progress on priorities despite interruptions.
I should front-load hard thinking before midday meetings.
Being outdoors, even briefly, changed the tone of the day.
I want to carry this steadier pace into tomorrow.
The week feels heavy, but we're moving with purpose.
I executed the basics well: communicate, decide, follow through.
I need to improve recovery between intense days.
The Atlas storyline is getting clearer with each customer checkpoint.
I made fewer reactive decisions than yesterday.
I closed loops faster and felt less cognitive residue tonight.
`
  .trim()
  .split("\n");

const RELATED_LINKS_POOL = [
  "[[Atlas v3.0]]",
  "[[Series B Raise]]",
  "[[Axiom Health Pilot]]",
  "[[TerraForge Integration]]",
  "[[Nexus Financial Rollout]]",
  "[[Q1 Board Prep]]",
  "[[Marcus - VP Engineering]]",
  "[[Priya - CTO]]",
  "[[Tom - Sales]]",
  "[[Liz - Product]]",
  "[[Richard - Board]]",
  "[[Sahalee Country Club]]",
  "[[Palm Springs Golf Trip]]",
  "[[Indian Wells Golf Resort]]",
  "[[PGA West]]",
  "[[Escena Golf Club]]",
  "[[Desert Willow Golf Resort]]",
  "[[USTA PNW League]]",
  "[[Bellevue Club Tennis]]",
  "[[Big Bear Family Trip]]",
  "[[Bellevue Home]]",
  "[[San Juans Ferry Weekend]]",
  "[[Family Calendar]]",
  "[[Emma School Notes]]",
  "[[Jake Soccer Season]]",
];

const CARRY_FORWARD_TASKS_QUERY_BLOCK = `\`\`\`tasks
not done
created before today
path includes Daily Notes
sort by due
limit 8
\`\`\``;

const MONTHLY_ARCS = {
  "2025-10": {
    daily: [
      "Q4 kickoff cadence is set and Atlas v3.0 sprint priorities are finally crisp.",
      "VP Sales search remains active; top candidates now moving to final conversations.",
      "Emma's school play prep added a nice personal anchor to a high-output week.",
      "Jake's soccer finals weekend reminded me to celebrate effort over outcome.",
      "Cascades fall hike planning helped reset after long strategy sessions.",
    ],
    tasks: [
      "Finalize Q4 kickoff action tracker #work #atlas",
      "Debrief VP Sales panel feedback #work #hiring",
      "Block time for Series B narrative revisions #work #series-b",
      "Confirm Emma's school play logistics #family",
      "Pack rain gear for Sahalee weekend round #golf",
    ],
  },
  "2025-11": {
    daily: [
      "Atlas beta launch notes went out and Axiom Health pilot metrics started flowing.",
      "Board deck framing got sharper with clearer evidence and fewer claims.",
      "Jake's birthday week brought welcome joy during a dense launch month.",
      "Palm Springs escape from Seattle rain delivered sun and cleaner ball striking.",
      "Bellevue Club playoff matches were intense and energizing.",
    ],
    tasks: [
      "Review Atlas beta feedback digest #work #atlas",
      "Send pilot checkpoint summary to Axiom Health #work #customer",
      "Finalize board deck appendix charts #work #board",
      "Book Thanksgiving family plans #family",
      "Confirm Palm Springs tee sheet with Dave #golf #travel",
    ],
  },
  "2025-12": {
    daily: [
      "SF board meeting prep tightened around annual targets and execution risks.",
      "Year-end reviews surfaced strong growth in leadership bench.",
      "Budget decisions required discipline, tradeoffs, and clear communication.",
      "Big Bear ski trip gave the family a winter reset outside routine.",
      "Indoor tennis became the default as PNW rain intensified.",
    ],
    tasks: [
      "Finalize year-end review notes for direct reports #work",
      "Lock 2026 budget assumptions with finance #work",
      "Prepare SF board travel packet #work #board #travel",
      "Confirm Big Bear lodging details #family #travel",
      "Book Bellevue Club indoor court blocks #tennis",
    ],
  },
  "2026-01": {
    daily: [
      "New-year OKRs landed well after kickoff with leadership team.",
      "Atlas GA prep moved from planning mode into execution mode.",
      "Series B close-line momentum improved with stronger evidence.",
      "Indian Wells member-guest weekend with Dave was a winter highlight.",
      "Emma's science fair project reviews created fun evening focus.",
    ],
    tasks: [
      "Publish finalized 2026 OKRs to leadership channel #work",
      "Review Atlas GA launch runbook with Priya #work #atlas",
      "Close remaining Series B diligence items #work #series-b",
      "Coordinate Indian Wells itinerary with Dave #travel #golf",
      "Help Emma test science fair prototype #family",
    ],
  },
  "2026-02": {
    daily: [
      "Atlas GA launch comms and support coverage held together under pressure.",
      "Series B signature milestone boosted team confidence and hiring momentum.",
      "Q1 board prep started early to avoid last-minute narrative churn.",
      "Valentine's Day in Seattle was simple, warm, and exactly right.",
      "Presidents' Day Palm Springs trip with Sarah was a bright winter break.",
    ],
    tasks: [
      "Debrief Atlas GA launch lessons learned #work #atlas",
      "Draft team growth plan post-Series B #work #hiring",
      "Assemble Q1 board prep issue list #work #board",
      "Reserve Valentine's dinner in Seattle #family",
      "Confirm Escena couples tournament details #travel #golf",
    ],
  },
};

const SPECIAL_EVENTS = {
  "2025-10-18": {
    daily: ["Jake's soccer finals were intense and he played with real grit."],
    tasks: ["Celebrate Jake's soccer season with family dinner #family"],
    related: ["[[Jake Soccer Finals]]"],
  },
  "2025-10-24": {
    daily: ["Emma's school play tonight was a proud parent moment."],
    tasks: ["Print photos from Emma's school play #family"],
    related: ["[[Emma School Play]]"],
  },
  "2025-11-09": {
    daily: ["Jake's birthday weekend was full of cake, soccer, and chaos."],
    tasks: ["Send thank-you notes from Jake's birthday #family"],
    related: ["[[Jake Birthday]]"],
  },
  "2025-11-14": {
    daily: ["Flew to Palm Springs; traded Seattle rain for desert sun by lunch."],
    tasks: ["Unpack travel clubs and prep for PGA West morning tee time #golf #travel"],
    related: ["[[Palm Springs Golf Trip]]", "[[PGA West]]"],
  },
  "2025-11-15": {
    daily: ["PGA West round with Dave: shot 84 and hit three confident approach shots."],
    tasks: ["Log PGA West stats and update handicap tracker #golf"],
    related: ["[[PGA West]]", "[[Dave Golf Notes]]"],
  },
  "2025-11-16": {
    daily: ["Desert Willow twilight round felt effortless compared to soggy PNW rounds."],
    tasks: ["Book next Desert Willow round before return flight #golf #travel"],
    related: ["[[Desert Willow Golf Resort]]"],
  },
  "2025-11-17": {
    daily: ["Traveled back to Seattle; rain greeted us at SEA, still worth the reset."],
    tasks: ["Sync travel receipts and reset work priorities #travel"],
    related: ["[[Seattle Return]]"],
  },
  "2025-12-10": {
    daily: ["Board meeting in SF: clear progress, sharper asks, and good strategic debate."],
    tasks: ["Send SF board meeting follow-up to Richard #work #board"],
    related: ["[[SF Board Meeting]]"],
  },
  "2025-12-26": {
    daily: ["Drove to Big Bear with the family; mountain roads were slow but scenic."],
    tasks: ["Confirm ski lesson times for Emma and Jake #family #travel"],
    related: ["[[Big Bear Family Trip]]"],
  },
  "2025-12-27": {
    daily: ["First ski day in Big Bear: kids improved quickly and stayed fearless."],
    tasks: ["Book one more family ski session for tomorrow #family"],
    related: ["[[Big Bear Ski Day 1]]"],
  },
  "2025-12-28": {
    daily: ["Second day on the slopes; Sarah and I actually got a few quiet runs in."],
    tasks: ["Pack gloves and layers to dry overnight #family #travel"],
    related: ["[[Big Bear Ski Day 2]]"],
  },
  "2025-12-30": {
    daily: ["Returned to Bellevue from Big Bear and eased back into home rhythm."],
    tasks: ["Unpack ski gear and prep kids for school week #family"],
    related: ["[[Big Bear Return]]"],
  },
  "2026-01-16": {
    daily: ["Landed in Palm Springs for the Indian Wells member-guest weekend with Dave."],
    tasks: ["Confirm Indian Wells pairings and tee sheet #golf #travel"],
    related: ["[[Indian Wells Golf Resort]]"],
  },
  "2026-01-17": {
    daily: ["Indian Wells member-guest day one: steady tee game and improved putting pace."],
    tasks: ["Review round stats before tomorrow's matchups #golf"],
    related: ["[[Indian Wells Member-Guest]]"],
  },
  "2026-01-18": {
    daily: ["Closed the member-guest weekend with an 85 and one clean birdie look converted."],
    tasks: ["Update handicap tracker after Indian Wells weekend #golf"],
    related: ["[[Indian Wells Member-Guest]]"],
  },
  "2026-01-19": {
    daily: ["Back to Seattle from Palm Springs and straight into OKR follow-through."],
    tasks: ["Reprioritize week after travel day #work"],
    related: ["[[Seattle Return]]"],
  },
  "2026-02-03": {
    daily: ["Atlas GA launch day: team executed well and support queues stayed stable."],
    tasks: ["Share Atlas GA day-one recap with leadership #work #atlas"],
    related: ["[[Atlas GA Launch]]"],
  },
  "2026-02-06": {
    daily: ["Series B paperwork signed today; the milestone felt earned and energizing."],
    tasks: ["Send Series B thank-you notes to investors and team #work #series-b"],
    related: ["[[Series B Close]]"],
  },
  "2026-02-13": {
    daily: ["Flew to Palm Springs for Presidents' Day weekend; sunshine on arrival."],
    tasks: ["Check Escena couples tournament registration #travel #golf"],
    related: ["[[Presidents Day Palm Springs Trip]]"],
  },
  "2026-02-14": {
    daily: ["Played Escena couples tournament with Sarah and finished with a strong back nine."],
    tasks: ["Book Valentine's dinner after the tournament #family"],
    related: ["[[Escena Golf Club]]", "[[Valentine's Day]]"],
  },
  "2026-02-15": {
    daily: ["Desert Willow morning round, then light outdoor tennis before sunset."],
    tasks: ["Upload Palm Springs trip photos for the kids #family"],
    related: ["[[Desert Willow Golf Resort]]", "[[Palm Springs Tennis Session]]"],
  },
  "2026-02-16": {
    daily: ["Returned to Bellevue from Palm Springs and reset for launch follow-through."],
    tasks: ["Set first post-trip work block priorities #work"],
    related: ["[[Seattle Return]]"],
  },
};

/**
 * Formats a Date as YYYY-MM-DD.
 *
 * @param {Date} date - Date to format.
 * @returns {string} Formatted date string.
 * @example
 * ```js
 * formatDate(new Date("2026-01-05T00:00:00"));
 * // => "2026-01-05"
 * ```
 */
function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Adds days to a date and returns a new Date.
 *
 * @param {Date} date - Base date.
 * @param {number} days - Number of days to add (can be negative).
 * @returns {Date} Shifted date.
 * @example
 * ```js
 * addDays(new Date("2026-01-01"), 2); // 2026-01-03
 * ```
 */
function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Returns an array of dates inclusive of start and end.
 *
 * @param {Date} start - Inclusive start date.
 * @param {Date} end - Inclusive end date.
 * @returns {Date[]} Date list.
 * @example
 * ```js
 * dateRange(new Date("2026-01-01"), new Date("2026-01-03")).length;
 * // => 3
 * ```
 */
function dateRange(start, end) {
  const dates = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    dates.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

/**
 * Produces a deterministic 32-bit unsigned hash.
 *
 * @param {string} input - Input text.
 * @returns {number} Unsigned hash value.
 * @example
 * ```js
 * hashString("2026-01-01");
 * ```
 *
 * @internal
 */
function hashString(input) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Creates a seeded pseudo-random number generator.
 *
 * @param {number} seed - Unsigned integer seed.
 * @returns {() => number} RNG function returning a float in [0, 1).
 * @example
 * ```js
 * const rng = createRng(1234);
 * const sample = rng();
 * ```
 *
 * @internal
 */
function createRng(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Creates a deterministic RNG for a date and salt.
 *
 * @param {string} dateString - Date string in YYYY-MM-DD format.
 * @param {string} salt - Additional entropy key.
 * @returns {() => number} RNG function for this key.
 * @example
 * ```js
 * const rng = rngForDate("2026-01-10", "reflection");
 * ```
 */
function rngForDate(dateString, salt) {
  return createRng(hashString(`${dateString}::${salt}`));
}

/**
 * Picks one element from an array.
 *
 * @template T
 * @param {T[]} values - Values to sample.
 * @param {() => number} rng - RNG function.
 * @returns {T} Chosen value.
 * @throws {Error} If the array is empty.
 * @example
 * ```js
 * pickOne(["a", "b"], Math.random);
 * ```
 */
function pickOne(values, rng) {
  if (values.length === 0) {
    throw new Error("pickOne requires a non-empty array");
  }
  const index = Math.floor(rng() * values.length);
  return values[index];
}

/**
 * Picks unique values from an array.
 *
 * @template T
 * @param {T[]} values - Source values.
 * @param {number} count - Number of unique values to choose.
 * @param {() => number} rng - RNG function.
 * @returns {T[]} Unique sampled values.
 * @example
 * ```js
 * pickUnique([1, 2, 3, 4], 2, Math.random);
 * ```
 */
function pickUnique(values, count, rng) {
  if (count <= 0) {
    return [];
  }
  const copy = [...values];
  const result = [];
  const limit = Math.min(count, copy.length);
  for (let index = 0; index < limit; index += 1) {
    const pickIndex = Math.floor(rng() * copy.length);
    result.push(copy[pickIndex]);
    copy.splice(pickIndex, 1);
  }
  return result;
}

/**
 * Evaluates a deterministic probability.
 *
 * @param {number} probability - Probability in [0, 1].
 * @param {() => number} rng - RNG function.
 * @returns {boolean} True when event occurs.
 * @example
 * ```js
 * chance(0.25, Math.random);
 * ```
 */
function chance(probability, rng) {
  return rng() < probability;
}

/**
 * Checks whether a date is a weekend.
 *
 * @param {Date} date - Date to inspect.
 * @returns {boolean} True for Saturday or Sunday.
 * @example
 * ```js
 * isWeekend(new Date("2026-02-14"));
 * // => true
 * ```
 */
function isWeekend(date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

/**
 * Returns month key in YYYY-MM format.
 *
 * @param {Date} date - Date to format.
 * @returns {string} Month key.
 * @example
 * ```js
 * monthKey(new Date("2026-01-20"));
 * // => "2026-01"
 * ```
 */
function monthKey(date) {
  return formatDate(date).slice(0, 7);
}

/**
 * Determines note completeness profile.
 *
 * @param {Date} date - Date for the note.
 * @returns {"full"|"most"|"partial"|"sparse"} Completeness bucket.
 * @example
 * ```js
 * determineCompleteness(new Date("2026-01-08"));
 * ```
 */
function determineCompleteness(date) {
  const dateString = formatDate(date);
  const rng = rngForDate(dateString, "completeness");
  const sample = rng();

  if (isWeekend(date)) {
    if (sample < 0.13) {
      return "full";
    }
    if (sample < 0.43) {
      return "most";
    }
    if (sample < 0.80) {
      return "partial";
    }
    return "sparse";
  }

  if (sample < 0.16) {
    return "full";
  }
  if (sample < 0.51) {
    return "most";
  }
  if (sample < 0.86) {
    return "partial";
  }
  return "sparse";
}

/**
 * Determines which sections get substantive content.
 *
 * @param {Date} date - Date for the note.
 * @param {"full"|"most"|"partial"|"sparse"} completeness - Completeness profile.
 * @returns {{morning:boolean, gratitude:boolean, daily:boolean, carryForward:boolean, newTasks:boolean, evening:boolean, related:boolean}} Section plan.
 * @example
 * ```js
 * determineSectionPlan(new Date("2026-01-04"), "partial");
 * ```
 */
function determineSectionPlan(date, completeness) {
  const dateString = formatDate(date);
  const weekend = isWeekend(date);
  const rng = rngForDate(dateString, "section-plan");

  const plan = {
    morning: false,
    gratitude: false,
    daily: false,
    carryForward: false,
    newTasks: false,
    evening: false,
    related: false,
  };

  if (completeness === "full") {
    return {
      morning: true,
      gratitude: true,
      daily: true,
      carryForward: true,
      newTasks: true,
      evening: true,
      related: true,
    };
  }

  if (completeness === "most") {
    plan.morning = true;
    plan.daily = true;
    plan.newTasks = true;

    const optionalWeekend = ["gratitude", "evening", "related", "carryForward"];
    const optionalWeekday = ["carryForward", "gratitude", "evening", "related"];
    const optional = weekend ? optionalWeekend : optionalWeekday;
    const selected = pickUnique(optional, 2, rng);
    for (const key of selected) {
      plan[key] = true;
    }
    return plan;
  }

  if (completeness === "partial") {
    const target = chance(0.5, rng) ? 3 : 2;
    const personalBias = ["morning", "daily", "gratitude", "related", "evening", "newTasks"];
    const workBias = ["daily", "newTasks", "morning", "carryForward", "related", "evening"];
    const selected = pickUnique(weekend ? personalBias : workBias, target, rng);
    for (const key of selected) {
      plan[key] = true;
    }
    return plan;
  }

  if (weekend) {
    plan.morning = true;
    if (chance(0.3, rng)) {
      plan.related = true;
    }
  } else if (chance(0.55, rng)) {
    plan.newTasks = true;
  } else {
    plan.morning = true;
  }

  return plan;
}

/**
 * Determines whether mood/energy should be included.
 *
 * @param {string} dateString - Date key.
 * @param {"full"|"most"|"partial"|"sparse"} completeness - Completeness profile.
 * @returns {boolean} Whether to include mood and energy in frontmatter.
 * @example
 * ```js
 * shouldIncludeMoodEnergy("2026-01-03", "partial");
 * ```
 */
function shouldIncludeMoodEnergy(dateString, completeness) {
  const rng = rngForDate(dateString, "mood-energy");
  if (completeness === "full" || completeness === "most") {
    return true;
  }
  if (completeness === "partial") {
    return chance(0.45, rng);
  }
  return chance(0.18, rng);
}

/**
 * Renders YAML frontmatter.
 *
 * @param {string} dateString - Note date.
 * @param {"full"|"most"|"partial"|"sparse"} completeness - Completeness profile.
 * @returns {string} YAML frontmatter block.
 * @example
 * ```js
 * const yaml = renderFrontmatter("2026-01-01", "full");
 * ```
 */
function renderFrontmatter(dateString, completeness) {
  const includeMoodEnergy = shouldIncludeMoodEnergy(dateString, completeness);
  const status = completeness === "full" || completeness === "most" ? "complete" : "in-progress";

  const rngMood = rngForDate(dateString, "mood");
  const rngEnergy = rngForDate(dateString, "energy");

  const frontmatter = [
    "---",
    `creation-date: ${dateString}`,
    `modified-date: ${dateString}`,
    "tags: [journal, daily]",
    `status: ${status}`,
    "type: daily",
    "agent: [[daily-journal.agent]]",
  ];

  if (includeMoodEnergy) {
    frontmatter.push(`mood: ${pickOne(MOOD_OPTIONS, rngMood)}`);
    frontmatter.push(`energy: ${pickOne(ENERGY_OPTIONS, rngEnergy)}`);
  }

  frontmatter.push("---");
  return frontmatter.join("\n");
}

/**
 * Returns arc and event pools for a given date.
 *
 * @param {Date} date - Note date.
 * @returns {{monthArc: {daily:string[], tasks:string[]} | undefined, event: {daily?:string[], tasks?:string[], related?:string[]} | undefined}} Arc and event data.
 * @example
 * ```js
 * getStoryContext(new Date("2026-02-14"));
 * ```
 */
function getStoryContext(date) {
  const dateString = formatDate(date);
  return {
    monthArc: MONTHLY_ARCS[monthKey(date)],
    event: SPECIAL_EVENTS[dateString],
  };
}

/**
 * Builds the morning intentions section body.
 *
 * @param {string} dateString - Date string.
 * @param {Date} date - Date object.
 * @returns {string} Section content.
 * @example
 * ```js
 * buildMorningSection("2026-01-02", new Date("2026-01-02"));
 * ```
 */
function buildMorningSection(dateString, date) {
  const rng = rngForDate(dateString, "morning");
  const narrative = chance(0.4, rngForDate(dateString, "morning-style"));
  const weekend = isWeekend(date);

  const weightedPool = [
    ...MORNING_INTENTIONS_POOL,
    ...(weekend
      ? [
          "Keep the weekend focused on family presence and recovery.",
          "Play patient golf and commit to one swing thought all round.",
          "Show up early for tennis and warm up thoroughly before first serve.",
        ]
      : [
          "Keep Atlas v3.0 execution simple: decide, communicate, follow through.",
          "Use leadership meetings to remove blockers, not add complexity.",
          "Advance Series B follow-through with calm and precision.",
        ]),
  ];

  const [first, second] = pickUnique(weightedPool, 2, rng);

  if (narrative) {
    return `${first} ${second} By tonight I want to feel aligned, present, and proud of steady execution.`;
  }

  return `- ${first}\n- ${second}\n- End the day feeling focused, present, and connected at home.`;
}

/**
 * Builds the gratitude section body.
 *
 * @param {string} dateString - Date string.
 * @returns {string} Section content.
 * @example
 * ```js
 * buildGratitudeSection("2026-01-07");
 * ```
 */
function buildGratitudeSection(dateString) {
  const rng = rngForDate(dateString, "gratitude");
  const narrative = chance(0.4, rngForDate(dateString, "gratitude-style"));
  const items = pickUnique(GRATITUDE_POOL, 3, rng);

  if (narrative) {
    return `Today I keep coming back to gratitude for ${items[0].charAt(0).toLowerCase()}${items[0].slice(1)} I also noticed how much ${items[1].charAt(0).toLowerCase()}${items[1].slice(1)} and ${items[2].charAt(0).toLowerCase()}${items[2].slice(1)}`;
  }

  return items.map((item) => `- ${item}`).join("\n");
}

/**
 * Builds the daily log section body with adjacent-day and project wiki-links.
 *
 * @param {Date} date - Note date.
 * @returns {string} Section content.
 * @example
 * ```js
 * buildDailyLogSection(new Date("2026-02-01"));
 * ```
 */
function buildDailyLogSection(date) {
  const dateString = formatDate(date);
  const weekend = isWeekend(date);
  const rng = rngForDate(dateString, "daily-log");
  const { monthArc, event } = getStoryContext(date);

  const basePool = weekend
    ? [...DAILY_LOG_PERSONAL_POOL, ...DAILY_LOG_GOLF_POOL, ...DAILY_LOG_TENNIS_POOL, ...DAILY_LOG_PNW_POOL]
    : [...DAILY_LOG_PROFESSIONAL_POOL, ...DAILY_LOG_PNW_POOL, ...DAILY_LOG_TENNIS_POOL, ...DAILY_LOG_GOLF_POOL];

  const lines = pickUnique(basePool, weekend ? 3 : 3, rng).map((item) => `- ${item}`);

  if (monthArc) {
    lines.push(`- ${pickOne(monthArc.daily, rngForDate(dateString, "month-arc-daily"))}`);
  }

  if (event?.daily?.length) {
    for (const item of event.daily) {
      lines.push(`- ${item}`);
    }
  }

  const previous = addDays(date, -1);
  const next = addDays(date, 1);
  const previousInRange = previous >= START_DATE;
  const nextInRange = next <= END_DATE;
  const projectLink = weekend ? "[[Sahalee Country Club]]" : "[[Atlas v3.0]]";

  if (previousInRange && nextInRange) {
    lines.push(`- Carried momentum from [[${formatDate(previous)}]] into ${projectLink}, and set context for [[${formatDate(next)}]].`);
  } else if (previousInRange) {
    lines.push(`- Built on notes from [[${formatDate(previous)}]] while advancing ${projectLink}.`);
  } else if (nextInRange) {
    lines.push(`- Framed today's work in ${projectLink} so [[${formatDate(next)}]] starts cleaner.`);
  }

  return lines.join("\n");
}

/**
 * @typedef {object} TaskItem
 * @property {number} id - Stable task identifier for deterministic progression.
 * @property {string} text - Task description with inline tags.
 * @property {string} priority - Task priority emoji.
 * @property {string} dueDate - Due date in YYYY-MM-DD.
 * @property {string} createdDate - Creation date in YYYY-MM-DD.
 */

/**
 * @typedef {object} TaskGenerationState
 * @property {TaskItem[]} openTasks - Open tasks carried across generated days.
 * @property {number} nextTaskId - Next task identifier.
 * @property {number} tasksCreated - Counter of created tasks.
 * @property {number} tasksCompleted - Counter of completed tasks.
 */

/**
 * Creates initial state for deterministic task progression.
 *
 * @returns {TaskGenerationState} Empty task progression state.
 * @example
 * ```js
 * const state = createTaskGenerationState();
 * ```
 */
function createTaskGenerationState() {
  return {
    openTasks: [],
    nextTaskId: 1,
    tasksCreated: 0,
    tasksCompleted: 0,
  };
}

/**
 * Formats one obsidian-tasks line.
 *
 * @param {TaskItem} task - Task item.
 * @param {string | undefined} completedDate - Completion date when task is done.
 * @returns {string} Formatted task markdown line.
 * @example
 * ```js
 * const line = formatTaskLine(task, "2026-01-11");
 * ```
 */
function formatTaskLine(task, completedDate) {
  if (completedDate) {
    return `- [x] ${task.text} ${task.priority} 📅 ${task.dueDate} ➕ ${task.createdDate} ✅ ${completedDate}`;
  }
  return `- [ ] ${task.text} ${task.priority} 📅 ${task.dueDate} ➕ ${task.createdDate}`;
}

/**
 * Creates a deterministic task item.
 *
 * @param {string} taskText - Raw task text.
 * @param {Date} date - Note date.
 * @param {number} taskId - Stable task identifier.
 * @returns {TaskItem} New task item.
 * @example
 * ```js
 * const item = createTaskItem("Draft memo #work", new Date("2026-01-05"), 3);
 * ```
 */
function createTaskItem(taskText, date, taskId) {
  const dateString = formatDate(date);
  const priority = pickOne(["⏫", "🔼", "🔽"], rngForDate(dateString, `task-priority-${taskId}`));
  const dueOffset = 1 + Math.floor(rngForDate(dateString, `task-due-${taskId}`)() * 7);

  return {
    id: taskId,
    text: taskText,
    priority,
    dueDate: formatDate(addDays(date, dueOffset)),
    createdDate: dateString,
  };
}

/**
 * Selects new task candidates for a date while avoiding duplicate open tasks.
 *
 * @param {Date} date - Note date.
 * @param {TaskGenerationState} state - Mutable task state.
 * @returns {string[]} New task candidate strings.
 * @example
 * ```js
 * const picks = pickNewTaskCandidates(new Date("2026-01-10"), state);
 * ```
 */
function pickNewTaskCandidates(date, state) {
  const dateString = formatDate(date);
  const weekend = isWeekend(date);
  const { monthArc, event } = getStoryContext(date);

  const desiredCount = weekend
    ? (chance(0.55, rngForDate(dateString, "new-task-count")) ? 1 : 2)
    : (chance(0.35, rngForDate(dateString, "new-task-count")) ? 1 : 2);

  const openTaskTexts = new Set(state.openTasks.map((task) => task.text));
  const basePool = weekend
    ? [...TASK_POOL_PERSONAL, ...TASK_POOL_WORK.slice(0, 6)]
    : [...TASK_POOL_WORK, ...TASK_POOL_PERSONAL.slice(0, 6)];
  const dedupedPool = basePool.filter((taskText) => !openTaskTexts.has(taskText));
  const sourcePool = dedupedPool.length >= desiredCount ? dedupedPool : basePool;

  const selections = pickUnique(sourcePool, desiredCount, rngForDate(dateString, "new-task-pool"));
  const selectedSet = new Set(selections);

  if (monthArc?.tasks?.length && chance(0.4, rngForDate(dateString, "new-task-arc"))) {
    const arcTask = pickOne(monthArc.tasks, rngForDate(dateString, "new-task-arc-pick"));
    if (!openTaskTexts.has(arcTask) && !selectedSet.has(arcTask)) {
      selections.push(arcTask);
      selectedSet.add(arcTask);
    }
  }

  if (event?.tasks?.length) {
    for (const eventTask of event.tasks) {
      if (!openTaskTexts.has(eventTask) && !selectedSet.has(eventTask)) {
        selections.push(eventTask);
        selectedSet.add(eventTask);
      }
    }
  }

  return selections;
}

/**
 * Produces carry-forward and new task content with visible progression across days.
 *
 * @param {Date} date - Note date.
 * @param {{carryForward:boolean, newTasks:boolean}} sectionPlan - Task section visibility plan.
 * @param {TaskGenerationState} state - Mutable progression state.
 * @returns {{carrySection:string, newSection:string}} Rendered task sections.
 * @example
 * ```js
 * const sections = buildTaskSections(new Date("2026-01-12"), { carryForward: true, newTasks: true }, state);
 * ```
 */
function buildTaskSections(date, sectionPlan, state) {
  const dateString = formatDate(date);
  const weekend = isWeekend(date);
  const carryLines = [];
  const newLines = [];

  if (sectionPlan.carryForward) {
    const sortedOpen = [...state.openTasks].sort((left, right) => {
      if (left.dueDate !== right.dueDate) {
        return left.dueDate.localeCompare(right.dueDate);
      }
      if (left.createdDate !== right.createdDate) {
        return left.createdDate.localeCompare(right.createdDate);
      }
      return left.id - right.id;
    });

    const visibleCount = weekend ? 2 : 3;
    const carryTasks = sortedOpen.slice(0, visibleCount);
    const completedIds = new Set();
    const completedIndexes = new Set();

    carryTasks.forEach((task, index) => {
      const overdue = task.dueDate <= dateString;
      const completionProbability = overdue ? 0.72 : weekend ? 0.42 : 0.58;
      const shouldComplete = chance(completionProbability, rngForDate(dateString, `carry-complete-${task.id}`));
      if (shouldComplete) {
        completedIndexes.add(index);
      }
    });

    if (carryTasks.length >= 2 && completedIndexes.size === 0 && chance(0.68, rngForDate(dateString, "carry-force-complete"))) {
      completedIndexes.add(0);
    }

    carryTasks.forEach((task, index) => {
      if (completedIndexes.has(index)) {
        carryLines.push(formatTaskLine(task, dateString));
        completedIds.add(task.id);
        state.tasksCompleted += 1;
      } else {
        carryLines.push(formatTaskLine(task));
      }
    });

    if (completedIds.size > 0) {
      state.openTasks = state.openTasks.filter((task) => !completedIds.has(task.id));
    }
  }

  if (sectionPlan.newTasks) {
    const candidates = pickNewTaskCandidates(date, state);
    for (const taskText of candidates) {
      const taskItem = createTaskItem(taskText, date, state.nextTaskId);
      state.nextTaskId += 1;
      state.tasksCreated += 1;
      state.openTasks.push(taskItem);
      newLines.push(formatTaskLine(taskItem));
    }
  }

  const maxOpenTasks = 8;
  if (state.openTasks.length > maxOpenTasks) {
    const sorted = [...state.openTasks].sort((left, right) => left.createdDate.localeCompare(right.createdDate) || left.id - right.id);
    const removeCount = state.openTasks.length - maxOpenTasks;
    const removeIds = new Set(sorted.slice(0, removeCount).map((task) => task.id));
    state.openTasks = state.openTasks.filter((task) => !removeIds.has(task.id));
  }

  return {
    carrySection:
      carryLines.length > 0
        ? `${carryLines.join("\n")}\n\n${CARRY_FORWARD_TASKS_QUERY_BLOCK}`
        : CARRY_FORWARD_TASKS_QUERY_BLOCK,
    newSection: newLines.length > 0 ? newLines.join("\n") : "<!-- Tasks created today -->",
  };
}

/**
 * Builds evening reflection section body.
 *
 * @param {string} dateString - Date string.
 * @param {Date} date - Date object.
 * @returns {string} Section content.
 * @example
 * ```js
 * buildEveningSection("2026-01-20", new Date("2026-01-20"));
 * ```
 */
function buildEveningSection(dateString, date) {
  const rng = rngForDate(dateString, "evening");
  const narrative = chance(0.4, rngForDate(dateString, "evening-style"));
  const { monthArc, event } = getStoryContext(date);
  const picks = pickUnique(EVENING_REFLECTIONS_POOL, 3, rng);

  const extra = [];
  if (monthArc?.daily?.length) {
    extra.push(pickOne(monthArc.daily, rngForDate(dateString, "evening-arc")));
  }
  if (event?.daily?.length) {
    extra.push(event.daily[0]);
  }

  if (narrative) {
    const lead = picks[0];
    const middle = picks[1];
    const end = picks[2];
    const extraText = extra.length > 0 ? ` ${extra.join(" ")}` : "";
    return `${lead} ${middle} ${end}${extraText}`;
  }

  const bullets = [
    `- Went well: ${picks[0]}`,
    `- Could be better: ${picks[1]}`,
    `- Learned: ${picks[2]}`,
  ];

  for (const entry of extra) {
    bullets.push(`- Context: ${entry}`);
  }

  return bullets.join("\n");
}

/**
 * Builds related links section with adjacent day links.
 *
 * @param {Date} date - Note date.
 * @returns {string} Section content.
 * @example
 * ```js
 * buildRelatedSection(new Date("2026-02-10"));
 * ```
 */
function buildRelatedSection(date) {
  const dateString = formatDate(date);
  const rng = rngForDate(dateString, "related");
  const links = pickUnique(RELATED_LINKS_POOL, 4, rng);
  const previous = addDays(date, -1);
  const next = addDays(date, 1);

  const lines = links.map((link) => `- ${link}`);

  if (previous >= START_DATE) {
    lines.push(`- [[${formatDate(previous)}]]`);
  }

  if (next <= END_DATE) {
    lines.push(`- [[${formatDate(next)}]]`);
  }

  const event = SPECIAL_EVENTS[dateString];
  if (event?.related?.length) {
    for (const link of event.related) {
      lines.push(`- ${link}`);
    }
  }

  return [...new Set(lines)].join("\n");
}

/**
 * Renders section content or fallback placeholder.
 *
 * @param {boolean} includeContent - Whether to include generated content.
 * @param {() => string} builder - Content builder.
 * @param {string} fallback - Fallback text when omitted.
 * @returns {string} Section body.
 * @example
 * ```js
 * sectionOrFallback(false, () => "content", "<!-- empty -->");
 * ```
 *
 * @internal
 */
function sectionOrFallback(includeContent, builder, fallback) {
  return includeContent ? builder() : fallback;
}

/**
 * Generates one complete daily note.
 *
 * @param {Date} date - Note date.
 * @param {TaskGenerationState} taskState - Mutable task progression state.
 * @returns {{filename:string, content:string, completeness:"full"|"most"|"partial"|"sparse"}} Generated note payload.
 * @example
 * ```js
 * const note = generateNote(new Date("2026-02-01"), createTaskGenerationState());
 * ```
 */
function generateNote(date, taskState) {
  const dateString = formatDate(date);
  const completeness = determineCompleteness(date);
  const sectionPlan = determineSectionPlan(date, completeness);

  if (!sectionPlan.carryForward && taskState.openTasks.length > 0 && completeness !== "sparse") {
    sectionPlan.carryForward = chance(0.62, rngForDate(dateString, "carry-boost"));
  }

  if (!sectionPlan.newTasks && taskState.openTasks.length === 0 && completeness !== "sparse") {
    sectionPlan.newTasks = chance(0.78, rngForDate(dateString, "new-task-boost"));
  }

  const taskSections = buildTaskSections(date, sectionPlan, taskState);

  const noteContent = [
    renderFrontmatter(dateString, completeness),
    "",
    `# Journal: ${dateString}`,
    "",
    "## 🌅 Morning Intentions",
    sectionOrFallback(
      sectionPlan.morning,
      () => buildMorningSection(dateString, date),
      "<!-- What do I want to focus on today? How do I want to feel by end of day? -->",
    ),
    "",
    "## 🙏 Gratitude",
    sectionOrFallback(sectionPlan.gratitude, () => buildGratitudeSection(dateString), "<!-- Things I'm grateful for today -->"),
    "",
    "## 📝 Daily Log",
    sectionOrFallback(sectionPlan.daily, () => buildDailyLogSection(date), "<!-- Events, thoughts, and experiences throughout the day -->"),
    "",
    "## Carry Forward Tasks",
    sectionPlan.carryForward
      ? taskSections.carrySection
      : CARRY_FORWARD_TASKS_QUERY_BLOCK,
    "",
    "## 🎯 New Tasks",
    sectionPlan.newTasks ? taskSections.newSection : "<!-- Tasks created today -->",
    "",
    "## 💭 Evening Reflection",
    sectionOrFallback(
      sectionPlan.evening,
      () => buildEveningSection(dateString, date),
      "<!-- What went well? What could have been better? What did I learn? -->",
    ),
    "",
    "## 🔗 Related",
    sectionOrFallback(sectionPlan.related, () => buildRelatedSection(date), "<!-- Links to related notes, projects, or people -->"),
    "",
  ].join("\n");

  return {
    filename: `${dateString}.md`,
    content: noteContent,
    completeness,
  };
}

/**
 * Generates all daily notes for the configured range.
 *
 * @returns {{count:number, byCompleteness:Record<string, number>, tasksCreated:number, tasksCompleted:number, openTasks:number}} Generation summary.
 * @example
 * ```js
 * const summary = generateAllNotes();
 * console.log(summary.count);
 * ```
 */
function generateAllNotes() {
  mkdirSync(DAILY_NOTES_DIR, { recursive: true });
  const dates = dateRange(START_DATE, END_DATE);
  const taskState = createTaskGenerationState();

  /** @type {Record<string, number>} */
  const byCompleteness = {
    full: 0,
    most: 0,
    partial: 0,
    sparse: 0,
  };

  for (const date of dates) {
    const note = generateNote(date, taskState);
    writeFileSync(path.join(DAILY_NOTES_DIR, note.filename), note.content, "utf8");
    byCompleteness[note.completeness] += 1;
  }

  return {
    count: dates.length,
    byCompleteness,
    tasksCreated: taskState.tasksCreated,
    tasksCompleted: taskState.tasksCompleted,
    openTasks: taskState.openTasks.length,
  };
}

/**
 * Entrypoint for CLI usage.
 *
 * @returns {void}
 * @example
 * ```js
 * main();
 * ```
 */
function main() {
  const summary = generateAllNotes();
  const totalPoolSize =
    MORNING_INTENTIONS_POOL.length +
    GRATITUDE_POOL.length +
    DAILY_LOG_PROFESSIONAL_POOL.length +
    DAILY_LOG_PERSONAL_POOL.length +
    DAILY_LOG_GOLF_POOL.length +
    DAILY_LOG_TENNIS_POOL.length +
    DAILY_LOG_PNW_POOL.length +
    TASK_POOL_WORK.length +
    TASK_POOL_PERSONAL.length +
    EVENING_REFLECTIONS_POOL.length +
    RELATED_LINKS_POOL.length;

  console.log(`Generated ${summary.count} daily notes in ${DAILY_NOTES_DIR}`);
  console.log(`Date range: ${formatDate(START_DATE)} through ${formatDate(END_DATE)} (inclusive)`);
  console.log(`Completeness distribution: ${JSON.stringify(summary.byCompleteness)}`);
  console.log(`Task progression: created=${summary.tasksCreated}, completed=${summary.tasksCompleted}, still-open=${summary.openTasks}`);
  console.log(`Total hardcoded content pool entries: ${totalPoolSize}`);
}

main();
