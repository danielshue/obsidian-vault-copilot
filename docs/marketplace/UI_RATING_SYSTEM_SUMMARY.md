# UI Specification: Rating System Summary

**Version:** 1.0  
**Date:** 2026-02-08  
**Status:** Design Specification  
**For:** Azure Functions Phase 2 - User Rating Interface

---

## Overview

This document specifies the UI changes needed to support the 1-5 star rating system with comments for extensions in the Vault Copilot marketplace.

### User Experience Goals

1. **Discoverable** - Users can easily find and submit ratings
2. **Intuitive** - Star rating interface is universally understood
3. **Non-intrusive** - Doesn't clutter existing UI
4. **Accessible** - Keyboard navigation and screen reader support
5. **Privacy-focused** - Clear options for anonymous vs. named ratings

### Key Features

- ✅ View aggregate ratings on extension cards
- ✅ Submit 1-5 star ratings with optional comments
- ✅ Edit or delete own ratings
- ✅ Browse other users' ratings and comments
- ✅ See rating distribution (breakdown by stars)
- ✅ Manage all ratings in dedicated tab

---

## UI Components Overview

| Component | Purpose | Implementation File |
|-----------|---------|---------------------|
| Extension Card (Enhanced) | Show ratings on cards | `ExtensionCard.ts` (update) |
| Rating Modal | Submit/edit ratings | `RatingModal.ts` (new) |
| Extension Detail View | Full ratings display | `ExtensionDetailModal.ts` (update) |
| My Ratings Tab | Manage user's ratings | `ExtensionBrowserView.ts` (update) |
| Settings Panel | Analytics opt-in/out | `CopilotSettingTab.ts` (update) |

---

## 1. Extension Card Updates

### Visual Changes

**Before (No Ratings):**
```
┌────────────────────────────────────────────────────┐
│ 📝 Daily Journal Agent                     v1.2.0  │
│ Creates structured daily journal entries           │
│ Productivity · Journaling          [Install]       │
└────────────────────────────────────────────────────┘
```

**After (With Ratings - Not Installed):**
```
┌────────────────────────────────────────────────────┐
│ 📝 Daily Journal Agent                     v1.2.0  │
│ Creates structured daily journal entries           │
│                                                     │
│ ⭐⭐⭐⭐⭐ 4.8 (89)  📥 371 installs                 │
│ Productivity · Journaling          [Install]       │
└────────────────────────────────────────────────────┘
```

**After (With Ratings - Installed):**
```
┌────────────────────────────────────────────────────┐
│ 📝 Daily Journal Agent                     v1.2.0  │
│ Creates structured daily journal entries           │
│                                                     │
│ ⭐⭐⭐⭐⭐ 4.8 (89)  📥 371 installs                 │
│ Productivity · Journaling  [Rate] [Uninstall]     │
└────────────────────────────────────────────────────┘
```

### New Elements

1. **Metrics Row** - Displays between description and footer
   - Star visualization (filled/half/empty stars)
   - Average rating number (e.g., "4.8")
   - Rating count in parentheses (e.g., "(89)")
   - Active install count with icon (e.g., "📥 371 installs")

2. **Rate Button** - Only shown when extension is installed
   - Replaces or appears next to Install button
   - Opens RatingModal on click

### Color Coding

