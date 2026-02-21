---
creation-date: 2026-02-21
modified-date: 2026-02-21
tags: [automation, tag, review]
status: complete
type: reference
name: Tag review queue
enabled: true
triggers:
  - type: tag-added
    tag: "#review"
actions:
  - type: update-note
    path: "Reference/Review Queue.md"
    template: "# Review Queue\n\n- {{date:YYYY-MM-DD}}: New review item captured\n"
---
# Tag review queue automation

When `#review` is added anywhere, this updates [[Reference/Review Queue]] so review work stays visible.
