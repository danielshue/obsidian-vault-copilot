# Changelog

All notable changes to the **Daily Journal** extension.

## 1.1.0

### Added
- Added new YAML frontmatter with agent runtime configuration fields (`name`, `description`, `model: gpt-4o`) and expanded capabilities metadata.
- Added new tools to support incremental edits and interactive flows: `update_note`, `ask_question`, plus task-oriented tools (`get_tasks`, `create_task`, `list_tasks`, `mark_tasks`).
- Added `skills` support for `obsidian-tasks`.
- Added a full “Brief overview” section describing two explicit workflows: **Create mode** (create today’s note if missing) and **Update mode** (pick a specific section to work on).
- Added detailed safety model for updates:
  - Explicit “safety for existing content” principle (update one section while preserving all others).
  - Explicit append-only behavior for accumulating sections (Daily Log and Related links).
- Added multiple new feature areas not present before:
  - **Section-by-section updates** that operate “between headings”.
  - **Narrative rewriting (optional)** with selectable styles (Full narrative / Light polish / Exact words).
  - **Task management inside the journal** with Obsidian Tasks emoji conventions and a “never rewrite task text” rule.
  - **Mood & energy tracking** stored in YAML frontmatter for longitudinal tracking.
  - **Related links** behavior that appends wikilinks to a dedicated “Related” section.
- Added a comprehensive “Usage instructions” guide with a 4-step flow:
  - Start the agent
  - Choose create vs update
  - Complete a section with a defined safe-update loop (read → update one section/append → update `modified-date` → preview → save)
  - Continue or end the session
- Added explicit rewrite/data-handling rules by content type:
  - “Always verbatim” data (mood/energy/goals/tags/tasks) vs “Narrative eligible” sections (Morning Intentions, Gratitude, Daily Log, Evening Reflection).
- Added a “Task management behavior (high level)” section detailing supported task operations (add/complete/review/reschedule/remove) and formatting rules (emoji placement relative to description/tags).
- Added a new “Examples” section with three step-by-step scenarios:
  - Creating today’s journal (first session)
  - Midday update that appends to Daily Log
  - Evening wrap-up that produces a concise reflection and updates frontmatter

### Changed
- Replaced the previous website-style metadata block (e.g., `layout`, `title`, `permalink`, `identifier`, `version`, `author`, `repository`, `license`, `categories`, `tags`, `last_updated`, `size`, and embedded `versions` history) with an agent-focused configuration frontmatter and removed the embedded historical release listing from the README content.
- Expanded and reframed the agent from a “structured journal entries with gratitude and goals” assistant into a **section-focused**, **incremental update** journaling assistant that avoids overwriting unrelated sections.
- Changed the feature presentation from a short emoji-based bullet list (Structured Entries / Goal Tracking / Pattern Recognition / Guided Prompts / Smart Linking) to a detailed, multi-level feature specification including creation, safe section updates, rewrite modes, append-only sections, tasks, and mood/energy tracking.
- Changed “Usage” from three short invocation examples (start day / evening reflection / review themes) to an end-to-end operational guide that explains the agent’s tool-driven sequence and decision points.
- Changed the journaling model from a fixed “Each entry includes” list to a selectable section workflow where the user chooses what to work on, including new section options (Tasks, Mood & Energy, Add Related Links).
- Changed tool documentation from a simple “Tools Used” purpose table to step-by-step behavior describing *when and why* tools are called (including `update_note` and previews) and how frontmatter is updated (`modified-date`).

### Fixed
- Implemented explicit content-safety constraints missing from v1.0.0 documentation: section-scoped updates, append-only behavior for Daily Log/Related, and verbatim preservation rules for structured data (especially tasks), reducing the risk of overwriting unrelated content during updates.

### Removed
- Removed the previous README’s “Installation” instructions that referenced copying `daily-journal-agent.agent.md` to `Reference/Agents/`.
- Removed the previous “Tools Used” markdown table that listed tool purposes.
- Removed the previous “Tips” section (journaling consistency, honesty, gratitude on hard days, linking advice).
- Removed the previous “Changelog” section embedded in the README (v1.0.0 bullets).
- Removed explicit mention of v1.0.0 features around **pattern recognition across previous entries** and “smart linking” as automatic suggestions; the new README instead focuses on updating today’s note safely and appending related wikilinks to a dedicated section.