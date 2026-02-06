# Extension Marketplace Technical Design

**Version:** 1.0  
**Date:** 2026-02-05  
**Status:** Draft

## Executive Summary

This document outlines the technical architecture for the Vault Copilot Extension Marketplace, which enables users to discover, install, and manage extensions (agents, voice agents, prompts, skills, and MCP servers) from a centralized catalog. The design integrates into the existing Obsidian Vault Copilot plugin with minimal disruption to current functionality.

## Architecture Overview

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                    Obsidian Vault Copilot                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────┐        ┌──────────────────┐          │
│  │  CopilotPlugin   │────────│ ExtensionManager │          │
│  │   (main.ts)      │        │                  │          │
│  └──────────────────┘        └─────────┬────────┘          │
│                                        │                    │
│  ┌──────────────────┐        ┌─────────▼────────┐          │
│  │ CopilotChatView  │        │  CatalogService  │          │
│  │  (gear menu)     │        │                  │          │
│  └──────────────────┘        └──────────────────┘          │
│                                                             │
│  ┌──────────────────┐        ┌──────────────────┐          │
│  │ExtensionBrowser  │────────│  ExtensionCard   │          │
│  │     View         │        │   Component      │          │
│  └──────────────────┘        └──────────────────┘          │
│                                                             │
│  ┌──────────────────┐                                      │
│  │ Extension Detail │                                      │
│  │     Modal        │                                      │
│  └──────────────────┘                                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                       │
                       │ HTTPS
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│            vault-copilot-extensions (GitHub)                │
├─────────────────────────────────────────────────────────────┤
│  • GitHub Pages (catalog.json + detail pages)              │
│  • GitHub Actions (build & validation)                     │
│  • Extension Repository                                    │
└─────────────────────────────────────────────────────────────┘
```

## 1. Integration Points

### 1.1 Main Plugin Entry Point (`src/main.ts`)

**Changes Required:**
- Initialize `ExtensionManager` during plugin load
- Register `ExtensionBrowserView` with workspace
- Add command: "Open Extension Browser"
- Set up periodic update checks (if enabled in settings)
- Clean up extension manager on plugin unload

**Integration Pattern:**
```typescript
export default class CopilotPlugin extends Plugin {
    private extensionManager: ExtensionManager;
    
    async onload() {
        // ... existing initialization ...
        
        // Initialize extension manager
        this.extensionManager = new ExtensionManager(this.app, this);
        await this.extensionManager.initialize();
        
        // Register extension browser view
        this.registerView(
            EXTENSION_BROWSER_VIEW_TYPE,
            (leaf) => new ExtensionBrowserView(leaf, this.extensionManager)
        );
        
        // Add command
        this.addCommand({
            id: "open-vault-copilot-extension-browser",
            name: "Open Extension Browser",
            callback: () => this.openExtensionBrowser(),
        });
        
        // Check for updates on startup (if enabled)
        if (this.settings.extensionAutoCheckUpdates) {
            this.extensionManager.checkForUpdates();
        }
    }
    
    async onunload() {
        await this.extensionManager?.cleanup();
        // ... existing cleanup ...
    }
}
```

### 1.2 Settings Integration (`src/ui/settings/CopilotSettingTab.ts`)

**New Settings Section:**
```typescript
interface ExtensionSettings {
    catalogUrl: string;              // Default: official GitHub Pages URL
    checkUpdatesOnStartup: boolean;  // Default: true
    autoUpdateExtensions: boolean;   // Default: false
}
```

**UI Elements:**
- Catalog URL input field with validation
- Toggle for checking updates on startup
- Toggle for auto-updating extensions
- "Manage Extensions" button that opens ExtensionBrowserView

### 1.3 Chat View Integration (`src/ui/ChatView/CopilotChatView.ts`)

**Gear Menu Addition:**
- Add "Extensions" menu item above separator
- Show update badge when updates available
- Click opens ExtensionBrowserView

**Event Handling:**
- Subscribe to extension update notifications
- Display badge count on gear icon when updates available

## 2. Service Layer Design

### 2.1 ExtensionCatalogService

**Purpose:** Fetch, cache, and search the extension catalog.

**Responsibilities:**
- Download `catalog.json` from configured URL
- Cache catalog data with 5-minute TTL
- Provide search/filter capabilities
- Handle offline mode with stale cache
- Use Obsidian's `requestUrl` for cross-platform HTTP

**API Surface:**
```typescript
class ExtensionCatalogService {
    constructor(app: App, catalogUrl: string);
    
