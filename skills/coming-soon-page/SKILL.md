---
name: coming-soon-page
description: |
  A coming soon / launch page with countdown timer, email signup, and social links.
  Use when the brief asks for "coming soon", "launch page", "pre-launch",
  "under construction", or "launching soon".
triggers:
  - "coming soon"
  - "launch page"
  - "pre-launch"
  - "under construction"
  - "launching soon"
  - "即将推出"
  - "敬请期待"
od:
  mode: prototype
  platform: desktop
  scenario: marketing
  featured: 7
  preview:
    type: html
    entry: index.html
  design_system:
    requires: true
    sections: [color, typography, layout, components]
  craft:
    requires: [typography, forms]
---

# Coming Soon Page Skill

Produce a compelling coming soon / launch page with countdown timer and email signup.

## Workflow

1. **Read the active DESIGN.md** (injected above). Use the brand's visual
   language to build anticipation and excitement.
2. **Pick the launch date** from the brief, or use a placeholder 30 days out.
3. **Sections**, in order:
   - **Logo / Brand** — Small logo or wordmark at the top
   - **Headline** — Bold, exciting announcement like "Something amazing is coming"
     or "We're launching soon"
   - **Subheadline** — 1-2 sentences about what's being launched and why users
     should care
   - **Countdown timer** — Large, prominent timer showing days, hours, minutes,
     seconds until launch. Use DS accent color for numbers.
   - **Email signup** — Simple form with email input and submit button.
     Copy like "Be the first to know" or "Get notified at launch"
   - **Social links** — 3-5 icon links to social media profiles (Twitter, LinkedIn,
     Instagram, etc.). Use simple SVG icons.
   - **Footer** — Copyright notice or small tagline
4. **Write** a single HTML document:
   - `<!doctype html>` through `</html>`, CSS and JS inline.
   - Centered layout, vertically and horizontally.
   - Countdown timer updates every second via JavaScript.
   - Email form has basic validation (required, email format).
   - Form submission shows success message (no backend needed for prototype).
   - Social icons use DS accent color with hover effects.
   - `data-od-id` on logo, headline, timer, form, social links.
5. **Self-check**:
   - Countdown timer is accurate and updates smoothly.
   - Email input has proper validation and feedback.
   - Copy builds excitement without overpromising.
   - Visual hierarchy is clear (headline → timer → signup).
   - Mobile-friendly (timer stacks vertically on small screens).
   - Launch date is realistic (not in the past).

## Output contract

Emit between `<artifact>` tags:

```
<artifact identifier="coming-soon" type="text/html" title="Coming Soon Page">
<!doctype html>
<html>...</html>
</artifact>
```

One sentence before the artifact, nothing after.

## Copy examples

**Headline**
- "Something amazing is coming"
- "We're launching soon"
- "Get ready for [Product Name]"
- "The wait is almost over"

**Subheadline**
- "We're building something special. Sign up to be the first to know when we launch."
- "A new way to [solve problem]. Join the waitlist for early access."
- "Coming [Month Year]. Be part of the journey from day one."

**Email CTA**
- "Notify me at launch"
- "Join the waitlist"
- "Get early access"
- "Be the first to know"

## Countdown timer format

```
Days    Hours   Minutes   Seconds
 15  :   08   :   42    :   17
```

Or for closer launches:
```
Hours   Minutes   Seconds
 08   :   42    :   17
```
