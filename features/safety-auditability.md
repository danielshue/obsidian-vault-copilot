---
layout: feature
title: Safety, Trust, and Auditability
subtitle: Approve actions, preview changes, and track agent activity
icon: 🛡️
permalink: /features/safety-auditability/
---

## Overview

Vault Copilot is designed with **safety, trust, and transparency** as core principles. Every operation the AI performs is visible, reviewable, and requires your approval. You maintain complete control over what happens in your vault through permission gates, preview mechanisms, and comprehensive audit trails.

## Safety Mechanisms

### Permission Gates

All vault-modifying operations require approval:

- **Read operations**: Approve which notes AI can access
- **Write operations**: Confirm note creation and updates
- **Delete operations**: Explicit confirmation required
- **External calls**: Approve MCP and API requests

### Operation Preview

See exactly what will happen before approving:

```plaintext
AI wants to: Update note "Project Alpha"
Changes:
  - Frontmatter: status: "in progress" → "completed"
  - Add section: "Final Summary"
  - Update tags: +#completed

[Preview] [Approve] [Deny]
```

### Granular Permissions

Control operations at different levels:

- **Per-operation approval**: Approve each action individually
- **Batch approval**: Approve related operations together
- **Auto-approve patterns**: Set rules for trusted operations
- **Always deny patterns**: Block specific operation types

### Execution Budgets

Limit the scope of AI operations:

- **Max operations per session**: Cap total actions (e.g., 10 operations)
- **Max file modifications**: Limit writes per conversation
- **Max external calls**: Restrict API calls per session
- **Token budgets**: Limit AI processing costs

## Trust Building

### Transparent Operations

Every operation is fully visible:

- **Operation description**: Plain language explanation
- **Parameters**: All inputs and outputs shown
- **Affected files**: List of files that will change
- **Change preview**: Diff view of modifications

### Predictable Behavior

AI operations follow consistent patterns:

- **Type safety**: All parameters validated
- **Schema compliance**: Operations match definitions
- **Error handling**: Graceful failures with explanations
- **Rollback capability**: Undo recent changes

### Human-in-the-Loop

You're always in control:

- **Review before execution**: Nothing happens without approval
- **Interrupt capability**: Stop operations mid-execution
- **Manual override**: Take control at any point
- **Abort sessions**: End conversations immediately

## Audit Trails

### Conversation Logs

Complete record of all interactions:

- **Message history**: All prompts and responses
- **Context sent**: What data was shared with AI
- **Operations performed**: Every action taken
- **Timestamps**: When events occurred
- **Session metadata**: Model, agent, settings used

### Operation Logs

Detailed record of vault modifications:

```plaintext
2026-02-12 10:15:23 - Operation: update_note
  File: projects/project-alpha.md
  Changes: 
    - Frontmatter: status updated
    - Section added: "Summary"
  Status: Approved and executed
  User: You
```

### Tracing and Diagnostics

Advanced debugging and review:

- **SDK traces**: Full GitHub Copilot SDK logs
- **Tool calls**: All tool invocations and results
- **Model reasoning**: Thinking process (on supported models)
- **Performance metrics**: Response times, token usage

### Export and Review

Access your audit data:

- **Export logs**: Save as JSON or Markdown
- **Search history**: Find specific operations
- **Filter by date**: Review actions in time range
- **Session playback**: Review conversation flow

## Safety Features

### Preview Mechanisms

Multiple ways to preview changes:

#### Inline Preview

See changes directly in approval prompt:

```diff
- status: in progress
+ status: completed
```

#### Side-by-Side Diff

Compare before and after:

```plaintext
Before              | After
--------------------|--------------------
status: in progress | status: completed
                    | summary: Project done
```

#### Modal Preview

Full-screen detailed view:

- Line-by-line changes
- Syntax highlighting
- Expand/collapse sections
- Accept/reject individual changes

### Rollback Capabilities

Undo recent changes:

- **Single operation rollback**: Undo last action
- **Batch rollback**: Undo entire conversation's changes
- **Time-based rollback**: Revert to state before timestamp
- **Selective rollback**: Choose which operations to undo