    // Fetch catalog (with automatic caching)
    async fetchCatalog(): Promise<CatalogResponse>;
    
    // Search and filter extensions
    async searchExtensions(filter: ExtensionFilter): Promise<ExtensionManifest[]>;
    
    // Get single extension by ID
    async getExtension(id: string): Promise<ExtensionManifest | null>;
    
    // Get featured extensions
    async getFeatured(): Promise<ExtensionManifest[]>;
    
    // Get available categories
    async getCategories(): Promise<string[]>;
    
    // Clear cache (for refresh)
    clearCache(): void;
    
    // Get cache status
    getCacheStatus(): { lastFetched: Date | null; isStale: boolean };
}
```

**Caching Strategy:**
- In-memory cache with timestamp
- 5-minute TTL for fresh data
- Fallback to stale cache if network fails
- Manual refresh via "Refresh" button

**Error Handling:**
- Network errors → use cached data + show notice
- Invalid catalog → log error + show notice
- Empty catalog → display friendly message

### 2.2 ExtensionManager

**Purpose:** Orchestrate installation, updates, and tracking of extensions.

**Responsibilities:**
- Track installed extensions in `.obsidian/vault-copilot-extensions.json`
- Download extension files to correct vault paths
- Handle dependency resolution
- Merge MCP server configurations
- Provide rollback on installation failure
- Check for available updates

**API Surface:**
```typescript
class ExtensionManager {
    constructor(app: App, plugin: CopilotPlugin);
    
    async initialize(): Promise<void>;
    
    // Tracking
    async getInstalledExtensions(): Promise<Map<string, InstalledExtension>>;
    isInstalled(id: string): boolean;
    getInstalledVersion(id: string): string | null;
    
    // Installation
    async installExtension(manifest: ExtensionManifest): Promise<ExtensionInstallResult>;
    async uninstallExtension(id: string): Promise<ExtensionInstallResult>;
    async updateExtension(id: string, newManifest: ExtensionManifest): Promise<ExtensionInstallResult>;
    
    // Updates
    async checkForUpdates(): Promise<Array<{ id: string; currentVersion: string; availableVersion: string }>>;
    
