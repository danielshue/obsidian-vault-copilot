<p align="center">
  <img src="https://danielshue.github.io/obsidian-vault-copilot/assets/images/logo.png" alt="Vault Copilot Extensions" width="200">
</p>

<h1 align="center">Vault Copilot Extensions</h1>

<p align="center">
  <strong>Official extension catalog for Vault Copilot</strong><br>
  Discover and install agents, prompts, skills, voice agents, and MCP servers to supercharge your Obsidian vault.
</p>

<p align="center">
  <a href="https://danielshue.github.io/obsidian-vault-copilot/extensions/"><img src="https://img.shields.io/badge/📚_Browse-Extensions-blue?style=for-the-badge" alt="Browse Extensions"></a>
  <a href="../CONTRIBUTING.md"><img src="https://img.shields.io/badge/🤝-Contribute-green?style=for-the-badge" alt="Contribute"></a>
  <a href="../docs/AUTHORING.md"><img src="https://img.shields.io/badge/✍️-Create_Extension-purple?style=for-the-badge" alt="Create an Extension"></a>
</p>

---

## 🚀 Quick Start

### Install via Vault Copilot Plugin

1. Open your Obsidian vault with Vault Copilot installed
2. Click the gear icon (⚙️) in Copilot Chat
3. Select **Extensions**
4. Browse, search, and install extensions with one click

### Manual Installation