### Safe Defaults

Conservative default settings:

- **Manual approval required**: No auto-approval by default
- **Preview enabled**: Always show changes before applying
- **Execution budgets**: Reasonable limits set
- **Read-only mode**: Available for exploration without risk

## Error Handling

### Graceful Failures

When operations fail:

- **Clear error messages**: Explain what went wrong
- **Recovery suggestions**: How to fix or work around
- **Partial completion**: Success status of batch operations
- **No side effects**: Failed operations don't corrupt vault

### Validation

All operations validated before execution:

- **Parameter validation**: Type and format checking
- **File existence**: Verify files before modifying
- **Permission checks**: Ensure operation is allowed
- **Conflict detection**: Identify competing changes

### Safe Execution

Protection during operation:

- **Atomic operations**: All or nothing execution
- **File locking**: Prevent concurrent modifications
- **Backup creation**: Automatic backups before major changes
- **Checkpointing**: Save state before risky operations

## Trust Indicators

### Operation Confidence

AI indicates confidence in operations:

```plaintext
High confidence: "Update status field" ✅
Medium confidence: "Infer project completion from recent notes" ⚠️
Low confidence: "Guess which project this relates to" ❌
```

### Review Recommendations

Suggestions for when to review carefully:

- **High-impact operations**: Deleting files, bulk updates
- **Uncertain operations**: Low-confidence inferences
- **First-time operations**: New types of actions
- **Cascading changes**: Operations affecting multiple files

### Execution Summary

After operations, receive summary:

```plaintext
Session Summary:
✅ 3 notes updated successfully
✅ 1 note created
⚠️ 1 operation skipped (permission denied)
❌ 0 failures

Time: 2 minutes
Operations: 5 total (4 approved, 1 denied)
Files modified: 4
```

## Best Practices

### Start Conservative

Begin with strict safety settings:

1. Enable preview for all operations
2. Require manual approval
3. Set low execution budgets
4. Review every operation

### Build Trust Gradually

As you get comfortable:

1. Identify safe operation patterns
2. Create auto-approve rules for trusted actions
3. Increase execution budgets
4. Batch-approve related operations

### Regular Audits

Periodically review:

- **Recent operations**: What has AI done?
- **Denied operations**: What did you block?
- **Error patterns**: Common failure modes?
- **Usage patterns**: How is AI being used?

### Safety Checklist

Before approving operations:

- ✅ Understand what will happen
- ✅ Review affected files
- ✅ Check change preview
- ✅ Verify intent matches expectation
- ✅ Consider reversibility
- ✅ Approve or deny

## Advanced Safety

### Operation Sandboxing

Test operations safely:

- **Dry-run mode**: Simulate without executing
- **Test vault**: Separate vault for experiments
- **Preview-only sessions**: Explore without risk
- **Snapshot/restore**: Save vault state before risky operations

### Custom Safety Rules

Define your own safety policies:

```yaml
safety_rules:
  - operation: delete_note
    require: explicit_confirmation
    warn: "Deleting notes is permanent"
  
  - operation: update_frontmatter
    auto_approve: true
    if: field in ["tags", "status"]
  
  - operation: create_note
    budget: 5
    per: session
```

### Multi-User Scenarios

For shared vaults:

- **User attribution**: Track who approved operations
- **Permission levels**: Different users, different access
- **Approval workflows**: Require multiple approvals
- **Notification systems**: Alert team of changes

## Getting Started

1. Review Settings → Safety & Permissions
2. Enable preview for all operations
3. Set conservative execution budgets
4. Try safe operations (read-only queries)
5. Gradually approve write operations
6. Review audit logs regularly
7. Adjust settings based on experience

## Related Features

- [Context Control & Privacy](/features/context-control/) - Control what AI accesses
- [Agentic Vault Operations](/features/agentic-vault-operations/) - Understanding operations
- [Real-Time Chats](/features/realtime-chats/) - Safe conversations
