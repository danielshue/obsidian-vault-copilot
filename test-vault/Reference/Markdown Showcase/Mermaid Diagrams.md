---
title: Mermaid Diagrams
tags:
  - showcase
  - markdown
  - mermaid
  - diagrams
created: 2026-02-15
---

# Mermaid Diagrams

Obsidian renders Mermaid diagrams directly in fenced code blocks with the `mermaid` language tag.

## Flowchart

```mermaid
graph TD
    A[Start] --> B{Is it working?}
    B -->|Yes| C[Great!]
    B -->|No| D[Debug]
    D --> E[Check logs]
    E --> F[Fix the issue]
    F --> B
    C --> G[Ship it! 🚀]
```

## Sequence Diagram

```mermaid
sequenceDiagram
    participant U as User
    participant E as Editor
    participant L as Lezer Parser
    participant W as Widget

    U->>E: Types markdown
    E->>L: Parse syntax tree
    L-->>E: AST nodes
    E->>W: Create decorations
    W-->>U: Rendered preview
```

## Class Diagram

```mermaid
classDiagram
    class AIProvider {
        <<abstract>>
        +initialize()
        +sendMessage()
        +sendMessageStreaming()
        +abort()
        +isReady() bool
        +destroy()
    }
    class GitHubCopilotService {
        +initialize()
        +sendMessage()
    }
    class OpenAIService {
        +initialize()
        +sendMessage()
    }
    class AzureOpenAIService {
        +initialize()
        +sendMessage()
    }

    AIProvider <|-- GitHubCopilotService
    AIProvider <|-- OpenAIService
    AIProvider <|-- AzureOpenAIService
```

## State Diagram

```mermaid
stateDiagram-v2
    [*] --> Source
    Source --> LivePreview: Toggle mode
    LivePreview --> Reading: Toggle mode
    Reading --> Source: Toggle mode
    LivePreview --> Source: Ctrl+E
    Source --> Reading: Ctrl+E
    Reading --> LivePreview: Ctrl+E
```

## Gantt Chart

```mermaid
gantt
    title OFM Implementation Timeline
    dateFormat YYYY-MM-DD
    section Phase 1
        Lezer Extensions      :done, p1, 2026-02-10, 2d
        Marked Extensions      :done, p2, after p1, 2d
    section Phase 2
        Widget Classes         :done, p3, after p2, 1d
        LivePreview Updates    :done, p4, after p3, 1d
    section Phase 3
        EditorManager Wiring   :done, p5, after p4, 1d
        CSS Styles             :done, p6, after p5, 1d
    section Phase 4
        Testing & Polish       :active, p7, after p6, 3d
```

## Pie Chart

```mermaid
pie title Lines of Code by Module
    "LivePreviewPlugin" : 350
    "MarkedExtensions" : 420
    "LezerExtensions" : 250
    "Widgets" : 200
    "CSS Styles" : 300
```

## Entity Relationship

```mermaid
erDiagram
    VAULT ||--o{ FILE : contains
    FILE ||--o{ FRONTMATTER : has
    FILE ||--o{ TAG : tagged-with
    FILE }o--o{ FILE : links-to
    VAULT ||--|| SETTINGS : configured-by
    SETTINGS ||--o{ PROVIDER : uses
```
