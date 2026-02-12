---
layout: feature
title: Seamless GitHub Vault Sync
subtitle: Version, back up, and collaborate on your vault using Git
icon: 🔄
permalink: /features/github-vault-sync/
---

## Overview

Vault Copilot enables **seamless synchronization** between your Obsidian vault and GitHub using Git. Store, version, and back up your entire vault in GitHub repositories—enabling collaboration, history tracking, and secure cloud storage without sacrificing local control.

**Note**: GitHub vault sync requires the [Obsidian Git plugin](https://github.com/Vinzent03/obsidian-git) by Vinzent03, which is separate from Vault Copilot. This page explains how the two work together.

## Why Sync to GitHub?

### Version Control

Git provides complete version history:

- **Track changes**: See what changed, when, and why
- **Rollback capability**: Revert to any previous state
- **Branch workflows**: Experiment without affecting main vault
- **Merge conflicts**: Resolve competing edits
- **Blame/annotate**: See who wrote each line

### Backup and Recovery

GitHub serves as secure cloud backup:

- **Disaster recovery**: Restore vault from GitHub
- **Multiple devices**: Sync across computers and tablets
- **Offsite backup**: Protect against local data loss
- **Point-in-time recovery**: Restore to specific commit
- **Automated backups**: Regular auto-commits

### Collaboration

Share vaults with teams:

- **Shared knowledge bases**: Team vaults in one repository
- **Contribution workflows**: Pull requests for changes
- **Review process**: Approve changes before merging
- **Access control**: Manage who can read/write
- **Team coordination**: Use GitHub Issues and Projects

## How It Works

### Obsidian Git Plugin

The [Obsidian Git plugin](https://github.com/Vinzent03/obsidian-git) handles Git operations:

- **Automatic commits**: Commits changes on a schedule
- **Push/pull**: Sync with GitHub automatically
- **Conflict resolution**: Handles merge conflicts
- **Status display**: Shows Git status in Obsidian
- **Manual operations**: Commit, push, pull on demand

### Vault Copilot Integration

Vault Copilot complements Git workflows:

- **Commit message generation**: AI writes descriptive commits
- **Change summarization**: Describe what was modified
- **Conflict resolution assistance**: Help resolve merge conflicts
- **Repository operations**: Create repos, branches via AI
- **GitHub integration**: Link vault to Issues, PRs, Projects

## Setting Up GitHub Sync

### Prerequisites

1. **GitHub account**: Free or paid account
2. **Git installed**: On your computer (desktop only)
3. **Obsidian Git plugin**: Install from Community Plugins
4. **Vault Copilot** (optional): For AI-assisted Git operations

### Initial Setup

#### Step 1: Install Obsidian Git

1. Open Obsidian Settings → Community Plugins
2. Search for "Obsidian Git"
3. Click Install
4. Enable the plugin

#### Step 2: Create GitHub Repository

Option A - Via GitHub website:

1. Go to [github.com](https://github.com) and sign in
2. Click "New repository"
3. Name it (e.g., "my-obsidian-vault")
4. Set to Private (recommended)
5. Don't initialize with README
6. Create repository

Option B - Via Vault Copilot:

```plaintext
"Create a private GitHub repository called 'my-obsidian-vault'"
```

#### Step 3: Initialize Git in Vault

In Obsidian, open Command Palette (Ctrl/Cmd+P):

```plaintext
Obsidian Git: Initialize a new git repository
```

Or via Vault Copilot:

```plaintext
"Initialize Git in my vault and connect to GitHub repo"
```

#### Step 4: Configure Obsidian Git

Go to Settings → Obsidian Git:

- **Vault backup interval**: How often to auto-commit (e.g., 10 minutes)
- **Commit message**: Template for auto-commits
- **Auto pull interval**: How often to pull from remote
- **Push on backup**: Auto-push after commits
- **Pull updates on startup**: Sync on Obsidian launch

#### Step 5: First Commit and Push

Command Palette:

```plaintext
Obsidian Git: Create backup
```

This will:
1. Stage all files
2. Create initial commit
3. Push to GitHub

## Daily Workflows

### Automatic Sync

With default settings:

1. **Work in vault**: Edit notes normally
2. **Auto-commit**: Plugin commits every 10 minutes
3. **Auto-push**: Changes pushed to GitHub
4. **Auto-pull**: Updates from GitHub pulled automatically

You don't need to think about Git—it just works.

### Manual Sync

When you want control:

Command Palette:

- `Obsidian Git: Commit all changes` - Commit with custom message
- `Obsidian Git: Push` - Send to GitHub immediately
- `Obsidian Git: Pull` - Get latest from GitHub
- `Obsidian Git: Create backup` - Commit and push now

Or via Vault Copilot:

```plaintext
"Commit my changes with message 'Added project planning notes'"
"Push my vault to GitHub"
"Pull latest changes from GitHub"
```

### Multi-Device Sync

Using vault across devices:

**Device 1 (Desktop)**:
1. Edit notes
2. Auto-commit and push

**Device 2 (Laptop)**:
1. Open Obsidian
2. Auto-pull on startup
3. See latest changes

**Device 3 (Tablet)**:
1. Use Obsidian Mobile
2. Use alternative sync (Obsidian Sync or Working Copy + GitHub)

## Advanced Workflows

### Branching

Experiment safely:

```plaintext
Command: Obsidian Git: Create new branch
Name: experimental-reorganization
```

Work in branch, then merge when ready:

```plaintext
Command: Obsidian Git: Merge branch
Select: experimental-reorganization into main
```

Via Vault Copilot:

```plaintext
"Create a new branch called 'project-review'"
"Switch to main branch"
"Merge project-review into main"
```

### Conflict Resolution

When changes conflict:

1. Obsidian Git detects conflict
2. Shows conflicted files
3. Open file to see conflict markers
4. Manually resolve or use AI assistance

Via Vault Copilot:

```plaintext
"Help me resolve merge conflicts in Project Alpha note"
```

AI can:
- Explain the conflict
- Suggest resolution
- Merge changes intelligently
- Validate syntax after merge

### Shared Vaults

Collaborate with teams:

**Setup**:
1. Create organization/team repository
2. Add collaborators with appropriate permissions
3. Each team member clones repository
4. All members enable Obsidian Git

**Workflow**:
1. Pull before starting work
2. Edit notes
3. Commit with descriptive messages
4. Push to shared repository
5. Team members pull to get updates

**Best Practices**:
- Communicate about major changes
- Use branches for large refactors
- Commit frequently with clear messages
- Pull regularly to avoid conflicts
- Resolve conflicts promptly

## AI-Assisted Git Operations

### Commit Message Generation

Instead of generic "Updated notes":

```plaintext
"Generate a commit message for my recent changes"
```

AI analyzes changes and writes:

```
Add project planning notes and update sprint goals

- Created project-alpha-planning.md with goals and milestones
- Updated sprint-7.md with revised story points
- Added links between project and sprint notes
```

### Change Summarization

Review what changed:

```plaintext
"Summarize the changes in the last 5 commits"
```

AI reads Git history and explains:

```
Recent changes:
1. Project setup: Created initial project structure
2. Team docs: Added team member bios and roles
3. Sprint planning: Documented sprint 7 goals
4. Retrospective: Added sprint 6 retro notes
5. Bug fixes: Corrected formatting in several notes
```

### Repository Analysis

Understand your vault history:

```plaintext
"Show me the most frequently edited notes this month"
"Which folders have I been working in this week?"
"What topics have I been researching based on commit history?"
```

## Security and Privacy

### Private Repositories

Keep vaults private:

- **Private repos**: Only you (or team) can access
- **Access tokens**: Use personal access tokens, not passwords
- **2FA**: Enable two-factor authentication
- **Audit logs**: Review GitHub access logs

### Sensitive Content

For private or sensitive vaults:

- **Use private repositories**: Never public
- **Review .gitignore**: Exclude sensitive files
- **Encrypt sensitive notes**: Use OS-level encryption
- **Limit collaborators**: Grant access carefully

### .gitignore Best Practices

Exclude files you don't want in Git:

```gitignore
# Obsidian workspace files (user-specific)
.obsidian/workspace.json
.obsidian/workspace-mobile.json

# Plugin data (optional - may want to sync)
.obsidian/plugins/*/data.json

# Cache files
.obsidian/cache

# Private folder
Private/
```

## Troubleshooting

### Sync Conflicts

**Problem**: Merge conflicts on pull

**Solution**:
1. Open conflicted file
2. Look for conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`)
3. Choose which version to keep or merge both
4. Remove conflict markers
5. Commit resolved version

### Authentication Issues

**Problem**: Can't push to GitHub

**Solution**:
1. Check GitHub credentials
2. Use personal access token instead of password
3. Update remote URL if needed
4. Verify SSH key setup (if using SSH)

### Large File Warnings

**Problem**: Git warns about large files

**Solution**:
1. Use `.gitignore` to exclude large files
2. Consider Git LFS for large binaries
3. Store large files elsewhere (cloud storage)
4. Link to external files instead of embedding

## Benefits

- **Peace of mind**: Vault backed up to cloud
- **Version history**: Never lose work
- **Collaboration**: Share with team
- **Multi-device**: Sync across devices
- **Experimentation**: Try ideas safely with branches
- **Transparency**: See exactly what changed

## Getting Started

1. Install [Obsidian Git plugin](https://github.com/Vinzent03/obsidian-git)
2. Create private GitHub repository
3. Initialize Git in vault
4. Configure auto-commit and push
5. Work normally—Git handles the rest

## Related Features

- [Agentic Vault Operations](/features/agentic-vault-operations/) - AI vault modifications
- [Composable Workflows](/features/composable-workflows/) - Automate Git workflows
- [Safety & Auditability](/features/safety-auditability/) - Track changes safely
