---
title: Callouts Gallery
tags:
  - showcase
  - markdown
  - callouts
created: 2026-02-15
---

# Callouts Gallery

Obsidian supports 13 callout types with aliases. Each has a unique color and icon.

## Basic Callouts

> [!note]
> This is a **note** callout. Use it for general information or side notes that complement the main content.

> [!info]
> Information callouts highlight important details the reader should be aware of.

> [!tip]
> Tips provide helpful suggestions or best practices. The `hint` and `important` aliases also map to this style.

> [!warning]
> Warnings alert readers to potential issues or things to be careful about. Also available as `caution` or `attention`.

## Success & Failure

> [!success]
> Operation completed successfully! All tests passed. Aliases: `check`, `done`.

> [!failure]
> Something went wrong. The build failed with 3 errors. Aliases: `fail`, `missing`.

> [!danger]
> Critical security vulnerability detected. Immediate action required. Alias: `error`.

> [!bug]
> There's a known issue with the date parser when handling timezone offsets greater than ±12.

## Questions & Todos

> [!question]
> How does the Lezer parser handle nested inline syntax like `==**bold highlight**==`? Aliases: `help`, `faq`.

> [!todo]
> - [x] Implement highlight syntax
> - [x] Add callout rendering
> - [ ] Test on mobile
> - [ ] Write documentation

## Other Types

> [!abstract]
> This document demonstrates the complete set of Obsidian callout types supported by the Web Shell editor. Aliases: `summary`, `tldr`.

> [!example]
> Here's an example of using callouts in your notes:
> ```markdown
> > [!tip] Pro tip
> > You can add a custom title after the type!
> ```

> [!quote]
> "The best way to predict the future is to invent it." — Alan Kay
> Alias: `cite`.

## Custom Titles

> [!note] Important Implementation Detail
> You can override the default title by adding text after the callout type identifier.

> [!warning] Breaking Change in v2.0
> The API endpoint `/api/v1/users` has been deprecated. Please migrate to `/api/v2/users` before the next release.

## Foldable Callouts

> [!tip]+ Click to expand — Tips for writing good callouts
> 1. Keep callouts concise — they should enhance, not replace, main content
> 2. Use the right type for the right purpose
> 3. Don't overuse them — too many callouts reduce their impact
> 4. Custom titles make callouts more scannable

> [!danger]- Collapsed by default — Security considerations
> Never store API keys or passwords in your notes without encryption. Use environment variables or a secrets manager instead.

## Nested Content

> [!info] Callouts support rich content
> You can include:
> - **Bold** and *italic* text
> - `Inline code` and ==highlights==
> - Links like [[Getting Started]]
> - Lists, tables, and more
>
> Even multiple paragraphs work inside callouts.