Star colors based on rating:
- **4.5-5.0:** Green (#22c55e) - Excellent
- **3.5-4.4:** Yellow (#eab308) - Good
- **2.5-3.4:** Orange (#f97316) - Average
- **0.0-2.4:** Red (#ef4444) - Poor

### Code Example

```typescript
// In ExtensionCard.ts
private renderMetrics(container: HTMLElement): void {
  if (!this.extension.rating && !this.extension.activeInstalls) return;
  
  const metrics = container.createDiv('vc-card-metrics');
  
  // Rating
  if (this.extension.rating) {
    const rating = metrics.createDiv('vc-card-rating');
    rating.innerHTML = `
      <span class="vc-rating-stars ${this.getRatingClass(this.extension.rating)}">
        ${this.getStarHTML(this.extension.rating)}
      </span>
      <span class="vc-rating-score">${this.extension.rating.toFixed(1)}</span>
      <span class="vc-rating-count">(${this.extension.ratingCount || 0})</span>
    `;
  }
  
  // Install count
  if (this.extension.activeInstalls) {
    metrics.createSpan('vc-card-installs', {
      text: `📥 ${this.formatCount(this.extension.activeInstalls)} installs`,
    });
  }
}
```

---

## 2. Rating Modal

### Visual Design

```
┌───────────────────────────────────────────────────────┐
│  Rate Extension                                    ✕  │
├───────────────────────────────────────────────────────┤
│                                                       │
│  Daily Journal Agent v1.2.0                          │
│                                                       │
│  How would you rate this extension?                  │
│                                                       │
│       ☆  ☆  ☆  ☆  ☆                                  │
│     [Hover and click to rate 1-5 stars]             │
│                                                       │
│  Optional: Share your experience                     │
│  ┌─────────────────────────────────────────────┐     │
│  │ This extension transformed my daily         │     │
│  │ journaling workflow! Highly recommend.      │     │
│  │                                             │     │
│  └─────────────────────────────────────────────┘     │
│  0 / 500 characters                                  │
│                                                       │
│  ☑ Post as [your-github-username]                    │
│  ☐ Post anonymously                                  │
│                                                       │
│            [Cancel]  [Submit Rating]                 │
│                                                       │
└───────────────────────────────────────────────────────┘
```

### Interactive Behavior

**Star Selection:**
- Hover: Highlight stars up to cursor position
- Click: Set rating (1-5 stars)
- Visual feedback: Stars turn gold when selected
- Label updates: "Poor" (1) to "Excellent" (5)

**Comment Field:**
- Optional textarea
- Max 500 characters
- Real-time character count
- Multiline with vertical resize

**Privacy Options (if GitHub username set):**
- Radio buttons: Named vs. Anonymous
- Default: Post with GitHub username
- Username is hashed before sending to API

**Buttons:**
- Cancel: Close modal without saving
- Submit: Disabled until rating selected, enabled after

### States

1. **New Rating** - Empty stars, no comment
2. **Editing** - Pre-filled with existing rating/comment
3. **Submitting** - Button shows "Submitting...", disabled
4. **Success** - Toast notification, modal closes
5. **Error** - Error message shown, button re-enabled

### Code Example

```typescript
// New file: src/ui/extensions/RatingModal.ts
export class RatingModal extends Modal {
  private selectedRating: number = 0;
  private comment: string = '';
  
  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass('vc-rating-modal');

    // Extension info
    contentEl.createEl('h2', { text: 'Rate Extension' });
    contentEl.createDiv('vc-rating-info', {
      text: `${this.extension.name} v${this.extension.version}`,
    });

    // Prompt
    contentEl.createEl('p', {
      text: 'How would you rate this extension?',
    });

    // Star rating
    const stars = contentEl.createDiv('vc-rating-stars-interactive');
    for (let i = 1; i <= 5; i++) {
      const star = stars.createSpan({ text: '☆', cls: 'vc-star' });
      star.dataset.rating = i.toString();
      
      star.addEventListener('mouseenter', () => this.highlightStars(i));
      star.addEventListener('click', () => this.selectRating(i));
    }

    // Comment field
    const textarea = contentEl.createEl('textarea', {
      cls: 'vc-rating-comment',
      placeholder: 'What do you like or dislike?',
    });
    textarea.maxLength = 500;
    textarea.addEventListener('input', (e) => {
      this.comment = (e.target as HTMLTextAreaElement).value;
    });

    // Buttons
    const buttons = contentEl.createDiv('vc-rating-buttons');
    buttons.createEl('button', { text: 'Cancel' })
      .addEventListener('click', () => this.close());
    
    const submitBtn = buttons.createEl('button', {
      text: 'Submit Rating',
      cls: 'mod-cta',
    });
    submitBtn.disabled = true;
    submitBtn.addEventListener('click', () => this.submit());
    
    this.submitButton = submitBtn;
  }

  private selectRating(rating: number): void {
    this.selectedRating = rating;
    this.submitButton.disabled = false;
    this.highlightStars(rating);
  }

  private async submit(): Promise<void> {
    try {
      await this.analyticsService.submitRating({
        extensionId: this.extension.id,
        rating: this.selectedRating as 1 | 2 | 3 | 4 | 5,
        userHash: this.userHash,
        comment: this.comment.trim() || undefined,
      });
      
      new Notice('✅ Rating submitted successfully!');
      this.close();
    } catch (error) {
      new Notice('❌ Failed to submit rating');
    }
  }
}
```

---

## 3. Extension Detail View

### Layout

```
┌────────────────────────────────────────────────────────────┐
│  📝 Daily Journal Agent                                    │
│                                                            │
│  ⭐⭐⭐⭐⭐ 4.8 out of 5 stars (89 ratings)                  │
│  📥 371 active installs  •  v1.2.0                         │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐ │
│  │  Your Rating: ⭐⭐⭐⭐⭐ 5 stars        [Edit] [Delete] │ │
│  │  "Excellent daily journaling workflow!"              │ │
│  │  Posted 2 days ago                                   │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
│  ──────────────────────────────────────────────────────── │
│                                                            │
│  📊 Rating Breakdown                                       │
│  5★ ████████████████████████████████████████ 67% (60)    │
│  4★ ██████████████████ 22% (20)                          │
│  3★ ████ 6% (5)                                          │
│  2★ ██ 3% (3)                                            │
│  1★ █ 1% (1)                                             │
│                                                            │
│  ──────────────────────────────────────────────────────── │
│                                                            │
│  💬 Recent Reviews (showing 3 of 89)          [See All]   │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐ │
│  │  ⭐⭐⭐⭐⭐  Anonymous • 1 day ago                      │ │
│  │  "Game changer for my morning routine!"              │ │
│  │  👍 12   💬 Reply                                     │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐ │
│  │  ⭐⭐⭐⭐☆  john-dev • 3 days ago                      │ │
│  │  "Great extension, but would love more options."     │ │
│  │  👍 8   💬 Reply                                      │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
│  [Load More Reviews]                                      │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

### Sections

1. **Overall Rating Summary**
   - Large star display
   - Average score (4.8 / 5)
   - Total rating count
   - Active install count
   - Current version

2. **User's Rating (if rated)**
   - Highlighted box
   - User's stars and comment
   - Edit and Delete buttons
   - Timestamp (e.g., "Posted 2 days ago")

3. **Rating Breakdown**
   - Bar chart for each star level (5★ to 1★)
   - Percentage and count
   - Visual bars (filled proportionally)

4. **Recent Reviews**
   - Last 3-5 reviews
   - Username or "Anonymous"
   - Stars, comment, timestamp
   - Like count and Reply button (future)
   - "Load More" pagination

### Features

- **Edit Own Rating:** Opens RatingModal pre-filled
- **Delete Own Rating:** Confirmation dialog, then removes
- **See All Reviews:** Opens full reviews modal
- **Load More:** Pagination for additional reviews

---

## 4. My Ratings Tab

### Visual Design

```
┌────────────────────────────────────────────────────────────┐
│  [Browse] [Installed] [My Ratings] [Updates]              │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  📊 My Ratings (3)                              [Sort ▾]  │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐ │
│  │  📝 Daily Journal Agent  v1.2.0                      │ │
│  │  ⭐⭐⭐⭐⭐ 5 stars                                     │ │
│  │  "Excellent daily journaling workflow!"              │ │
│  │  Rated 2 days ago                   [Edit] [Delete]  │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐ │
│  │  ⚡ Quick Capture Skill  v2.1.0                      │ │
│  │  ⭐⭐⭐⭐☆ 4 stars                                     │ │
│  │  "Very useful, but needs mobile support."            │ │
│  │  Rated 1 week ago                   [Edit] [Delete]  │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐ │
│  │  🎤 Voice Notes Agent  v1.5.0                        │ │
│  │  ⭐⭐⭐☆☆ 3 stars                                     │ │
│  │  No comment provided                                 │ │
│  │  Rated 3 weeks ago                  [Edit] [Delete]  │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

### Features

- **List all user's ratings** in card format
- **Sort options:** Date (newest/oldest), Rating (high/low), Name
- **Quick actions:** Edit or Delete for each rating
- **Empty state:** "You haven't rated any extensions yet"
- **Stats:** Total ratings count in header

---

## 5. Settings UI

### Visual Design

```
Settings → Vault Copilot → Extension Analytics

┌────────────────────────────────────────────────────────────┐
│                                                            │
│  Extension Analytics                                       │
│  ────────────────────────────────────────────────────────  │
│                                                            │
│  ☑ Enable anonymous analytics                            │
│      Help improve extensions by sharing anonymous         │
│      install and rating data. No personal information     │
│      is collected.                                         │
│                                                            │
│  GitHub Username (optional)                               │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ your-github-username                                 │ │
│  └──────────────────────────────────────────────────────┘ │
│      Link your ratings to your GitHub account            │
│      (username is hashed for privacy)                     │
│                                                            │
│  Privacy                                                   │
│  • Your GitHub username is SHA-256 hashed                 │
│  • We only track installs, uninstalls, and ratings        │
│  • No vault content or personal data is collected         │
│  • You can delete all your data at any time               │
│                                                            │
│  [View Privacy Policy]  [Delete My Data]                  │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

### Controls

1. **Enable Analytics Toggle**
   - Default: ON (opt-out model)
   - When disabled: No data sent to Azure

2. **GitHub Username Field**
   - Optional text input
   - Used for hashing (privacy-preserving)
   - If empty: Anonymous UUID generated

3. **Privacy Information**
   - Bullet list of what is/isn't collected
   - Clear, concise statements

4. **Action Buttons**
   - View Privacy Policy: Opens documentation
   - Delete My Data: Confirms, then calls DELETE API

---

## CSS Styles

### Key Styles

```css
/* Star Visualization */
.vc-rating-stars .star-full {
  color: #fbbf24; /* Gold */
}

.vc-rating-stars .star-half {
  background: linear-gradient(90deg, #fbbf24 50%, #d1d5db 50%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.vc-rating-stars .star-empty {
  color: #d1d5db; /* Gray */
}

/* Color Coding by Rating */
.rating-excellent { color: #22c55e; } /* Green */
.rating-good { color: #eab308; }      /* Yellow */
.rating-average { color: #f97316; }   /* Orange */
.rating-poor { color: #ef4444; }      /* Red */

/* Interactive Stars (Modal) */
.vc-rating-star {
  cursor: pointer;
  font-size: 3em;
  transition: all 0.2s ease;
  color: #d1d5db;
}

.vc-rating-star:hover,
.vc-rating-star.selected {
  color: #fbbf24;
  transform: scale(1.1);
}

/* Rating Breakdown Bars */
.vc-breakdown-bar {
  height: 20px;
  background: linear-gradient(90deg, #fbbf24, #f59e0b);
  border-radius: 10px;
}

/* User's Rating Box (Highlighted) */
.vc-detail-user-rating {
  background: var(--background-secondary);
  border: 2px solid var(--interactive-accent);
  border-radius: 8px;
  padding: 16px;
}
```

---

## Accessibility

### Keyboard Navigation

**Rating Modal:**
- `Tab`: Navigate between elements
- `Arrow Keys`: Select star rating (1-5)
- `Enter`: Submit rating
- `Escape`: Close modal

**Extension Card:**
- `Tab`: Focus "Rate" button
- `Enter`: Open modal

### ARIA Attributes

```typescript
// Star rating
stars.setAttribute('role', 'radiogroup');
stars.setAttribute('aria-label', 'Rate this extension 1-5 stars');

star.setAttribute('role', 'radio');
star.setAttribute('aria-checked', isSelected ? 'true' : 'false');
star.setAttribute('aria-label', `${count} stars`);
```

### Screen Reader Support

- Star ratings announced as "4.8 out of 5 stars"
- Rating count announced as "89 ratings"
- Interactive stars have descriptive labels
- Form validation errors announced

### Color Blindness

- Don't rely solely on color
- Use numbers + stars together
- Text labels ("Excellent", "Poor")
- High contrast mode support

---

## Toast Notifications

### Success Messages

```
┌────────────────────────────────────┐
│ ✅ Rating submitted successfully!  │
└────────────────────────────────────┘
```

```
┌────────────────────────────────────┐
│ ✅ Rating updated                  │
└────────────────────────────────────┘
```

### Error Messages

```
┌──────────────────────────────────────────────┐
│ ❌ Failed to submit rating. Please try again │
└──────────────────────────────────────────────┘
```

```
┌──────────────────────────────────────────────┐
│ ⚠️ Analytics disabled in settings            │
└──────────────────────────────────────────────┘
```

---

## Implementation Checklist

### Phase 1: Core Components
- [ ] Create `RatingModal.ts`
- [ ] Update `ExtensionCard.ts` to show ratings
- [ ] Add "Rate" button to installed extensions
- [ ] Implement star rendering utilities

### Phase 2: Detail View
- [ ] Update `ExtensionDetailModal.ts`
- [ ] Add overall rating summary
- [ ] Add rating breakdown visualization
- [ ] Add recent reviews section
- [ ] Implement edit/delete rating

### Phase 3: Management
- [ ] Add "My Ratings" tab to browser
- [ ] Implement rating list view
- [ ] Add sort/filter options

### Phase 4: Settings
- [ ] Add analytics settings section
- [ ] Implement privacy controls
- [ ] Add data deletion feature

### Phase 5: Polish
- [ ] Add CSS animations
- [ ] Test keyboard navigation
- [ ] Test screen readers
- [ ] Add loading states
- [ ] Handle error states

---

## Testing

### Manual Testing

- [ ] Submit new rating
- [ ] Edit existing rating
- [ ] Delete rating
- [ ] View ratings on cards
- [ ] Navigate with keyboard only
- [ ] Test with screen reader
- [ ] Test on mobile (if supported)
- [ ] Test offline mode

### Edge Cases

- [ ] Submit without comment
- [ ] Submit with max-length comment (500 chars)
- [ ] Change rating multiple times
- [ ] Network error during submission
- [ ] Analytics disabled in settings
- [ ] No GitHub username (anonymous mode)

---

## Summary

This UI specification provides:

### ✅ User Features
- View aggregate ratings on extension cards
- Submit 1-5 star ratings with optional comments
- Edit or delete own ratings
- Browse reviews from other users
- Manage all ratings in dedicated tab
- Privacy controls (named vs. anonymous)

### 🎨 Design Principles
- Minimal disruption to existing UI
- Obsidian-consistent styling
- Accessible for all users
- Mobile-friendly responsive design
- Privacy-focused with clear controls

### 📊 Data Displayed
- Average rating (e.g., 4.8 stars)
- Total rating count (e.g., 89)
- Active install count (e.g., 371)
- Rating distribution (bar chart)
- Recent reviews with comments
- User's own rating (highlighted)

### 🔧 Implementation
- Complete TypeScript code examples
- CSS styles matching Obsidian theme
- Keyboard and screen reader support
- Error handling and loading states
- Toast notifications for feedback

---

**Next Steps:**
1. Review UI mockups and designs
2. Implement RatingModal component
3. Update ExtensionCard with ratings display
4. Enhance ExtensionDetailModal with reviews
5. Add "My Ratings" tab
6. Test accessibility features
7. Polish animations and transitions

---

**Document Version:** 1.0  
**Last Updated:** 2026-02-08  
**Status:** Ready for Implementation