1. Browse the [catalog](https://danielshue.github.io/obsidian-vault-copilot/extensions/)
2. Find an extension you like
3. Download the extension file(s) from the detail page
4. Copy to the appropriate folder in your vault (see table below)

---

## 📦 Extension Types

| Type | Description | Install Path |
|------|-------------|--------------|
| 🤖 **Agent** | AI assistants with specific goals and capabilities | `Reference/Agents/` |
| 🎙️ **Voice Agent** | Voice-activated AI assistants for hands-free interaction | `Reference/Agents/` |
| 📝 **Prompt** | Reusable prompt templates for common tasks | `Reference/Prompts/` |
| ⚡ **Skill** | Agent capabilities and tools that extend functionality | `Reference/Skills/{name}/` |
| 🔌 **MCP Server** | Model Context Protocol integrations for external services | `.obsidian/mcp-servers.json` |

---

## 🆔 Extension Identification & Tracking

### GUID (Globally Unique Identifier)

Starting with v1.1.0, extensions can include an optional **GUID** field in their manifest. This provides:

- **Global uniqueness** - Guaranteed unique across all repositories and forks
- **Stable tracking** - Remains constant across version updates and migrations
- **Installation management** - Helps detect duplicates and manage updates across vaults

**Example:**
```json
{
  "guid": "a1b2c3d4-e5f6-4789-a012-b3c4d5e6f789",
  "id": "my-extension",
  "name": "My Extension",
  ...
}
```

The GUID is a UUID v4 format identifier that should never change once set. It's optional but highly recommended for production extensions.

### Related Files Bundling

Extensions can bundle multiple related files that are installed together automatically. This ensures all dependencies are available when a user installs an extension.

**Common use cases:**

- 🤖 **Agents with quick-start prompts** - Include ready-to-use prompts that invoke the agent
- 📋 **Templates** - Package starter templates alongside the extension
- ⚙️ **Configuration files** - Include default settings or config examples
- 📚 **Documentation** - Add user guides or reference materials

**Example: Daily Journal Agent**

The [Daily Journal Agent](./agents/daily-journal-agent/) bundles three files:

```json
{
  "files": [
    {
      "source": "daily-journal-agent.agent.md",
      "installPath": "Reference/Agents/"
    },
    {
      "source": "create-daily-journal.prompt.md",
      "installPath": "Reference/Prompts/"
    },
    {
      "source": "update-daily-journal.prompt.md",
      "installPath": "Reference/Prompts/"
    }
  ]
}
```

When installed, users get the main agent plus two companion prompts for creating and updating journal entries. All files work together as a cohesive journaling workflow.

**Benefits:**
- ✅ No missing dependencies
- ✅ Complete out-of-the-box experience
- ✅ Consistent file locations across installations
- ✅ Single-click installation for multi-file extensions

---

## ⭐ Featured Extensions

<!-- AUTO-GENERATED: Featured extensions will be populated by build script -->
<!-- Featured extensions showcase the best community contributions -->

*Coming soon — Featured extensions will appear here once the catalog grows!*

---

## 📂 Browse by Category

Explore extensions organized by use case:

| Category | Description |
|----------|-------------|
| [🎯 Productivity](https://danielshue.github.io/obsidian-vault-copilot/extensions/?category=productivity) | Task management, workflows, automation |
| [📓 Journaling](https://danielshue.github.io/obsidian-vault-copilot/extensions/?category=journaling) | Daily notes, reflection, habit tracking |
| [🔬 Research](https://danielshue.github.io/obsidian-vault-copilot/extensions/?category=research) | Academic research, citations, literature review |
| [✏️ Writing](https://danielshue.github.io/obsidian-vault-copilot/extensions/?category=writing) | Drafting, editing, content creation |
| [✅ Task Management](https://danielshue.github.io/obsidian-vault-copilot/extensions/?category=task-management) | To-dos, projects, GTD workflows |
| [🎙️ Voice](https://danielshue.github.io/obsidian-vault-copilot/extensions/?category=voice) | Voice-activated agents and commands |
| [🔗 Integration](https://danielshue.github.io/obsidian-vault-copilot/extensions/?category=integration) | External services, APIs, sync |
| [🔌 MCP](https://danielshue.github.io/obsidian-vault-copilot/extensions/?category=mcp) | Model Context Protocol servers |
| [🛠️ Utility](https://danielshue.github.io/obsidian-vault-copilot/extensions/?category=utility) | Helper tools and utilities |

---

## ✍️ Contributing

We welcome community contributions! See **[CONTRIBUTING.md](../CONTRIBUTING.md)** for detailed guidelines.

### Quick Submission Steps

1. **Fork** this repository
2. **Create** a folder at `extensions/{type}/{your-extension-name}/`
3. **Add** required files:
   - `manifest.json` — Extension metadata ([view schema](../schema/manifest.schema.json))
   - `README.md` — Documentation (becomes the detail page)
   - Extension file(s) — `.agent.md`, `.prompt.md`, etc.
   - `preview.png` — Screenshot (optional but recommended)
4. **Submit PR** — Automated checks will validate your submission

### Resources

- 📖 [Authoring Guide](../docs/AUTHORING.md) — Complete guide to creating extensions
- 📋 [Manifest Schema](../schema/manifest.schema.json) — JSON schema for validation
- 📁 [Examples](../schema/examples/) — Sample manifest files for each type
- 💬 [Discussions](https://github.com/danielshue/obsidian-vault-copilot/discussions) — Ask questions and share ideas

---

## 🔒 Security

We take security seriously. See **[SECURITY.md](../SECURITY.md)** for vulnerability reporting and security policies.

### Validation Checks

All extensions undergo automated validation:

- ✅ Manifest schema compliance
- ✅ Required files present
- ✅ Valid file naming conventions
- ✅ No executable code injection
- ✅ Safe URL patterns
- ✅ Proper frontmatter structure
- ✅ License compatibility

---

## 🛠️ Development

### Build Catalog Locally

```bash
# Install dependencies
npm install

# Build catalog.json from extensions
node scripts/build-catalog.cjs

# Validate a specific extension
node scripts/validate-extension.cjs extensions/agents/my-extension
```

### Test Jekyll Site Locally

```bash
# Install Jekyll (requires Ruby)
gem install bundler jekyll
bundle install

# Serve locally with live reload
bundle exec jekyll serve --livereload

# Visit http://localhost:4000/obsidian-vault-copilot
```

---

## 📊 Statistics

<!-- AUTO-GENERATED: Statistics will be populated by build script -->

| Metric | Count |
|--------|-------|
| Total Extensions | — |
| Agents | — |
| Voice Agents | — |
| Prompts | — |
| Skills | — |
| MCP Servers | — |
| Contributors | — |

*Statistics are updated automatically on each build.*

---

## 📄 License

This repository is licensed under the [MIT License](../LICENSE).

Individual extensions may have different licenses — check each extension's folder for details.

---

## 🙏 Acknowledgments

Built with love using:

- [Jekyll](https://jekyllrb.com/) — Static site generation
- [giscus](https://giscus.app/) — GitHub Discussions-powered comment system
- [GitHub Actions](https://github.com/features/actions) — CI/CD automation
- [Obsidian](https://obsidian.md/) — The best note-taking app for linked thinking

---

<p align="center">
  Maintained by <a href="https://github.com/danielshue">@danielshue</a><br>
</p>