    // Cleanup
    async cleanup(): Promise<void>;
}
```

**Installation Process:**
1. Validate manifest and dependencies
2. Check for conflicts (duplicate IDs, file overwrites)
3. Download files to temporary location
4. Verify file integrity
5. Install dependencies (if any)
6. Move files to final location
7. Update tracking file
8. For MCP servers: merge into `mcp-servers.json`
9. Notify user of success

**Rollback Mechanism:**
- Keep backup of overwritten files
- If any step fails, restore backups
- Remove partially installed files
- Update tracking file to reflect rollback

**Dependency Resolution:**
- Detect circular dependencies (reject installation)
- Install dependencies in correct order
- Prompt user before installing dependencies
- Track dependency tree for uninstallation

### 2.3 State Management

**Tracking File:** `.obsidian/vault-copilot-extensions.json`

```json
{
  "version": "1.0",
  "installed": {
    "daily-journal-agent": {
      "version": "1.2.0",
      "installedAt": "2026-02-05T10:00:00Z",
      "files": [
        "Reference/Agents/daily-journal.agent.md"
      ],
      "dependencies": []
    },
    "task-management-prompt": {
      "version": "2.0.1",
      "installedAt": "2026-02-05T11:30:00Z",
      "files": [
        "Reference/Prompts/task-management.prompt.md"
      ],
      "dependencies": ["daily-journal-agent"]
    }
  }
}
```

**File Location Rationale:**
- Hidden in `.obsidian/` folder (not visible in vault browser)
- Not synced by default (device-specific installations)
- JSON format for easy reading/writing
- Includes dependency information for safe uninstallation

## 3. UI Component Design

### 3.1 ExtensionBrowserView

**Type:** `ItemView` (supports pop-out on desktop, modal fallback on mobile)

**Layout Sections:**
1. **Header:** Search bar, type filter, category filter, refresh button
2. **Installed:** Collapsible section showing installed extensions
3. **Featured:** Collapsible section showing featured extensions
4. **All Extensions:** Filterable/searchable list of all extensions

**State Management:**
- React to filter/search changes in real-time
- Track expanded/collapsed section state
- Show loading spinners during network operations
- Display error messages inline

**Mobile Considerations:**
- Use modal instead of ItemView on mobile
- Simplified layout for smaller screens
- Touch-friendly button sizes
- Scrollable sections

### 3.2 ExtensionCard Component

**Visual Design:**
```
┌───────────────────────────────────────────────────┐
│ 🤖 Daily Journal Agent                    v1.2.0  │
│ Creates structured daily journal entries          │
│ Productivity · Journaling        [Install/Update] │
└───────────────────────────────────────────────────┘
```

**States:**
- Default (not installed)
- Installed (current version)
- Update available (with badge)
- Installing/Updating (loading state)
- Error (with error message)

**Interactions:**
- Click card → opens ExtensionDetailModal
- Hover → highlight with subtle border
- Install/Update/Remove button → action confirmation

### 3.3 ExtensionDetailModal

**Layout:**
- Left: Sandboxed iframe rendering GitHub Pages detail page
- Right: Metadata sidebar with install button

**Security:**
- Use sandboxed iframe with restricted permissions
- Follow `McpAppContainer` pattern for safe rendering
- No JavaScript execution from iframe content
- CSP headers applied

**Sidebar Information:**
- Extension ID
- Version
- Last updated date
- File size
- Categories (as badges)
- Tools used (as list)
- Repository link
- Author link

## 4. Event System Design

### 4.1 Update Notifications

**Event Flow:**
```
ExtensionManager.checkForUpdates()
    ↓
Emits: "updates-available" event with count
    ↓
CopilotChatView subscribes and shows badge
    ↓
User clicks gear icon → sees "Extensions (3)" with badge
```

**Event Types:**
```typescript
type ExtensionEvent = 
    | { type: "updates-available"; count: number; extensions: string[] }
    | { type: "extension-installed"; extensionId: string }
    | { type: "extension-uninstalled"; extensionId: string }
    | { type: "extension-updated"; extensionId: string; newVersion: string }
    | { type: "catalog-refreshed"; extensionCount: number };
```

**Event Emitter Pattern:**
- Use Obsidian's `Events` class for pub/sub
- ExtensionManager extends `Events`
- Components subscribe during initialization
- Unsubscribe during cleanup

### 4.2 Notification UI

**Update Notification:**
- Show badge on gear icon with update count
- Display toast notification: "3 extension updates available"
- Click notification → opens extension browser with updates tab focused

**Installation Success:**
- Toast: "Daily Journal Agent installed successfully"
- Option to "View in vault" or "Dismiss"

**Installation Error:**
- Error notice with specific failure reason
- Offer "Retry" or "View Details" options

## 5. Data Flow Diagrams

### 5.1 Extension Installation Flow

```
User clicks "Install" button
    ↓
ExtensionBrowserView.handleInstall(manifest)
    ↓
ExtensionManager.installExtension(manifest)
    ↓
1. Validate manifest
2. Check dependencies
3. Download files
4. Verify integrity
5. Install to vault
6. Update tracking file
7. Emit "extension-installed" event
    ↓
UI updates (button → "Remove", card state changes)
    ↓
Success notification shown
```

### 5.2 Catalog Refresh Flow

```
User clicks "Refresh" button
    ↓
ExtensionCatalogService.clearCache()
    ↓
ExtensionCatalogService.fetchCatalog()
    ↓
Download catalog.json via requestUrl()
    ↓
