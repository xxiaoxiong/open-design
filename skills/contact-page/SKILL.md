---
name: contact-page
description: |
  A standalone contact page with contact information, contact form, map,
  and social links. Use when the brief asks for "contact us", "get in touch",
  "reach out", or a "contact" page.
triggers:
  - "contact"
  - "contact page"
  - "contact us"
  - "get in touch"
  - "reach out"
  - "联系我们"
  - "联系页面"
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
  example_prompt: "Create a contact page for a SaaS company with office locations in San Francisco and London, including a contact form and map."
---

# Contact Page Skill

Produce a single-screen contact page that respects the active DESIGN.md.

## Workflow

1. **Read the active DESIGN.md** (injected above). Use only its colors, type
   tokens, and component patterns.
2. **Determine the contact methods** from the brief:
   - Email address (required)
   - Phone number (optional)
   - Physical address(es) (optional)
   - Social media links (optional)
   - Business hours (optional)
3. **Sections**, in order:
   - **Hero** — page title (e.g. "Contact Us", "Get in Touch"), one-line
     subhead explaining how to reach the team.
   - **Contact form** — name, email, subject (optional), message fields.
     Submit button uses DS primary color. Form validation via HTML5
     attributes (required, email type). No backend needed for prototype.
   - **Contact information** — display email, phone, address(es) in a clean
     layout. Use icons (simple SVG) for each contact method. If multiple
     offices, show them in a grid or list.
   - **Map** (optional) — if physical address is provided, include a map
     placeholder or embed. Use a grey placeholder box with "Map" label if
     no real coordinates.
   - **Social links** — 3-5 icon links to social media profiles. Use simple
     SVG icons. If not provided in brief, use placeholder `#` hrefs with
     comment noting they should be updated.
   - **Footer** (optional) — small copyright notice or tagline.
4. **Write** one self-contained HTML document:
   - `<!doctype html>` through `</html>`, CSS in one inline `<style>`.
   - Centered layout, max-width container (~1200px).
   - Form uses CSS Grid for field layout.
   - `data-od-id` on form, contact info sections, map, social links.
   - **Content sanitization**: Use `textContent` for user-provided text to
     prevent XSS. If HTML is required, use whitelist approach.
5. **Form behavior**: Add basic JavaScript for form submission that shows
   a success message (no actual backend call needed for prototype).
6. **Self-check**:
   - Form has proper HTML5 validation (required fields, email format).
   - Contact information is readable and well-organized.
   - Icons are simple and consistent with DS style.
   - Map placeholder is clearly labeled if coordinates not provided.
   - Social links have placeholder hrefs with TODO comments if not provided.
   - Mobile-friendly (form stacks vertically, contact info adapts).

## Output contract

Emit between `<artifact>` tags:

```
<artifact identifier="contact-slug" type="text/html" title="Contact — Company Name">
<!doctype html>
<html>...</html>
</artifact>
```

One sentence before the artifact, nothing after.
