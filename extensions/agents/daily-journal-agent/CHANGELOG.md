# Changelog

All notable changes to the **Daily Journal Agent** extension.

## 1.1.0

### Added
- Added a new agent-style YAML header replacing the site/extension metadata, including explicit `model: gpt-4o`, a `skills` block, and an expanded tool list.
- Added support for **incremental journaling workflows**: create today’s note if missing, then return throughout the day to update only a selected section.
- Added **section selector** workflow with explicit supported sections: Morning Intentions, Gratitude, Daily Log Entry, Manage Tasks, Evening Reflection, Mood & Energy Check-in, and Add Related Links.
- Added **Tasks integration** via the `obsidian-tasks` skill, including viewing tasks in today’s note and actions to add, complete, review/filter, reschedule, and remove tasks (with emoji-based Tasks metadata like 📅, ✅, ⏫, 🔁).
- Added **Mood & energy tracking** that saves `mood:` and `energy:` into YAML frontmatter for longitudinal tracking.
- Added **writing style modes** for narrative sections (Full narrative, Light polish, Exact words) selected once per session when first entering a narrative-eligible section.
- Added an explicit **preview-before-save** step for narrative sections so users can request edits prior to writing changes.
- Added detailed end-to-end **Examples** (Morning setup, Midday log append, Task management, Evening wrap-up) that document expected agent behavior and outputs.

### Changed
- Rewrote the README from a short “features + simple usage prompts” guide into a **process-driven specification** describing tool calls, decision points, and save behavior step-by-step.
- Changed the core behavior from “create structured entries” to **create-or-update** with a strong emphasis on **not overwriting existing content**.
- Expanded tooling from read/create + daily note access to include **note updates** (`update_note`) and **interactive question flows** (`ask_question`), plus task-management tools.
- Changed “Journal Structure” from a fixed list (including Goals Progress) to a **section-based workflow**, with goals now described as being captured in frontmatter during Evening Reflection (rather than a dedicated “Goals Progress” section).
- Changed Daily Log and Related Links behavior to be explicitly **append-oriented**, accumulating content across the day rather than replacing existing text.
- Changed the “pattern recognition” concept into “continuity and pattern awareness,” explicitly noting it should support reflection **without rewriting structured data**.
- Changed usage guidance from single-command examples (e.g., “Start my journal for today”) to a **guided multi-step flow** (start session → choose section → answer one question at a time → preview → save only what changed → continue/stop).

### Fixed
- Addressed the risk of unintended overwrites by specifying a **read-then-update-only-the-chosen-section** save process using `read_note` + `update_note`, preserving all other content.
- Standardized metadata maintenance by requiring `modified-date` in frontmatter to be updated to “today” on each save.

### Removed
- Removed extension-site frontmatter fields (e.g., `layout`, `permalink`, `identifier`, `version`, `repository`, `license_url`, `categories`, `tags`, `versions`, `size`, and the embedded historical change list).
- Removed the Installation section that referenced the Extension Browser and manual copying instructions.
- Removed the Tools Used table in favor of describing tool usage inline as part of the workflow.
- Removed the “Tips” section and the standalone “Changelog v1.0.0” section from the README content.
- Removed the explicit “License: MIT” section from the body of the README.