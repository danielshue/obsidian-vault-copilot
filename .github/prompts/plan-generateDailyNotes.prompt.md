## Plan: Generate 5 Months of Synthetic Daily Journal Notes

Create ~153 daily notes (Oct 1 2025 – Feb 21 2026, all 7 days/week) in `test-vault/Daily Notes/` using the Daily Journal Agent template with a coherent CEO/father/golfer/tennis-player persona.

**Steps**

1. **Create** `scripts/generate-daily-notes.mjs` — a standalone Node.js script (no dependencies) that:
   - Iterates every day Oct 1 2025 → Feb 21 2026 (~153 days)
   - Writes `YYYY-MM-DD.md` files into `test-vault/Daily Notes/`
   - Uses seeded randomness (date-based hash) for deterministic output

2. **Persona woven through all content**:
   - **Professional**: CEO of Meridian Software (based in **Seattle, WA**). Building Atlas platform v3.0. Reports: Marcus (VP Eng), Priya (CTO), Tom (Sales), Liz (Product). Board member Richard. Clients: Axiom Health, TerraForge, Nexus Financial.
   - **Personal**: Lives in **Bellevue, WA** with wife Sarah, daughter Emma (12), son Jake (9), dog Benson. PNW lifestyle — rain, coffee, hiking, ferries to the San Juans.
   - **Golf**: Home course is **Sahalee Country Club** (Sammamish). Weekend rounds with buddy Dave, rainy-season grind on soggy PNW courses. **Flies to Palm Springs** for winter golf trips — Indian Wells Golf Resort, PGA West, Escena Golf Club, Desert Willow. Handicap trending 14→12. Scores, birdies, course conditions. Palm Springs trips are a highlight escape from Seattle gray.
   - **Tennis**: USTA PNW league matches, plays at **Bellevue Club**. Tue/Thu evenings with partner Mike. Weekend doubles tournaments. Working on backhand/serve. Indoor courts in winter (PNW rain). Occasional outdoor sessions at Palm Springs trips.
   - **Travel**: Palm Springs golf getaways (Nov, Jan, Feb long weekends), Big Bear ski trip with family (Dec), occasional SF/Bay Area for board meetings & client visits.

3. **Monthly story arcs** drive content variety:

   | Month | Professional | Personal |
   |-------|-------------|----------|
   | **Oct** | Q4 kickoff, Atlas v3.0 sprint, hiring VP Sales, Series B prep | Rainy PNW golf at Sahalee, Emma's school play, Jake's soccer finals, fall hikes in the Cascades |
   | **Nov** | Atlas beta launch, Axiom Health pilot, board deck | Thanksgiving, Jake's birthday, **Palm Springs golf trip** (escape the rain — PGA West, Desert Willow), tennis league playoffs at Bellevue Club |
   | **Dec** | Board meeting (SF), year-end reviews, budget, holiday party | Christmas in Bellevue, **Big Bear ski trip** with family, indoor tennis, PNW winter rain grind |
   | **Jan** | New year OKRs, team kickoff, Atlas GA prep, Series B close | USTA PNW league starts, **Palm Springs long weekend** (Indian Wells member-guest with Dave), Emma's science fair |
   | **Feb** | Atlas GA launch, Series B signed, team growth, Q1 board prep | Valentine's Day in Seattle, **Presidents' Day Palm Springs trip** (Escena couples tournament with Sarah), doubles with Mike at Bellevue Club |

4. **Completeness varies realistically** per note:
   - ~15% **Full** — all sections + mood/energy in frontmatter
   - ~35% **Most** — 4–5 sections, mood/energy set
   - ~35% **Partial** — 2–3 sections, mood sometimes
   - ~15% **Sparse** — just morning intentions or just tasks
   - **Weekdays** skew professional; **weekends** skew personal (golf rounds, tennis matches, family time, some lazy sparse days)

5. **Each note uses the Daily Journal Agent template**:
   - Frontmatter: `creation-date`, `modified-date`, `tags: [journal, daily]`, `status`, `type: daily`, `agent: [[daily-journal.agent]]`, optional `mood`/`energy`
   - Sections: Morning Intentions → Gratitude → Daily Log → Carry Forward Tasks → New Tasks → Evening Reflection → Related
   - Tasks use obsidian-tasks emoji format (`📅`, `⏫`, `🔼`, `🔽`, `➕`, `✅`)
   - ~40% of reflective sections use narrative prose; ~60% use bullet lists
   - Daily Log and Related sections include `[[wiki-links]]` to projects and adjacent days

6. **Content pools** (~250+ pre-written entries total) hardcoded in the script:
   - 50+ morning intentions, 40+ gratitude items, 60+ daily log entries (including golf round recaps at Sahalee & Palm Springs courses with scores, tennis match results at Bellevue Club with sets, PNW weather/lifestyle moments, travel days to Palm Springs & Big Bear), 50+ tasks, 40+ evening reflections, 20+ related links

7. **Run**: `node scripts/generate-daily-notes.mjs`

**Verification**
- File count: ~153 files in `test-vault/Daily Notes/`
- Spot-check a weekday, a Saturday golf note, a Sunday family note, and a sparse note
- Build + deploy plugin, confirm notes load in Obsidian

**Decisions**
- All 7 days/week (weekends included per your request)
- Through Feb 21, 2026 (today's date)
- Persona lives in Bellevue/Seattle (PNW) — local golf at Sahalee, travels to Palm Springs for winter golf trips
- Tennis at Bellevue Club (indoor in winter), USTA PNW league scores and practice sessions
- Travel to Palm Springs (golf getaways), Big Bear (ski), SF (board meetings) woven into storyline
- Seeded randomness → rerunning produces identical output
- No external dependencies — plain Node.js `fs` module
- Script in `scripts/` alongside existing project scripts
