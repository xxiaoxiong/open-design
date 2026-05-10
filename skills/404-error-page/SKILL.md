---
name: 404-error-page
description: |
  A 404 error page with helpful navigation, search, and visual interest.
  Use when the brief asks for "404", "error page", "not found page", or
  "page not found".
triggers:
  - "404"
  - "404 page"
  - "error page"
  - "not found"
  - "page not found"
  - "错误页面"
  - "页面未找到"
od:
  mode: prototype
  platform: desktop
  scenario: error-handling
  preview:
    type: html
    entry: index.html
  design_system:
    requires: true
    sections: [color, typography, layout, components]
  craft:
    requires: [typography, accessibility-baseline]
---

# 404 Error Page Skill

Produce a friendly, helpful 404 error page that guides users back to useful content.

## Workflow

1. **Read the active DESIGN.md** (injected above). Use the brand's voice and
   visual language to make the error feel on-brand, not generic.
2. **Pick the tone** from the brief or DS mood:
   - **Playful**: Humorous copy, illustration, or animation
   - **Professional**: Clear, direct messaging with helpful links
   - **Minimal**: Simple message with essential navigation
3. **Sections**, in order:
   - **Visual element** — Large 404 number, illustration, or icon. Use DS
     accent color or a gradient. Keep it simple (no external images).
   - **Headline** — Short, friendly message like "Page not found" or
     "Oops! This page doesn't exist"
   - **Body copy** — 1-2 sentences explaining what happened and what to do next.
     Avoid technical jargon.
   - **Search bar** (optional) — If the site has search, include a prominent
     search input to help users find what they're looking for.
   - **Helpful links** — 3-5 navigation links to key pages:
     - Home / Homepage (always use `/`)
     - Popular pages (Products, Blog, About, etc.) — use real routes from
       the brief or sitemap context. If not provided, use `#` placeholders
       with TODO comments noting they must be replaced before deployment.
     - Contact / Support
   - **Footer** (optional) — Small site logo or copyright notice
4. **Write** a single HTML document:
   - `<!doctype html>` through `</html>`, CSS inline.
   - Centered layout, vertically and horizontally.
   - Large, readable typography for the 404 number (display token).
   - Links use DS link color with hover states.
   - `data-od-id` on visual, headline, body, search, links.
5. **Self-check**:
   - Tone matches the DS mood (playful vs. professional).
   - Copy is helpful, not frustrating ("We couldn't find that page" not
     "Error 404: Resource not located").
   - Links are real destinations, not placeholders.
   - Visual element is simple and loads instantly (no external images).
   - Mobile-friendly (readable on small screens).

## Output contract

Emit between `<artifact>` tags:

```
<artifact identifier="404-page" type="text/html" title="404 Error Page">
<!doctype html>
<html>...</html>
</artifact>
```

One sentence before the artifact, nothing after.

## Copy examples by tone

**Playful**
- Headline: "Oops! This page went on vacation 🏖️"
- Body: "Looks like this page is taking a break. Let's get you back on track."

**Professional**
- Headline: "Page not found"
- Body: "The page you're looking for doesn't exist or has been moved. Try searching or return to the homepage."

**Minimal**
- Headline: "404"
- Body: "This page doesn't exist."

## Helpful link suggestions

- Home / Homepage
- Products / Services
- Blog / Resources
- About Us
- Contact / Support
- Help Center / FAQ
- Site Map
