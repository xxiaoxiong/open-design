---
name: about-page
description: |
  A standalone about page with company story, mission, values, team members,
  and milestones. Use when the brief asks for "about us", "our story",
  "who we are", or a "company" page.
triggers:
  - "about"
  - "about us"
  - "about page"
  - "our story"
  - "who we are"
  - "company page"
  - "关于我们"
  - "公司介绍"
od:
  mode: prototype
  platform: desktop
  scenario: marketing
  preview:
    type: html
    entry: index.html
  design_system:
    requires: true
    sections: [color, typography, layout, components]
  example_prompt: "Create an about page for a fintech startup founded in 2020, with a mission to democratize investing and a team of 5 people."
---

# About Page Skill

Produce a single-screen about page that respects the active DESIGN.md.

## Workflow

1. **Read the active DESIGN.md** (injected above). Use only its colors, type
   tokens, and component patterns.
2. **Determine the content structure** from the brief:
   - Company story/origin (required)
   - Mission statement (required)
   - Core values (optional, 3-5 values)
   - Team members (optional, with photos/avatars)
   - Milestones/timeline (optional)
   - Statistics/achievements (optional)
3. **Sections**, in order:
   - **Hero** — page title (e.g. "About Us", "Our Story"), compelling
     one-line subhead that captures the company essence.
   - **Story** — 2-3 paragraphs explaining the company origin, problem
     being solved, and approach. Use narrative structure with clear
     beginning (founding), middle (growth), and present state.
   - **Mission** — bold, centered mission statement. Use display typography
     from DESIGN.md. Keep it concise (1-2 sentences).
   - **Values** (if provided) — grid of 3-5 value cards. Each card: icon
     (simple SVG), value name, 1-2 sentence description. Use DS accent
     color for icons.
   - **Team** (if provided) — grid of team member cards. Each card: photo
     or avatar placeholder, name, role, optional 1-line bio. If no photos
     provided, use colored circle avatars with initials.
   - **Milestones** (if provided) — vertical timeline or horizontal year
     markers. Each milestone: year, title, brief description. Use DS
     accent color for timeline markers.
   - **Stats** (if provided) — 3-4 key metrics in large numbers. Use
     display font for numbers, body font for labels.
   - **CTA** — closing section with call-to-action (e.g. "Join our team",
     "Get in touch"). Button uses DS primary color.
4. **Write** one self-contained HTML document:
   - `<!doctype html>` through `</html>`, CSS in one inline `<style>`.
   - Centered layout, max-width container (~1200px).
   - Use CSS Grid for values, team, and stats sections.
   - `data-od-id` on each major section.
   - **Honest placeholders**: If team photos not provided, use initials
     in colored circles. If stats not provided, use `—` or omit section.
5. **Typography hierarchy**: Hero uses display font at large scale, mission
   uses display font at medium scale, body uses text font. Follow DESIGN.md
   type scale strictly.
6. **Self-check**:
   - Story is narrative and authentic (no generic "we're passionate" fluff).
   - Mission is specific and actionable (not "change the world").
   - Values are concrete behaviors, not buzzwords.
   - Team section respects privacy (no fake bios if not provided).
   - Timeline years are plausible for company age.
   - Stats are realistic and verifiable (no "10× faster" claims).
   - Mobile-friendly (sections stack vertically, grids adapt).

## Output contract

Emit between `<artifact>` tags:

```
<artifact identifier="about-slug" type="text/html" title="About — Company Name">
<!doctype html>
<html>...</html>
</artifact>
```

One sentence before the artifact, nothing after.
