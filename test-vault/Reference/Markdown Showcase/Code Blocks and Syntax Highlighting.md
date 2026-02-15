---
title: Code Blocks and Syntax Highlighting
tags:
  - showcase
  - markdown
  - code
  - highlight
created: 2026-02-15
---

# Code Blocks and Syntax Highlighting

Code blocks display with language labels and copy buttons. Syntax highlighting is powered by highlight.js.

## TypeScript

```typescript
interface WidgetConfig {
  language: string;
  code: string;
  showLineNumbers?: boolean;
}

class CodeBlockHeaderWidget extends WidgetType {
  constructor(readonly language: string, readonly code: string) {
    super();
  }

  toDOM(): HTMLElement {
    const header = document.createElement("div");
    header.className = "cm-codeblock-header";
    return header;
  }

  eq(other: CodeBlockHeaderWidget): boolean {
    return this.language === other.language;
  }
}
```

## Python

```python
from dataclasses import dataclass
from typing import Optional

@dataclass
class Note:
    """Represents a note in the vault."""
    path: str
    title: str
    tags: list[str]
    frontmatter: dict[str, any]
    content: str
    word_count: Optional[int] = None

    def summary(self) -> str:
        words = self.word_count or len(self.content.split())
        return f"{self.title} ({words} words, {len(self.tags)} tags)"

    @classmethod
    def from_markdown(cls, path: str, raw: str) -> "Note":
        # Parse frontmatter and body
        if raw.startswith("---"):
            _, fm, body = raw.split("---", 2)
            return cls(path=path, title=path, tags=[], frontmatter={}, content=body)
        return cls(path=path, title=path, tags=[], frontmatter={}, content=raw)
```

## Rust

```rust
use std::collections::HashMap;

#[derive(Debug, Clone)]
struct CalloutConfig {
    icon: &'static str,
    color: (u8, u8, u8),
    aliases: Vec<&'static str>,
}

impl CalloutConfig {
    fn resolve(type_name: &str) -> Option<&'static CalloutConfig> {
        static CONFIGS: once_cell::sync::Lazy<HashMap<&str, CalloutConfig>> =
            once_cell::sync::Lazy::new(|| {
                let mut m = HashMap::new();
                m.insert("note", CalloutConfig {
                    icon: "pencil",
                    color: (68, 138, 255),
                    aliases: vec![],
                });
                m
            });
        CONFIGS.get(type_name)
    }
}
```

## CSS

```css
.cm-callout {
  padding-left: 12px;
  border-left: 3px solid rgb(var(--callout-color, 68, 138, 255));
  background: rgba(var(--callout-color, 68, 138, 255), 0.08);
}

.cm-callout-title-line {
  font-weight: 600;
}

.cm-mermaid-widget {
  padding: 12px;
  margin: 8px 0;
  background: var(--background-secondary);
  border-radius: var(--radius-m, 6px);
  text-align: center;
}
```

## SQL

```sql
SELECT
    n.title,
    n.path,
    COUNT(t.name) AS tag_count,
    n.word_count,
    n.created_at
FROM notes n
LEFT JOIN note_tags nt ON n.id = nt.note_id
LEFT JOIN tags t ON nt.tag_id = t.id
WHERE n.vault_id = 'primary'
    AND n.created_at >= '2026-01-01'
GROUP BY n.id
HAVING COUNT(t.name) > 3
ORDER BY n.word_count DESC
LIMIT 20;
```

## JSON

```json
{
  "id": "obsidian-vault-copilot",
  "name": "Vault Copilot",
  "version": "0.0.42",
  "minAppVersion": "1.5.0",
  "description": "AI-powered copilot for your Obsidian vault",
  "isDesktopOnly": false,
  "author": "Dan Shue",
  "settings": {
    "providers": ["copilot", "openai", "azure-openai"],
    "defaultModel": "gpt-4o",
    "features": {
      "mermaidDiagrams": true,
      "katexMath": true,
      "callouts": true,
      "codeHighlighting": true
    }
  }
}
```

## Shell

```bash
# Build and deploy the plugin
npm run build
node deploy.mjs

# Reload in Obsidian
obsidian plugin:reload id=obsidian-vault-copilot

# Check for errors
obsidian dev:errors
obsidian dev:console level=error

# Take a screenshot
obsidian dev:screenshot path=screenshot.png
```

## Inline Code

You can also use inline code like `const x = 42` or `git commit -m "feat: add OFM support"` within paragraphs. Inline code uses a monospace font with a subtle background highlight.
