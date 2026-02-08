# Changelog

All notable changes to the **Daily Journal** extension.

## 1.1.0

### Added
- Agent-definition frontmatter replacing the prior website/extension-metadata block, including explicit `model: gpt-4o`, a concise agent `description`, and `skills: [obsidian-tasks]`.
- Expanded toolset to support safe in-place edits and interactive flows: added `update_note`, `ask_question`, and task tools (`get_tasks`, `create_task`, `list_tasks`, `mark_tasks`) alongside the existing note tools.
- New top-level README structure with `# Daily Journal Agent`, plus new sections: **Brief overview**, **Usage instructions**, **Examples**, and **Notes on task behavior**.
- New “incremental journaling” workflow description: create today’s note if missing, then return throughout the day to update specific sections without overwriting the rest.
- Section-focused update behavior details: read the whole note, rewrite only the selected section between headings, and preserve all other content.
- Three writing modes for reflective sections: **Full narrative**, **Light polish**, and **My exact words**.
- Append-only behavior for accumulating sections over time: **Daily Log** entries append (multi check-ins) and **Related Links** append additional wikilinks.
- Mood & Energy tracking stored directly in YAML frontmatter (`mood:` and `energy:`), explicitly stored verbatim (never rewritten).
- Integrated task management guidance aligned to **Obsidian Tasks** conventions, including emoji/date/priority rules and an example task line format.
- Preview-and-confirm step for rewritten sections before saving, plus explicit behavior to update `modified-date` in YAML frontmatter on save.
- New example walkthroughs covering: first check-in (create + morning intentions), midday append-to-log update, evening wrap-up (reflection + goals), and quick mood/energy check-in.
- New frontmatter-driven goal tracking elements in the examples, including writing `goals-completed:` verbatim in YAML frontmatter during evening wrap-up.

### Changed
- Replaced the prior Jekyll-style extension README metadata (e.g., `layout`, `permalink`, `identifier`, `version` history, categories/tags, and embedded changelog metadata) with an agent runtime/config-oriented frontmatter (name/description/model/tools/skills).
- Rewrote the introduction from a short “thoughtful AI journaling assistant” description into a detailed explanation emphasizing section-by-section updates, note safety, reflective question flows, optional narrative write-ups, and built-in task handling.
- Replaced the prior “Usage” approach based on direct invocation examples (e.g., `@daily-journal-agent Start my journal for today`) with a step-by-step session flow (start → pick a section → answer one-question-at-a-time prompts → preview → save → continue/end).
- Replaced the prior “Journal Structure” bullet list with a broader set of section choices, adding explicit options for **Manage Tasks** and **Mood & Energy Check-in** and reframing “Daily Log” as a repeatable “Daily Log Entry” flow.
- Replaced the prior “Tools Used” table with inline, feature-by-feature tool behavior descriptions (when each tool is called and why).
- Reframed “Pattern Recognition” into “Continuity and pattern awareness,” explicitly describing referencing previous entries via search to notice trends and progress.
- Shifted “Smart Linking” from “automatically suggests links to related notes” to a described **Related Links** section that accumulates wiki-links over time.

### Fixed
- Addressed the risk of accidental overwrites by explicitly defining safe-update behavior: only the chosen section is edited (or appended where appropriate) while all other note content is preserved.
- Improved content safety and consistency guarantees by specifying that mood/energy values and task text are stored exactly as entered (never rewritten).

### Removed
- Removed the prior **Installation** section instructions (extension browser/manual copy guidance).
- Removed the prior **Tips** section (journaling habit guidance and linking suggestions).
- Removed the prior embedded **Changelog** section (v1.0.0) and the standalone **License (MIT)** section from the README body.
- Removed the prior extension-site metadata fields such as `title`, `permalink`, `identifier`, `type`, `author`, repository/license URLs, categories/tags lists, `last_updated`, `size`, and the `versions` history block.