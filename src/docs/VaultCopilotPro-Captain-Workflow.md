# Team Captain: Real-World Workflow Example

A comprehensive example of the agentic workflow architecture applied to a real domain — managing a competitive USTA tennis team. This implementation demonstrates all 10 agentic workflow patterns working together across a vault-as-database architecture with 8 automations, 22 prompts, 11 skills, and full Outlook MCP + WorkIQ integration.

---

## Table of Contents

1. [Overview](#overview)
2. [Vault Structure as Domain Model](#vault-structure-as-domain-model)
3. [The Agent](#the-agent)
4. [Workflow Patterns in Action](#workflow-patterns-in-action)
5. [Match Week Orchestration](#match-week-orchestration)
6. [Automations](#automations)
7. [Pipelines](#pipelines)
8. [Group Discussion](#group-discussion)
9. [Reactive Email Processing](#reactive-email-processing)
10. [Prompts as Named Workflows](#prompts-as-named-workflows)
11. [Skills as Domain Knowledge](#skills-as-domain-knowledge)
12. [What Makes This Work](#what-makes-this-work)

---

## Overview

The Team Captain workflow assists Dan Shue in managing all aspects of running competitive USTA tennis teams — recruiting players, building lineups, coordinating with opposing captains, scheduling matches, tracking results, and communicating with the team.

### Scale

| Dimension | Count |
|-----------|-------|
| Player profiles | 16 |
| Opponent teams | 4 (with scouting data) |
| Active seasons | 2 (concurrent) |
| Automations | 8 (scheduled/event) |
| Prompt templates | 22 |
| Skills | 11 |
| Tools used | 30+ (vault + Outlook MCP + WorkIQ + orchestration) |

### Patterns Used

The Team Captain workflow demonstrates **all 10 agentic workflow patterns**:

| # | Pattern | Where |
|---|---------|-------|
| 1 | Single agent + tools | `team-captain.agent.md` — primary interaction mode |
| 2 | Sequential pipeline | Weekly status pipeline, Full Match Prep Pipeline |
| 3 | Concurrent / parallel | Weekly status pipeline parallel season scan |
| 4 | Agent handoff | Handoff buttons configured in agent for specialist delegation |
| 5 | Manager / planner | Flex Match Scheduling uses `create_plan` for rescheduling |
| 6 | Group discussion | Lineup Strategy Discussion (3 perspectives) |
| 7 | Human-in-the-loop | Approval gates, tool approval for email, `ask_question` |
| 8 | Guardrails | Tool approval settings gate email send operations |
| 9 | Durable / long-running | Checkpointed approval gates, event-driven availability watcher |
| 10 | Session-based assistant | Session memory tracks contacts, decisions, activity state |

---

## Vault Structure as Domain Model

The vault itself is the database. Every entity is a Markdown file with structured frontmatter:

```
USTA Team Captain/
├── roster/                    # 16 player profiles
│   ├── roster.md              # Index
│   ├── Dan Shue.md            # Captain
│   ├── David Ruark.md         # Player profiles with NTRP,
│   ├── Carlos Rios.md         #   availability, match history,
│   └── ...                    #   contact info, playing style
│
├── opponents/                 # 4 opponent teams
│   ├── opponents.md           # Index with aggregate records
│   ├── SHC-Woller.md          # Team profile + captain contact
│   ├── SHC-Woller/            # Individual opponent player profiles
│   └── ...
│
├── seasons/                   # Per-season data
│   ├── seasons.md             # Cross-season index
│   ├── Winter 2025-26 - Mens 40+ 2.5/
│   │   ├── season.md          # Schedule, record, standings
│   │   ├── Season Review.md   # Post-season analysis
│   │   └── matches/
│   │       └── 2026-03-08 vs SHC-Woller.md
│   └── Spring 2026 - Mens 18+ 2.5/
│       └── season.md
│
├── agent/
│   └── team-captain.agent.md  # The agent definition
│
├── automation/                # 8 scheduled/event workflows
│   ├── weekly-status-pipeline.automation.md
│   ├── team-email-monitor.automation.md
│   ├── email-alert-notify.automation.md
│   ├── availability-response-watcher.automation.md
│   ├── captain-coordination-reminder.automation.md
│   ├── lineup-deadline-reminder.automation.md
│   ├── lineup-selection-reminder.automation.md
│   └── post-match-summary.automation.md
│
├── prompts/                   # 22 named prompt templates
│   ├── Build Lineup.prompt.md
│   ├── Find Substitute.prompt.md
│   ├── Full Match Prep Pipeline.prompt.md
│   ├── Lineup Strategy Discussion.prompt.md
│   ├── Post-Match Summary.prompt.md
│   ├── Season Overview.prompt.md
│   └── ... (16 more)
│
├── skills/                    # 11 domain skill definitions
│   ├── lineup-building/SKILL.md
│   ├── match-coordination/SKILL.md
│   ├── outlook-integration/SKILL.md
│   ├── roster-management/SKILL.md
│   └── ... (7 more)
│
├── config/                    # Configuration
│   ├── captain-config.md      # Identity, directory structure
│   ├── outlook-settings.md    # Email integration config
│   └── email-monitor-state.md # Polling state
│
├── communications/            # Email log and templates
├── activity-logs/             # Daily session logs
└── practices/                 # Practice session records
```

### Player Profile Example

```yaml
---
name: David Ruark
ntrp: 2.5
self-rating: 2.5C
status: active
joined: 2025-11-01
availability: weekends
positions: singles, doubles
tags: [roster, player]
---

# David Ruark

## Contact
- Phone: 503-555-1234
- Email: david.ruark@example.com
- Preferred contact: text

## Availability Pattern
- Weekends preferred
- Can do Friday evenings occasionally
- Blackout: March 20-25 (vacation)

## Playing Style
- Strong baseline game
- Reliable doubles partner
- Preferred partner: Scott Fish

## Match History
| Date | Opponent | Line | Partner | Result |
|------|----------|------|---------|--------|
| 2026-02-15 | IRV-Salada | Doubles 2 | Scott Fish | Won 6-3, 6-4 |
| 2026-03-01 | LOTC-Bacchetti | Singles 2 | — | Lost 4-6, 5-7 |
```

---

## The Agent

`team-captain.agent.md` is a single agent with 30+ tools that handles the full domain. Key design decisions:

**Identity:** The agent writes as "Dan" in first person — emails, messages, and communications use the captain's voice directly.

**Tools spanning three layers:**
- **Vault tools**: `read_note`, `create_note`, `update_note`, `search_notes`, `list_notes_recursively`, etc.
- **Outlook MCP tools**: `mcp_outlook_assistant_list-emails`, `mcp_outlook_assistant_send-email`, `mcp_outlook_assistant_search-emails`, etc.
- **WorkIQ MCP tool**: `mcp_workiq3_ask_work_iq` — checks captain's work calendar for scheduling conflicts
- **Orchestration tools**: `run_pipeline`, `group_discussion`, `create_plan`, `run_parallel_agents`, `handoff_to_agent`
- **Session tools**: `save_memory`, `recall_memory`, `ask_question`

**Proactive behavior:** The agent doesn't just wait for commands — it logs every sent communication, suggests follow-ups, and maintains activity logs automatically.

**Communication templates:** Built-in templates for availability requests, lineup announcements, and match results — using emoji and clear formatting for team-friendly messages.

---

## Workflow Patterns in Action

### Match Week Orchestration

The most complex workflow — a multi-day, multi-pattern sequence that plays out across an entire match week using 6 automations, 2 pipelines, and 1 group discussion:

```
Day -14 (2 weeks out)
  └→ lineup-selection-reminder fires (daily check)
     └→ Scans season files for matches 14 days out
     └→ If no lineup → reminds captain to run "Build Lineup"

Day -7 (1 week out)
  └→ captain-coordination-reminder fires (daily check)
     └→ Checks opponent captain contact status
     └→ If no recent contact → drafts outreach + provides contact info

Day -4 (Wednesday)
  └→ lineup-deadline-reminder fires (Wednesday 9am)
     └→ Checks who confirmed, declined, or hasn't responded
     └→ Drafts follow-up messages for non-responders
     └→ Flags lineup gaps needing substitutes

Continuous (every 15 min)
  └→ team-email-monitor / email-alert-notify fires
     └→ Catches player replies ("I can play" / "I can't make it")
     └→ Retries with exponential backoff on Outlook API failures
     └→ Categorizes by priority:
        🔴 High: Opponent captain within 48h of match
        🟠 Medium: Team member + match keyword
        🟡 Normal: USTA league or general tennis
     └→ Sends Telegram alert
     └→ Player decline triggers Find Substitute workflow

Continuous (file event)
  └→ availability-response-watcher fires on match file modification
     └→ Counts confirmed vs. pending player responses
     └→ All responded? → Telegram alert: "Ready for lineup build"
     └→ Still waiting? → Silent update (no notification spam)

On demand
  └→ Captain says: "Run the full match prep pipeline for Saturday"
     └→ Roster Scan (+ WorkIQ work-schedule check) → Lineup Build → Logistics (home/away) → Communications Draft → Review
     └→ 5-stage sequential pipeline with conditional branching
     └→ Produces ready-to-send team email + reviewed lineup

On demand
  └→ Captain says: "Let's debate the lineup strategy"
     └→ 3-perspective group discussion
        • Offensive Strategist — maximize win probability
        • Chemistry Advisor — proven doubles pairings
        • Risk Manager — substitution depth, injury risk
     └→ Synthesis produces final recommendation

Match day
  └→ Captain runs "Match Day Prep" prompt
     └→ Final logistics check

Sunday 8pm
  └→ post-match-summary automation fires
     └→ Prompts for results
     └→ Updates: match notes, player profiles, season record, indexes

Monday 9am
  └→ weekly-status-pipeline fires
     └→ Season Scan → Roster Check → Draft Report
     └→ Approval gate → Captain reviews
     └→ Save to activity log
```

---

## Automations

### Weekly Status Pipeline (Parallel Scan + Sequential Pipeline + Approval Gate)

```yaml
triggers:
  - type: schedule
    schedule: "0 9 * * 1"  # Monday 9am
actions:
  - type: parallel
    actions:
      - type: run-agent
        agentId: team-captain
        input:
          task: "Read the season file for 'Winter 2025-26 - Mens 40+ 2.5'..."
      - type: run-agent
        agentId: team-captain
        input:
          task: "Read the season file for 'Spring 2026 - Mens 18+ 2.5'..."
  - type: run-pipeline
    stages:
      - name: Merge Season Data
        agentName: team-captain
        promptTemplate: "Merge parallel season scan results into unified view:
                         {{previousOutput}}"
      - name: Roster Check
        agentName: team-captain
        promptTemplate: "Check player availability for upcoming matches:
                         {{previousOutput}}"
      - name: Draft Report
        agentName: team-captain
        promptTemplate: "Create a weekly captain status report:
                         {{previousOutput}}"
  - type: approval-gate
    message: "Weekly status report is ready. Approve to save."
  - type: run-agent
    agentId: team-captain
    input:
      task: "Save the approved report as an activity log entry"
```

**Patterns used:** Parallel execution (concurrent season scans), sequential pipeline (merge → roster → report), human-in-the-loop (approval gate), scheduled trigger. The approval gate automatically checkpoints workflow state to disk — if the captain closes Obsidian and returns hours later, the approval prompt reappears and the pipeline resumes.

### Email Monitor → Telegram Alert

```yaml
triggers:
  - type: schedule
    schedule: "*/15 * * * *"  # Every 15 minutes
actions:
  - type: run-agent
    agentId: team-captain
    input:
      task: "Check inbox for unread tennis emails using Outlook MCP.
             Extract sender, subject, and one-line summary."
    retryPolicy:
      maxRetries: 2
      initialDelayMs: 5000
      backoffMultiplier: 2
      maxDelayMs: 30000
      retryableErrors:
        - "timeout"
        - "429"
        - "rate limit"
        - "ECONNREFUSED"
  - type: notify
    channel: telegram
    message: "🎾 Email Alert:\n{{previousOutput}}"
```

**Patterns used:** Scheduled trigger, single agent + tools (Outlook MCP), notification, retry with exponential backoff. The `retryPolicy` ensures Outlook API rate limits (429) and network timeouts don't silently skip alerts — the engine waits 5s → 10s → 20s before giving up.

### Availability Response Watcher

```yaml
triggers:
  - type: file-modified
    pattern: "01_Projects/Tennis/USTA Team Captain/seasons/*/matches/*.md"
    delay: 2000
actions:
  - type: run-agent
    agentId: team-captain
    input:
      task: "Read the modified match file and check the availability section.
             Count confirmed, declined, and pending."
  - type: conditional
    condition: "ready for lineup build"
    thenActions:
      - type: notify
        channel: telegram
        message: "🎾 ✅ All availability responses received!"
    elseActions:
      - type: run-agent
        agentId: team-captain
        input:
          task: "Log the partial availability update silently."
```

**Patterns used:** File event trigger (event-driven), conditional branching, notification.

### Coordination Reminders

| Automation | Schedule | Purpose |
|-----------|----------|---------|
| `lineup-selection-reminder` | Daily | Check for matches 14 days out, prompt lineup creation |
| `captain-coordination-reminder` | Daily | Check for matches 7 days out, draft opponent captain outreach |
| `lineup-deadline-reminder` | Wednesday 9am | Final lineup check, follow up with non-responders |
| `availability-response-watcher` | File event | Watch match files for player confirmations, notify when complete |
| `post-match-summary` | Sunday 8pm | Prompt result recording, update all records |

Each reminder follows the same pattern: scan season files → check status → generate action if needed → notify captain.

---

## Pipelines

### Full Match Prep Pipeline

A 5-stage pipeline that produces a complete match preparation package. The Roster Scan stage checks the captain's work calendar via WorkIQ for scheduling conflicts, and the Logistics stage adapts for home vs. away matches:

```
Stage 1: Roster Scan
  → Reads each player file, checks availability for match date
  → Checks captain's work schedule via WorkIQ for conflicts
  → Output: Available/unavailable/unconfirmed player list + captain constraints

Stage 2: Lineup Build
  → Input: {{previousOutput}} (available players)
  → Assigns singles lines 1-3, doubles pairings
  → Considers NTRP ratings, recent performance, chemistry
  → Output: Proposed lineup with rationale

Stage 3: Logistics (conditional home/away branching)
  → Reads match file to determine home or away
  → HOME: Confirm court availability, prepare logistics for both teams
  → AWAY: Get directions/parking from opponent profile, arrange carpooling
  → Output: Logistics section labeled [HOME] or [AWAY]

Stage 4: Communications Draft
  → Input: {{previousOutput}} (lineup + logistics)
  → Drafts team email tailored for home/away context
  → Output: Ready-to-send team notification

Stage 5: Captain Review
  → Input: {{previousOutput}} (full package)
  → Different checklist for home vs. away matches
  → Checks NTRP legality, flags conflicts, verifies completeness
  → Output: Review checklist with any concerns
```

Invoked by saying: *"Run the full match prep pipeline for Saturday's match against SHC-Woller"*

---

## Group Discussion

### Lineup Strategy Discussion

A 3-perspective round-robin debate to optimize lineup decisions:

```json
{
  "agents": ["team-captain", "team-captain", "team-captain"],
  "topic": "Best lineup strategy for [opponent] considering
            offensive strength, chemistry, and depth",
  "maxRounds": 2,
  "strategy": "round-robin",
  "synthesisAgent": "team-captain"
}
```

**Perspectives simulated:**

| Perspective | Advocates for |
|-------------|---------------|
| Offensive Strategist | Strongest players on Lines 1-2, maximize win probability |
| Chemistry Advisor | Proven doubles pairings, even if not "strongest" on paper |
| Risk Manager | Spread strength across lines, keep best sub available |

The synthesis produces a final recommendation with tradeoffs, the recommended lineup, and a contingency plan if a player cancels.

---

## Reactive Email Processing

The event-driven workflow that makes the system responsive:

```
Outlook inbox receives tennis email
  │
  ├→ email-alert-notify (every 15 min)
  │   └→ Agent scans for tennis keywords
  │   └→ Filters: team member / opponent captain / USTA
  │   └→ Priority: 🔴 opponent + 48h match, 🟠 player, 🟡 league
  │   └→ Telegram alert
  │
  └→ Captain sees alert, opens Vault Copilot
      └→ "David Ruark can't play Sunday"
      └→ Agent reads email, updates match file
      └→ Runs "Find Substitute" workflow:
          1. What line was David playing? Singles or doubles?
          2. What NTRP rating needed?
          3. Check sub-only players' availability
          4. Prioritize by subbing history + chemistry
          5. Draft outreach to top 3 candidates
          6. Log everything to activity log
```

**Priority scoring logic:**

| Priority | Condition | Example |
|----------|-----------|---------|
| 🔴 High | Opponent captain + match within 48h | Reschedule request |
| 🟠 Medium | Team member + match keyword | Availability confirmation |
| 🟡 Normal | USTA league or tennis keyword | Playoff bracket release |

---

## Prompts as Named Workflows

22 prompt templates serve as named entry points for every captain task:

| Category | Prompts | Notable Patterns |
|----------|---------|-----------------|
| **Match ops** | Build Lineup, Find Substitute, Full Match Prep Pipeline, Match Day Prep, Lineup Strategy Discussion, Flex Match Scheduling | Build Lineup checks captain's work calendar via WorkIQ. Flex Match Scheduling uses `create_plan` (manager/planner pattern) to decompose rescheduling into tasks. Full Match Prep Pipeline runs a 5-stage pipeline with conditional home/away branching. |
| **Season mgmt** | Season Overview, Season Review, Season Transition Planner, Multi-Season Dashboard, Check Schedule Conflicts | Season Overview scans all active/planning/completed seasons and flags cross-season player conflicts. |
| **Roster** | Add Prospect, Onboard Players, Recruit Players, Backfill Player Stats | Onboard Players creates structured player profiles from intake data. Backfill imports match history from TennisLink. |
| **Opponents** | Create Opponent Profile | Creates team + individual player scouting profiles from match data. |
| **Communication** | Post-Match Summary, Configure Outlook | Post-Match Summary updates match notes, player profiles, season records, and indexes in one pass. |
| **Admin** | Setup New Captain, Reset for Fresh Start, Captain Memory | Setup New Captain scaffolds the full directory structure for a new captain. |
| **Practice** | Schedule Practice | Polls players for availability, books courts, creates practice plan note. |

Each prompt defines the workflow steps, expected inputs, vault paths to read/write, and output format. The captain says *"find a sub for David"* and the agent executes the full Find Substitute workflow without further instruction.

---

## Skills as Domain Knowledge

11 skills codify the rules and best practices of team captainship:

| Skill | Domain knowledge |
|-------|-----------------|
| `lineup-building` | NTRP rating rules, lineup legality, position assignment logic |
| `match-coordination` | Pre-match logistics, opponent captain communication protocol |
| `flex-match-scheduling` | Weather reschedule workflow, facility coordination with VTC |
| `roster-management` | Player status tracking, availability patterns, sub lists |
| `player-onboarding` | New player intake process, profile creation |
| `recruiting-pipeline` | Prospect tracking, outreach, follow-up cadence |
| `practice-organization` | Court booking, drill planning, attendance tracking |
| `outlook-integration` | Email filtering rules, Outlook MCP tool usage patterns |
| `team-communications` | Template library, tone guidelines, distribution patterns |
| `season-analytics` | Win/loss tracking, player stats, partnership analysis |
| `stats-backfill` | Retroactive match history entry from TennisLink |

---

## What Makes This Work

### 1. Vault is the database

Every entity (player, opponent, season, match) is a Markdown file with structured frontmatter. The agent reads and writes the vault as its data layer. No external database, no API — just Markdown files that are also human-readable documents.

### 2. Progressive automation

The captain can do everything manually through chat commands, or let automations handle the routine. Automations remind, draft, and prepare — the captain decides and approves. Automation complements human judgment rather than replacing it.

### 3. Multi-pattern composition

A single match week uses scheduled triggers, event-driven email processing, sequential pipelines, group discussion, human-in-the-loop approval, session memory, and Telegram notifications — all coordinated through the vault's file structure.

### 4. Outlook MCP for real communication

Email is how captains actually coordinate with opponents and teams. The agent reads incoming email, drafts outgoing email, and the captain approves before sending. Communication is a first-class operation, not an afterthought.

### 5. Identity and voice

The agent writes as "Dan" in first person. Emails, messages, and communications use the captain's actual voice — friendly, clear, action-oriented. The team never knows an AI drafted the message.

### 6. Activity logging as institutional memory

Every sent communication, every decision, every action is logged to activity files. This creates a searchable history that informs future decisions — "what did we do last time SHC-Woller asked to reschedule?"

### 7. Resilience through retry and checkpoints

Outlook MCP operations include retry policies with exponential backoff, so API rate limits don't silently break email monitoring. Approval gates checkpoint workflow state to disk — the captain can close Obsidian, come back hours later, and the workflow resumes from where it left off. The availability response watcher uses event-driven file triggers instead of polling, detecting player responses instantly.

### 8. WorkIQ bridges work and tennis

The captain's work calendar is checked via WorkIQ MCP when building lineups and scheduling matches. This prevents the common problem of scheduling a match when there's a conflicting work meeting — the agent surfaces "you have a 3pm meeting Friday" before finalizing Saturday morning's lineup arrival time.

### 9. Every workflow is Markdown-configurable

All automations, prompts, skills, and the agent itself are defined in Markdown files with YAML frontmatter. Adding a new automation is creating a `.automation.md` file. Adding retry policy is adding a `retryPolicy:` block. No code changes, no deployments, no rebuilds — just edit Markdown and the engine picks it up.
