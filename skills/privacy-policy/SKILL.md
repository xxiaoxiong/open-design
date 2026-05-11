---
name: privacy-policy
description: |
  A standalone privacy policy page with structured sections covering data
  collection, usage, sharing, and user rights. Use when the brief asks for
  "privacy policy", "data protection", or "privacy notice".
triggers:
  - "privacy"
  - "privacy policy"
  - "privacy page"
  - "data protection"
  - "privacy notice"
  - "隐私政策"
  - "隐私条款"
od:
  mode: prototype
  platform: desktop
  scenario: legal
  preview:
    type: html
    entry: index.html
  design_system:
    requires: true
    sections: [color, typography, layout]
  example_prompt: "Create a privacy policy page for a SaaS company that collects email, usage data, and payment information."
---

# Privacy Policy Skill

Produce a single-screen privacy policy page that respects the active DESIGN.md.

## Workflow

1. **Read the active DESIGN.md** (injected above). Use only its colors and
   type tokens. Legal pages use simpler layouts than marketing pages.
2. **Determine the data practices** from the brief:
   - What data is collected (email, name, usage data, payment info, etc.)
   - How data is used (service delivery, analytics, marketing, etc.)
   - Who data is shared with (payment processors, analytics providers, etc.)
   - User rights (access, deletion, opt-out, etc.)
   - If not specified, use common SaaS practices as defaults.
3. **Standard sections**, in order:
   - **Header** — page title "Privacy Policy", last updated date, company name.
   - **Introduction** — brief overview (1-2 paragraphs) explaining the
     policy scope and commitment to privacy.
   - **Information We Collect** — categorized list:
     - Account information (email, name, etc.)
     - Usage data (pages visited, features used, etc.)
     - Technical data (IP address, browser, device, etc.)
     - Payment information (if applicable)
   - **How We Use Your Information** — purposes:
     - Provide and improve the service
     - Communicate with you
     - Process payments
     - Analytics and research
     - Marketing (if applicable, with opt-out)
   - **Information Sharing** — third parties:
     - Service providers (hosting, analytics, payment processors)
     - Legal requirements (compliance, law enforcement)
     - Business transfers (mergers, acquisitions)
     - Never sell personal data (if true)
   - **Data Security** — measures taken to protect data.
   - **Your Rights** — user rights under GDPR/CCPA:
     - Access your data
     - Correct inaccurate data
     - Delete your data
     - Opt out of marketing
     - Data portability
   - **Cookies** — brief explanation of cookie usage and control.
   - **Children's Privacy** — statement that service is not for children
     under 13 (or 16 for EU).
   - **Changes to This Policy** — how users will be notified of updates.
   - **Contact Us** — email or form for privacy questions.
4. **Write** one self-contained HTML document:
   - `<!doctype html>` through `</html>`, CSS in one inline `<style>`.
   - Centered layout, max-width container (~900px for readability).
   - Table of contents with anchor links at the top.
   - Each section has an `id` for anchor navigation.
   - `data-od-id` on major sections.
   - **Typography**: Use text font throughout. Headings use font-weight
     for hierarchy, not display font. Legal text is 16px minimum for
     readability.
5. **Tone**: Professional and clear, not intimidating. Avoid legalese where
   possible. Use "we" and "you" for clarity. Break complex sentences into
   shorter ones.
6. **Disclaimer**: Add a note at the top: "This is a template. Consult a
   lawyer before using in production." Legal documents require professional
   review.
7. **Self-check**:
   - All standard sections are present and complete.
   - Data practices match the brief (or use sensible defaults).
   - User rights section includes GDPR/CCPA basics.
   - Contact information is provided (email or placeholder).
   - Last updated date is present (use current date or placeholder).
   - Table of contents links work correctly.
   - Text is readable (16px+, good line-height, max-width for lines).
   - Mobile-friendly (single column, readable on small screens).

## Output contract

Emit between `<artifact>` tags:

```
<artifact identifier="privacy-slug" type="text/html" title="Privacy Policy — Company Name">
<!doctype html>
<html>...</html>
</artifact>
```

One sentence before the artifact, nothing after.
