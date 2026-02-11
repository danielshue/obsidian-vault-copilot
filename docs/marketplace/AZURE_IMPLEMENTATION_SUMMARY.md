# Azure Functions + Storage: Complete Implementation Summary

**Version:** 1.0  
**Date:** 2026-02-08  
**Status:** Implementation Guide  
**Scope:** Phase 2 - Hybrid Analytics (GitHub + Azure)

---

## Quick Links

- **[Executive Summary](#executive-summary)** - Start here
- **[Architecture](#architecture-overview)** - System design
- **[Infrastructure](#infrastructure-setup)** - Azure resources (Terraform)
- **[API Endpoints](#api-endpoints)** - Function specifications
- **[Plugin Integration](#plugin-integration)** - TypeScript code
- **[UI Changes](#ui-changes)** - Rating system UI
- **[Deployment](#deployment)** - Step-by-step guide
- **[Cost Analysis](#cost-analysis)** - Budget planning
- **[Testing](#testing-strategy)** - Quality assurance

---

## Executive Summary

This document provides a complete implementation guide for adding Azure Functions + Table Storage to the Vault Copilot extension marketplace, enabling accurate install tracking and 1-5 star ratings with comments.

### What This Enables

| Feature | Phase 1 (GitHub Only) | Phase 2 (Azure + GitHub) |
|---------|----------------------|--------------------------|
| **Install Tracking** | ❌ Downloads only (includes bots) | ✅ Actual installs in vaults |
| **Uninstall Tracking** | ❌ No | ✅ Yes (marks installs inactive) |
| **Ratings** | ⚠️ GitHub Reactions (ambiguous) | ✅ True 1-5 stars with comments |
| **Real-time Updates** | ❌ Daily batch | ✅ Immediate |
| **User-specific Data** | ❌ No | ✅ Yes (hashed for privacy) |
| **Cost** | ✅ Free | ⚠️ ~$0-10/month |
| **PR Workflow Impact** | ✅ None | ✅ None |

### Key Benefits

1. **Accurate Metrics** - Track real installations, not just downloads
2. **Better Ratings** - 1-5 stars with optional comments
3. **Privacy-Preserving** - User IDs are SHA-256 hashed
4. **Scalable** - Handles 100K+ users on free/cheap tier
5. **GDPR Compliant** - Full data deletion support
6. **Zero PR Changes** - Works with existing submission workflow

---

## Architecture Overview

### System Components

```
┌──────────────────────────────────────────────┐
│      Obsidian Plugin (Desktop/Mobile)        │
│  ┌────────────────────────────────────────┐  │
│  │ ExtensionManager                       │  │
│  │  - installExtension()                  │  │
│  │  - uninstallExtension()                │  │
│  │                                         │  │
│  │  New: ExtensionAnalyticsService        │  │
│  │  - trackInstall()                      │  │
│  │  - trackUninstall()                    │  │
│  │  - submitRating()                      │  │
│  └────────────────────────────────────────┘  │
└─────────┬────────────────────────────────────┘
          │ HTTPS (Obsidian's requestUrl)
          ↓
┌──────────────────────────────────────────────┐
│    Azure Functions (Node.js 18, Linux)       │
│  ┌────────────┬─────────────┬──────────────┐ │
│  │ TrackInstall│ SubmitRating│ GetMetrics   │ │
│  │ POST        │ POST        │ GET          │ │
│  └────────────┴─────────────┴──────────────┘ │
│                       ↓                       │
│  ┌──────────────────────────────────────────┐│
│  │  Azure Table Storage (Standard LRS)      ││
│  │  - Installs (partitioned by extensionId) ││
│  │  - Ratings  (partitioned by extensionId) ││
│  │  - MetricsCache (pre-computed)           ││
│  └──────────────────────────────────────────┘│
└───────────────────┬──────────────────────────┘
                    │ Daily fetch
                    ↓
┌──────────────────────────────────────────────┐
│         GitHub Actions (Catalog Build)       │
│  - Fetch Azure metrics via GET /api/metrics  │
│  - Merge with GitHub Release data            │
│  - Update catalog.json                       │
│  - Deploy to GitHub Pages                    │
└──────────────────────────────────────────────┘
```

### Data Flow

**Install Event:**
```
User clicks "Install" in Obsidian
  ↓
ExtensionManager installs files
  ↓
ExtensionAnalyticsService.trackInstall()
  ↓
POST /api/installs { extensionId, version, userHash, platform }
  ↓
Azure Function validates and stores in Table Storage
  ↓
Updates MetricsCache with new totals
  ↓
Returns 201 Created
```

**Rating Submission:**
```
User clicks "Rate" button
  ↓
RatingModal opens (1-5 stars + comment field)
  ↓
User selects 5 stars and types comment
  ↓
POST /api/ratings { extensionId, rating, userHash, comment }
  ↓
Azure Function checks if user already rated
  ↓
If exists: Update existing rating
If not: Insert new rating
  ↓
Recalculate average rating
  ↓
Update MetricsCache
  ↓
Return { averageRating: 4.8, ratingCount: 89 }
```

---

## Infrastructure Setup

### Azure Resources (Terraform)

Create these resources in Azure:

| Resource | SKU/Tier | Purpose | Monthly Cost |
|----------|----------|---------|--------------|
| Resource Group | N/A | Container for all resources | Free |
| Storage Account | Standard LRS | Table Storage for data | $0.05-5 |
| Function App | Consumption (Y1) | Serverless API | $0-5 |
| App Service Plan | Consumption | Hosting for Functions | Included |
| Application Insights | Free tier (5 GB) | Monitoring and logs | Free |

**Total:** ~$0.05-10/month depending on usage

### Terraform Configuration

See `infrastructure/terraform/main.tf` for complete IaC:

```hcl
resource "azurerm_linux_function_app" "main" {
  name                = "vault-copilot-api"
  resource_group_name = azurerm_resource_group.main.name
  location            = "East US"
  service_plan_id     = azurerm_service_plan.main.id
  
  site_config {
    application_stack {
      node_version = "18"
    }
    cors {
      allowed_origins = [
        "app://obsidian.md",
        "capacitor://localhost",
        "https://danielshue.github.io"
      ]
    }
  }
  
  app_settings = {
    "STORAGE_CONNECTION_STRING" = azurerm_storage_account.main.primary_connection_string
    "RATE_LIMIT_PER_USER"       = "100"
    "ENABLE_TELEMETRY"          = "true"
  }
}
```

**Deploy:**
```bash
cd infrastructure/terraform
terraform init
terraform plan -out=tfplan
terraform apply tfplan
```

---

## Data Schema

### Table: Installs

Tracks every installation event.

| Field | Type | Description |
|-------|------|-------------|
| PartitionKey | string | Extension ID (e.g., "daily-journal") |
| RowKey | string | UserHash_Timestamp (unique install ID) |
| UserHash | string | SHA-256 hash of GitHub username |
| Version | string | Extension version installed (e.g., "1.0.0") |
| Platform | string | "desktop" or "mobile" |
| VaultCopilotVersion | string | Plugin version (e.g., "0.0.20") |
| InstallDate | DateTime | When installed |
| IsActive | boolean | true if not uninstalled |
| UninstallDate | DateTime? | When uninstalled (null if active) |

**Query pattern:** Get all installs for extension
```typescript
const installs = await tableClient.listEntities({
  queryOptions: { filter: `PartitionKey eq '${extensionId}'` }
});
```

### Table: Ratings

Stores user ratings (one per user per extension).

| Field | Type | Description |
|-------|------|-------------|
| PartitionKey | string | Extension ID |
| RowKey | string | UserHash (ensures 1 rating per user) |
| Rating | number | 1-5 stars |
| Comment | string? | Optional feedback (max 500 chars) |
| Version | string? | Version rated (optional) |
| SubmittedDate | DateTime | First submission |
| UpdatedDate | DateTime | Last update |

**Query pattern:** Get user's rating
```typescript
const entity = await tableClient.getEntity(extensionId, userHash);
```

### Table: MetricsCache

Pre-computed metrics for fast API responses.

| Field | Type | Description |
|-------|------|-------------|
| PartitionKey | string | Extension ID |
| RowKey | string | Always "summary" |
| TotalInstalls | number | Total install events |
| ActiveInstalls | number | Installs not uninstalled |
| AverageRating | number | Mean of all ratings |
| RatingCount | number | Number of ratings |
| VersionBreakdown | string | JSON: stats per version |
| LastUpdated | DateTime | Cache refresh time |

---

## API Endpoints

### POST /api/installs

Track extension installation.

**Request:**
```json
{
  "extensionId": "daily-journal",
  "version": "1.0.0",
  "userHash": "abc123...", // SHA-256 (64 chars hex)
  "platform": "desktop",
  "vaultCopilotVersion": "0.0.20",
  "timestamp": "2026-02-08T12:00:00Z"
}
```

**Response (Success):**
```json
{
  "success": true,
  "installId": "abc123_20260208120000",
  "message": "Install tracked successfully"
}
```

**Validation:**
- extensionId: Required, alphanumeric + hyphens
- version: Required, semver (x.y.z)
- userHash: Required, 64-char SHA-256 hex
- platform: Required, enum ("desktop" | "mobile")

### POST /api/ratings

Submit or update rating.

**Request:**
```json
{
  "extensionId": "daily-journal",
  "rating": 5,
  "userHash": "abc123...",
  "comment": "Excellent workflow!",
  "version": "1.0.0"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Rating submitted successfully",
  "aggregateRating": 4.8,
  "ratingCount": 89
}
```

### GET /api/metrics/{extensionId}

Get aggregated metrics for extension.

**Response:**
```json
{
  "success": true,
  "extensionId": "daily-journal",
  "totalInstalls": 405,
  "activeInstalls": 371,
  "averageRating": 4.8,
  "ratingCount": 89,
  "versionBreakdown": {
    "1.0.0": { "installs": 120, "activeInstalls": 98, "rating": 4.6 },
    "2.0.0": { "installs": 200, "activeInstalls": 195, "rating": 4.9 }
  },
  "lastUpdated": "2026-02-08T15:00:00Z"
}
```

**Caching:** 15-minute server cache, 5-minute client cache

---

## Plugin Integration

### New Service: ExtensionAnalyticsService

**File:** `src/extensions/ExtensionAnalyticsService.ts` (NEW)

```typescript
import { requestUrl } from 'obsidian';

export class ExtensionAnalyticsService {
  constructor(private baseUrl: string) {}

  async trackInstall(event: {
    extensionId: string;
    version: string;
    userHash: string;
    platform: 'desktop' | 'mobile';
    vaultCopilotVersion: string;
    timestamp: string;
  }): Promise<void> {
    await this.request('/installs', {
      method: 'POST',
      body: JSON.stringify(event),
    });
  }

  async submitRating(submission: {
    extensionId: string;
    rating: 1 | 2 | 3 | 4 | 5;
    userHash: string;
    comment?: string;
    version?: string;
  }): Promise<{ averageRating: number; ratingCount: number }> {
    const response = await this.request('/ratings', {
      method: 'POST',
      body: JSON.stringify(submission),
    });
    return {
      averageRating: response.aggregateRating,
      ratingCount: response.ratingCount,
    };
  }

  private async request(endpoint: string, options: any): Promise<any> {
    const response = await requestUrl({
      url: `${this.baseUrl}${endpoint}`,
      method: options.method,
      headers: { 'Content-Type': 'application/json' },
      body: options.body,
      throw: false,
    });
    
    if (response.status >= 400) {
      throw new Error(response.json?.error || `HTTP ${response.status}`);
    }
    
    return response.json;
  }
}
```

### Update ExtensionManager

**File:** `src/extensions/ExtensionManager.ts` (UPDATE)

```typescript
export class ExtensionManager {
  private analyticsService: ExtensionAnalyticsService;

  constructor(app: App, plugin: CopilotPlugin) {
    this.analyticsService = new ExtensionAnalyticsService(
      plugin.settings.analyticsEndpoint || 
      'https://vault-copilot-api.purpleocean-69a206db.eastus.azurecontainerapps.io/api'
    );
  }

  async installExtension(manifest: ExtensionManifest): Promise<ExtensionInstallResult> {
    // ... existing installation logic ...
    
    // Track install (don't fail if analytics fails)
    if (this.plugin.settings.enableAnalytics !== false) {
      this.analyticsService.trackInstall({
        extensionId: manifest.id,
        version: manifest.version,
        userHash: await this.getUserHash(),
        platform: Platform.isMobile ? 'mobile' : 'desktop',
        vaultCopilotVersion: this.plugin.manifest.version,
        timestamp: new Date().toISOString(),
      }).catch(err => console.error('Analytics error:', err));
    }
    
    return { success: true, extensionId: manifest.id, installedFiles: files };
  }

  private async getUserHash(): Promise<string> {
    const username = this.plugin.settings.githubUsername;
    if (!username) {
      return this.plugin.settings.anonymousId || this.generateAnonymousId();
    }
    
    // Hash for privacy
    const encoder = new TextEncoder();
    const data = encoder.encode(username);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
}
```

### Settings Update

**File:** `src/types/settings.ts` (UPDATE)

```typescript
export interface CopilotSettings {
  // ... existing settings ...
  
  // Analytics settings (NEW)
  enableAnalytics?: boolean;  // Default: true
  analyticsEndpoint?: string;  // Default: Azure Functions URL
  githubUsername?: string;  // For hashing user ID
  anonymousId?: string;  // Generated UUID for anonymous users
}
```

---

## UI Changes

### 1. Extension Card - Display Ratings

**Before:**
```
┌──────────────────────────────────────────┐
│ 📝 Daily Journal Agent           v1.2.0  │
│ Creates structured daily journal entries │
│ Productivity · Journaling    [Install]   │
└──────────────────────────────────────────┘
```

**After (with ratings):**
```
┌──────────────────────────────────────────┐
│ 📝 Daily Journal Agent           v1.2.0  │
│ Creates structured daily journal entries │
│ ⭐⭐⭐⭐⭐ 4.8 (89)  📥 371 installs     │
│ Productivity · Journaling    [Install]   │
└──────────────────────────────────────────┘
```

**After (installed):**
```
┌──────────────────────────────────────────┐
│ 📝 Daily Journal Agent           v1.2.0  │
│ Creates structured daily journal entries │
│ ⭐⭐⭐⭐⭐ 4.8 (89)  📥 371 installs     │
│ Productivity · Journaling [Rate] [Remove]│
└──────────────────────────────────────────┘
```

### 2. Rating Modal

```
┌────────────────────────────────────────┐
│  Rate Extension                     ✕  │
├────────────────────────────────────────┤
│  Daily Journal Agent v1.2.0            │
│                                        │
│  How would you rate this extension?   │
│                                        │
│       ☆  ☆  ☆  ☆  ☆                   │
│     [Click stars to rate 1-5]         │
│                                        │
│  Optional: Share your experience      │
│  ┌──────────────────────────────────┐ │
│  │ Excellent daily journaling!      │ │
│  │                                  │ │
│  └──────────────────────────────────┘ │
│  0 / 500 characters                   │
│                                        │
│  ☑ Post as [your-github-username]     │
│  ☐ Post anonymously                   │
│                                        │
│        [Cancel]  [Submit Rating]      │
└────────────────────────────────────────┘
```

**Features:**
- Interactive star selection (hover effect)
- Optional comment (max 500 chars)
- Privacy choice (named or anonymous)
- Real-time character count
- Keyboard accessible

### 3. Extension Detail View

Shows aggregate rating, breakdown, and recent reviews.

```
┌──────────────────────────────────────────┐
│  📝 Daily Journal Agent                  │
│  ⭐⭐⭐⭐⭐ 4.8 out of 5 (89 ratings)     │
│  📥 371 active installs  •  v1.2.0       │
│                                          │
│  📊 Rating Breakdown                     │
│  5★ ████████████████ 67% (60)          │
│  4★ █████ 22% (20)                     │
│  3★ ██ 6% (5)                          │
│  2★ █ 3% (3)                           │
│  1★ ▌ 1% (1)                           │
│                                          │
│  💬 Recent Reviews                       │
│  [Shows last 3-5 reviews with comments] │
└──────────────────────────────────────────┘
```

### 4. Settings UI

```
Settings → Vault Copilot → Extension Analytics

☑ Enable anonymous analytics
    Help improve extensions by sharing anonymous
    install and rating data

GitHub Username (optional)
┌────────────────────────────────┐
│ your-github-username           │
└────────────────────────────────┘
  Link ratings to your GitHub account
  (username is hashed for privacy)

Privacy
• Your GitHub username is SHA-256 hashed
• We only track installs, uninstalls, and ratings
• No vault content or personal data is collected
• You can delete all your data at any time

[View Privacy Policy]  [Delete My Data]
```

---

## GitHub Actions Integration

### Update Catalog Build

**File:** `.github/workflows/build-and-deploy.yml` (UPDATE)

Add step to fetch Azure metrics:

```yaml
- name: Fetch Extension Metrics from Azure
  run: node scripts/fetch-azure-metrics.js
  env:
    AZURE_API_URL: https://vault-copilot-api.purpleocean-69a206db.eastus.azurecontainerapps.io/api
```

### New Script: fetch-azure-metrics.js

**File:** `scripts/fetch-azure-metrics.js` (NEW)

```javascript
const https = require('https');
const fs = require('fs').promises;

async function fetchMetrics(extensionIds) {
  const url = `${process.env.AZURE_API_URL}/metrics?ids=${extensionIds.join(',')}`;
  
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data).metrics));
    }).on('error', reject);
  });
}

async function main() {
  const catalog = JSON.parse(await fs.readFile('catalog/catalog.json', 'utf8'));
  const extensionIds = catalog.extensions.map(ext => ext.id);
  
  const azureMetrics = await fetchMetrics(extensionIds);
  
  for (const extension of catalog.extensions) {
    const metrics = azureMetrics[extension.id];
    if (metrics) {
      extension.installs = metrics.totalInstalls;
      extension.activeInstalls = metrics.activeInstalls;
      extension.rating = metrics.averageRating;
      extension.ratingCount = metrics.ratingCount;
      extension.analyticsSource = 'azure';
    }
  }
  
  await fs.writeFile('catalog/catalog.json', JSON.stringify(catalog, null, 2));
  console.log(`✅ Updated ${Object.keys(azureMetrics).length} extensions with Azure metrics`);
}

main().catch(console.error);
```

---

## Deployment

### Step-by-Step Deployment

**1. Deploy Azure Infrastructure**
```bash
cd infrastructure/terraform
terraform init
terraform apply
```

**2. Build Azure Functions**
```bash
cd azure-functions
npm install
npm run build
```

**3. Deploy Functions**
```bash
func azure functionapp publish vault-copilot-api
```

**4. Test Endpoints**
```bash
# Health check
curl https://vault-copilot-api.purpleocean-69a206db.eastus.azurecontainerapps.io/api/health

# Test install tracking
curl -X POST https://vault-copilot-api.purpleocean-69a206db.eastus.azurecontainerapps.io/api/installs \
  -H "Content-Type: application/json" \
  -d '{"extensionId":"test","version":"1.0.0","userHash":"'$(printf 'a%.0s' {1..64})'","platform":"desktop","vaultCopilotVersion":"0.0.20","timestamp":"2026-02-08T12:00:00Z"}'
```

**5. Update Plugin Settings**
```typescript
// In plugin settings default
analyticsEndpoint: 'https://vault-copilot-api.purpleocean-69a206db.eastus.azurecontainerapps.io/api'
enableAnalytics: true  // Opt-in by default
```

**6. Update GitHub Actions**
```bash
# Add secret to repository
gh secret set AZURE_API_URL --body "https://vault-copilot-api.purpleocean-69a206db.eastus.azurecontainerapps.io/api"
```

**7. Deploy Plugin Update**
- Build plugin with new analytics code
- Release new version
- Users get analytics on next update

---

## Cost Analysis

### Monthly Cost Breakdown

**Scenario 1: Low Traffic (1,000 users)**
- Installs/month: 3,000
- Ratings/month: 600
- Metric queries/month: 30,000

| Resource | Cost |
|----------|------|
| Functions (100K executions) | $0.00 (free tier) |
| Table Storage (1 GB, 100K ops) | $0.05 |
| Application Insights (100 MB) | $0.00 (free tier) |
| **Total** | **$0.05/month** |

**Scenario 2: Medium Traffic (10,000 users)**
- Installs/month: 30,000
- Ratings/month: 6,000
- Metric queries/month: 300,000

| Resource | Cost |
|----------|------|
| Functions (400K executions) | $0.00 (free tier) |
| Table Storage (10 GB, 500K ops) | $0.50 |
| Application Insights (1 GB) | $0.00 (free tier) |
| **Total** | **$0.50/month** |

**Scenario 3: High Traffic (100,000 users)**
- Installs/month: 300,000
- Ratings/month: 60,000
- Metric queries/month: 3,000,000

| Resource | Cost |
|----------|------|
| Functions (3.5M executions) | $0.70 |
| Table Storage (100 GB, 5M ops) | $5.00 |
| Application Insights (10 GB) | $2.30 |
| **Total** | **$8.00/month** |

### Cost Optimization

- Use consumption plan (pay per use)
- Enable caching to reduce queries
- Set budget alerts at $10/month
- Monitor Application Insights sampling

---

## Testing Strategy

### Unit Tests

Test analytics service:

```typescript
// src/tests/extensions/ExtensionAnalyticsService.test.ts
describe('ExtensionAnalyticsService', () => {
  it('should track install successfully', async () => {
    global.requestUrl = vi.fn().mockResolvedValue({
      status: 201,
      json: { success: true },
    });

    await service.trackInstall({ /* ... */ });
    
    expect(global.requestUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        url: expect.stringContaining('/installs'),
        method: 'POST',
      })
    );
  });
});
```

### Integration Tests

Test Azure Functions locally:

```bash
# Start local emulator
cd azure-functions
npm start

# Test endpoints
curl -X POST http://localhost:7071/api/installs \
  -H "Content-Type: application/json" \
  -d '{"extensionId":"test","version":"1.0.0",...}'
```

### Load Testing

```bash
# Install Artillery
npm install -g artillery

# Run load test
artillery quick --count 100 --num 10 \
  https://vault-copilot-api.purpleocean-69a206db.eastus.azurecontainerapps.io/api/metrics/daily-journal
```

---

## Migration from Phase 1

### Transition Strategy

**Week 1-2: Infrastructure Setup**
- Deploy Azure resources
- No impact on users

**Week 3-4: Plugin Integration**
- Add analytics code to plugin
- Default `enableAnalytics: false`
- Beta test with opt-in users

**Week 5-6: Soft Launch**
- Enable for 10% of users
- Monitor data quality
- Fix bugs

**Week 7-8: Full Launch**
- Enable by default (opt-out available)
- Announce in changelog
- Update documentation

**Week 9+: Optimization**
- Monitor costs
- Optimize queries
- Add features based on feedback

### Backward Compatibility

**Catalog format supports both:**
```json
{
  "id": "daily-journal",
  "downloads": 500,        // GitHub (Phase 1, fallback)
  "installs": 405,         // Azure (Phase 2, preferred)
  "activeInstalls": 371,   // Azure only
  "rating": 4.8,           // Azure (preferred) or GitHub Reactions
  "analyticsSource": "azure"  // Indicates data source
}
```

---

## Privacy & GDPR

### Data Collection

**✅ What we collect:**
- Extension install/uninstall events (anonymous)
- Extension ratings and comments (pseudonymous)
- Extension versions
- Platform (desktop/mobile)
- Timestamps

**❌ What we DON'T collect:**
- GitHub user IDs (only SHA-256 hash)
- Vault names or paths
- Note content
- IP addresses
- Personal information

### GDPR Compliance

**Right to Access:**
```
GET /api/user/{userHash}/data
```

**Right to Deletion:**
```
DELETE /api/user/{userHash}
```

**Right to Rectification:**
- Users can update ratings anytime

**Data Retention:**
- Active installs: Indefinite
- Uninstalled: 90 days
- Ratings: Indefinite (unless deleted)
- Logs: 30 days

---

## Monitoring

### Application Insights Queries

**Total installs per day:**
```kusto
customEvents
| where name == "InstallTracked"
| summarize count() by bin(timestamp, 1d)
| render timechart
```

**Average rating over time:**
```kusto
customEvents
| where name == "RatingSubmitted"
| summarize avg(todouble(customDimensions.rating)) by bin(timestamp, 1d)
| render timechart
```

**Error rate:**
```kusto
requests
| where success == false
| summarize failureRate = count() * 100.0 / countif(true)
```

### Alerts

- High error rate (>5%)
- Slow API calls (>5 seconds)
- Unusual traffic (>10K req/hour)
- Budget exceeded ($10/month)

---

## Next Steps

1. **Review** this implementation summary
2. **Deploy** Azure infrastructure via Terraform
3. **Implement** Azure Functions (see code examples)
4. **Integrate** analytics service into plugin
5. **Create** UI components for ratings
6. **Test** thoroughly (unit, integration, load)
7. **Deploy** to production (gradual rollout)
8. **Monitor** costs and performance
9. **Iterate** based on user feedback

---

## Support & Questions

- **Documentation:** See full guides in `/docs/marketplace/`
- **Issues:** Open GitHub issue
- **Discussions:** Use GitHub Discussions
- **Security:** Email security@example.com for vulnerabilities

---

**Document Version:** 1.0  
**Last Updated:** 2026-02-08  
**Author:** AI Assistant  
**Status:** Ready for Implementation