Parse and validate JSON
    ↓
Cache in memory with timestamp
    ↓
Emit "catalog-refreshed" event
    ↓
ExtensionBrowserView re-renders extension lists
    ↓
ExtensionManager.checkForUpdates()
    ↓
If updates found → emit "updates-available"
    ↓
Badge appears on gear icon
```

### 5.3 Update Check Flow

```
Plugin startup (if enabled in settings)
    ↓
ExtensionManager.checkForUpdates()
    ↓
Get installed extensions from tracking file
    ↓
Fetch latest catalog
    ↓
Compare versions (semver)
    ↓
Build list of available updates
    ↓
If updates > 0 → emit "updates-available" event
    ↓
CopilotChatView shows badge on gear icon
```

## 6. File Structure

```
src/
├── extensions/
│   ├── types.ts                      # TypeScript interfaces
│   ├── ExtensionCatalogService.ts    # Catalog fetching & caching
│   ├── ExtensionManager.ts           # Installation & tracking
│   └── index.ts                      # Module exports
├── ui/
│   └── extensions/
│       ├── ExtensionBrowserView.ts   # Main browser UI
│       ├── ExtensionDetailModal.ts   # Detail page modal
│       ├── ExtensionCard.ts          # Reusable card component
│       └── index.ts                  # UI exports
└── tests/
    └── extensions/
        ├── types.test.ts
        ├── ExtensionCatalogService.test.ts
        └── ExtensionManager.test.ts
