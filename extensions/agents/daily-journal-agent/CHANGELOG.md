# Changelog

All notable changes to the **Daily Journal Agent** extension.

## 1.1.1

### Added
- Added explicit **Create vs. Update mode** framing in the overview, describing what the agent does when today’s note is missing vs. already exists.
- Added a dedicated **Create mode** section explaining that the agent generates the full daily journal structure (frontmatter + all standard sections) before prompting for the first section to fill.
- Added a more explicit **safe update workflow** for section updates, including that updates target content **between a section heading and the next heading**.
- Added detailed **task formatting rules** for Obsidian Tasks, including:
  - Date format requirement (`YYYY-MM-DD`)
  - Expanded emoji list: `📅` due, `⏳` scheduled, `🛫` start, `➕` created, `✅` done
  - Full priority emoji scale: `🔺` highest, `⏫` high, `🔼` medium, `🔽` low, `⏬` lowest
  - Recurrence examples (e.g., `🔁 every week on Monday`)
  - An explicit rule to **never rewrite the task text** the user entered
- Added clearer documentation that **structured fields remain verbatim**, explicitly including **goals** and **tags** (in addition to mood/energy/tasks).
- Added “Preview-first for rewritten sections” as a first-class feature item (highlighting preview before saving narrative rewrites).

### Changed
- Rewrote the opening description from a workflow-heavy explanation to a concise “thoughtful journaling assistant” summary emphasizing **focused prompts**, **optional narrative rewriting**, and **preserving existing writing**.
- Reworked “Brief overview” from “two core workflows” into “two modes” with clearer, tighter definitions and an explicit note that the agent can manage tasks via Obsidian Tasks metadata.
- Consolidated and reorganized the **Features** list from detailed tool-by-tool behavior into higher-level capabilities, while still calling out:
  - “Replace only the target section” vs. “Append to accumulating sections (Daily Log, Related Links)”
  - “Structured data stays verbatim” as a core principle
- Updated the **writing style options** wording and descriptions:
  - “Exact words (format only)” is now phrased as **“My exact words”**
  - Expanded definitions (e.g., Full narrative becomes concise first-person prose; Light polish clarifies “keep your voice”)
  - Clarified that the style preference applies only to reflective sections and **never** to structured fields (mood/energy/goals/tags/tasks).
- Restructured **Usage instructions**:
  - Renamed and reframed step 1 as “Start a session (create vs. update)”
  - Moved section selection into the update path of step 1
  - Split guidance into separate **Create mode** and **Update mode** sections with a single end-to-end “safe update workflow” sequence.
- Expanded and clarified **task management** behavior:
  - Added explicit action list with icons (add, complete, review/filter, reschedule, remove)
  - Added examples of review filtering criteria (overdue, priority, incomplete, etc.)
  - Updated the emoji conventions referenced to include scheduled/start/created and the full priority range.
- Updated the **Examples** section:
  - Replaced four examples (A–D) with three streamlined scenarios
  - Removed the standalone task-management walkthrough and redistributed relevant task details into the task rules section
  - Updated the Daily Log example to mention optionally adding a follow-up entry and conditional previewing when rewriting is enabled
  - Updated the evening example to explicitly include **goals + mood/energy** as part of the wrap-up flow.

### Removed
- Removed the explicit “Special cases” breakdown that previously enumerated behavior for Daily Log, Related Links, Mood/Energy (with exact `mood:` / `energy:` field names), and Tasks as separate bullet rules.
- Removed the dedicated **Task management example** walkthrough (previous “Example C”), replacing it with a more formal task rules section plus shorter scenario examples.
- Removed the documented optional behavior to set `status: complete` in frontmatter when finishing the day.