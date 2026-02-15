---
title: Obsidian Flavored Markdown
tags:
  - showcase
  - markdown
  - ofm
  - wikilinks
  - embeds
created: 2026-02-15
---

# Obsidian Flavored Markdown

This document showcases syntax unique to Obsidian that extends standard Markdown and GFM.

## Highlights

Use double equals to ==highlight important text== in your notes.

You can combine highlights with other formatting: ==**bold highlight**== or ==*italic highlight*==.

Highlights are great for ==marking key terms== during study sessions or ==action items== in meeting notes.

## Internal Links (Wikilinks)

Link to other notes with double brackets: [[Getting Started]]

Link with display text: [[AI Integration Patterns|AI Patterns Guide]]

Link to a heading: [[Getting Started#Installation]]

Link to a specific block: [[Getting Started#^important-note]]

## Embeds

Embed another note's content:

![[Getting Started]]

Embed a specific section:

![[AI Integration Patterns#Overview]]

### Image Embeds with Sizing

Embed images with optional width/height:

![[example-image.png]]

With width only:

![[example-image.png|400]]

With width and height:

![[example-image.png|400x300]]

## Comments

Obsidian comments are hidden in preview and reading modes.

This text is visible. %%This comment is hidden in preview.%% And this is visible again.

%%
Multi-line comments work too.
This entire block is hidden in preview mode.
Useful for internal notes or TODO items.
%%

## Footnotes

Here's a statement that needs a citation[^1]. And another interesting claim[^2].

Footnotes can also be inline[^note-about-inline].

[^1]: This is the first footnote with a simple numeric reference.
[^2]: Footnotes can contain **rich text**, `code`, and even links.
[^note-about-inline]: Footnote IDs can be descriptive strings, not just numbers.

## Task Lists

- [x] Implement ==highlight== syntax parsing
- [x] Add [[Callouts Gallery|callout]] support with 13 types
- [x] Render $\LaTeX$ math with KaTeX
- [x] Support ```mermaid``` diagrams
- [ ] Add block reference support (`^block-id`)
- [ ] Implement transclusion for embeds

## Combining Everything

> [!example] OFM in Action
> You can combine all these features together:
> - ==Highlighted text== in callouts
> - Links to [[Math and Equations]] or [[Mermaid Diagrams]]
> - Inline math like $E = mc^2$
> - Footnotes[^combo] for references
> - And %%hidden comments%% for your eyes only

[^combo]: This footnote appears inside a callout example.

## Standard Markdown (for comparison)

These standard features also render correctly:

### Text Formatting

**Bold text**, *italic text*, ~~strikethrough~~, and `inline code`.

### Links and Images

[External link](https://obsidian.md) — opens in browser.

![Alt text](https://via.placeholder.com/200x100 "Hover title")

### Blockquotes

> Standard blockquotes still work perfectly.
> They can span multiple lines.
>
> And include blank lines.

### Horizontal Rules

---

### Tables

| Feature | Live Preview | Reading View | Source |
|---------|:---:|:---:|:---:|
| Highlights | ✅ | ✅ | Raw |
| Wikilinks | ✅ | ✅ | Raw |
| Callouts | ✅ | ✅ | Raw |
| Math | ✅ | ✅ | Raw |
| Mermaid | ✅ | ✅ | Raw |
| Code Highlighting | ✅ | ✅ | Raw |
| Comments | Hidden | Hidden | Visible |
| Footnotes | ✅ | ✅ | Raw |