```

## 7. Security Considerations

### 7.1 Input Validation

- **Manifest validation:** All manifests must conform to JSON schema
- **File path validation:** Prevent directory traversal attacks
- **URL validation:** Only allow HTTPS URLs for downloads
- **Version validation:** Enforce semantic versioning format

### 7.2 Content Security

- **Sandboxed iframes:** Detail pages loaded with strict CSP
- **No code execution:** Extensions are data files only (no plugins)
- **File size limits:** Reject files exceeding reasonable limits
- **Manual review:** All extensions reviewed before catalog inclusion

### 7.3 Network Security

- **HTTPS only:** All catalog and download URLs must use HTTPS
- **Certificate validation:** Rely on Obsidian's `requestUrl` validation
- **Timeout handling:** 30-second timeout for all requests
- **Retry logic:** Exponential backoff for failed requests

### 7.4 Dependency Security

- **Circular dependency detection:** Prevent infinite loops
- **Dependency tree validation:** Limit depth to prevent abuse
- **Conflict detection:** Warn on file overwrites

## 8. Error Handling Strategy

### 8.1 Network Errors

**Scenario:** Catalog download fails

**Handling:**
1. Log error with details
2. Check for cached catalog
3. If cache available → use stale data + show warning notice
4. If no cache → show error modal with retry option
5. Provide "Use offline mode" option

### 8.2 Installation Errors

**Scenario:** Extension installation fails mid-process

**Handling:**
1. Stop installation immediately
2. Execute rollback procedure:
   - Restore backed-up files
   - Remove partially installed files
   - Revert tracking file changes
3. Log detailed error for debugging
4. Show user-friendly error notice
5. Offer "Report Issue" link to GitHub

### 8.3 Dependency Errors

**Scenario:** Required dependency not found

**Handling:**
1. Check if dependency is available in catalog
2. If available → prompt user to install dependency first
3. If not available → show error explaining missing dependency
4. Offer "Install anyway" option (advanced users)
5. Log dependency chain for debugging

### 8.4 MCP Merge Conflicts

**Scenario:** Extension provides MCP server config that conflicts with existing

**Handling:**
1. Detect conflict by comparing server names
2. Show confirmation modal:
   - Display existing config
   - Display new config
   - Options: "Replace", "Keep existing", "Cancel"
3. If user chooses "Replace" → backup old config
4. Apply user's choice
5. Log merge decision

## 9. Testing Strategy

### 9.1 Unit Tests

**Coverage Targets:**
- `types.ts`: Type guards, validation functions (100%)
- `ExtensionCatalogService.ts`: Fetch, cache, search logic (90%+)
- `ExtensionManager.ts`: Install/uninstall/update flows (90%+)

**Mocking Strategy:**
- Mock Obsidian's `requestUrl` for HTTP calls
- Mock `Vault` for file operations
- Mock `App` for accessing vault instance

### 9.2 Integration Tests

**Scenarios:**
- Complete installation flow (download → install → track)
- Update flow with existing installation
- Dependency installation chain
- MCP server configuration merging
- Rollback after failed installation

### 9.3 Manual Testing

**Checklist:**
- [ ] Open extension browser from gear menu
- [ ] Search and filter extensions
- [ ] Install extension and verify files in vault
- [ ] Update extension and verify new version
- [ ] Uninstall extension and verify cleanup
- [ ] Test offline mode with cached catalog
- [ ] Test update notifications and badges
- [ ] Test on mobile (modal instead of view)
- [ ] Test MCP server extension installation

## 10. Performance Considerations

### 10.1 Caching

- **Catalog caching:** 5-minute TTL reduces network requests
- **In-memory storage:** Avoid disk I/O for frequently accessed data
- **Lazy loading:** Load extension details only when modal opens

### 10.2 Network Optimization

- **Parallel downloads:** Download multiple files concurrently
- **Compression:** Use gzip for catalog.json (if server supports)
- **Conditional requests:** Use ETag/Last-Modified headers

### 10.3 UI Performance

- **Virtual scrolling:** For large extension lists (if needed)
- **Debounced search:** Wait 300ms after typing before filtering
- **Progressive rendering:** Render visible cards first

## 11. Migration & Rollout

### 11.1 Version Compatibility

- **Minimum plugin version:** Extensions specify `minVaultCopilotVersion`
- **Graceful degradation:** Hide extensions incompatible with current version
- **Version warnings:** Show notice when extension requires newer plugin

### 11.2 Beta Testing

**Phase 1:** Internal testing with seed extensions
**Phase 2:** Invite community beta testers
**Phase 3:** Soft launch (announce in Discord/GitHub)
**Phase 4:** Official release with blog post

### 11.3 Backward Compatibility

- Existing agents, prompts, skills remain functional
- No breaking changes to current workflows
- Extensions are additive feature (opt-in)

## 12. Future Enhancements

### 12.1 Community Ratings (Phase 2)

- Add serverless API for 1-5 star ratings
- Integrate GitHub OAuth for authentication
- Display aggregate ratings in extension cards
- Build script fetches ratings periodically

### 12.2 Advanced Features

- Extension auto-updates (with user confirmation)
- Extension recommendations based on usage
- Multi-extension bulk operations
- Export/import extension lists

### 12.3 Developer Tools

- CLI tool for extension validation
- Extension template generator
- Local testing mode for authors

## 13. Success Metrics

### 13.1 Adoption Metrics

- Number of extensions in catalog
- Number of extension installations
- Active users of extension browser
- Extension update adoption rate

### 13.2 Performance Metrics

- Catalog fetch time (target: < 2s)
- Installation time (target: < 5s for typical extension)
- Search response time (target: < 100ms)
- Cache hit rate (target: > 80%)

### 13.3 Quality Metrics

- Extension installation success rate (target: > 95%)
- Rollback frequency (lower is better)
- User-reported issues (track in GitHub)
- Community satisfaction (survey)

## 14. Conclusion

The Extension Marketplace architecture integrates seamlessly into the existing Vault Copilot plugin by:

1. **Minimal disruption:** Small changes to main.ts, settings, and chat view
2. **Modular design:** New services are independent and testable
3. **User-friendly:** Clear UI, helpful error messages, safe rollback
4. **Secure:** Input validation, sandboxed rendering, no code execution
5. **Performant:** Caching, lazy loading, debounced search
6. **Extensible:** Easy to add features in future phases

The implementation follows Obsidian plugin best practices and maintains consistency with the existing codebase patterns.

---

**Reviewers:**
- [ ] Architecture review
- [ ] Security review
- [ ] Performance review
- [ ] UI/UX review

**Approved by:** _____________  
**Date:** _____________
