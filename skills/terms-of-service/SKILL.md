---
name: terms-of-service
description: |
  A standalone terms of service page with structured sections covering user
  agreements, acceptable use, liability, and dispute resolution. Use when the
  brief asks for "terms of service", "terms and conditions", or "user agreement".
triggers:
  - "terms"
  - "terms of service"
  - "terms and conditions"
  - "user agreement"
  - "tos"
  - "服务条款"
  - "用户协议"
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
  example_prompt: "Create a terms of service page for a SaaS investment platform with subscription billing and user-generated content."
---

# Terms of Service Skill

Produce a single-screen terms of service page that respects the active DESIGN.md.

## Workflow

1. **Read the active DESIGN.md** (injected above). Use only its colors and
   type tokens. Legal pages use simpler layouts than marketing pages.
2. **Determine the service characteristics** from the brief:
   - Type of service (SaaS, marketplace, social platform, etc.)
   - Billing model (subscription, one-time, freemium, etc.)
   - User-generated content (if applicable)
   - Age restrictions (13+, 18+, etc.)
   - If not specified, use common SaaS practices as defaults.
3. **Standard sections**, in order:
   - **Header** — page title "Terms of Service", effective date, company name.
   - **Acceptance of Terms** — agreement to be bound by these terms by using
     the service.
   - **Description of Service** — brief overview of what the service provides.
   - **Account Registration** — requirements for creating an account (age,
     accurate information, account security).
   - **Acceptable Use** — what users can and cannot do:
     - Prohibited activities (illegal use, abuse, spam, hacking)
     - Content guidelines (if user-generated content)
     - Intellectual property respect
   - **Subscription and Billing** (if applicable) — payment terms:
     - Pricing and payment methods
     - Billing cycles and renewals
     - Cancellation and refunds
     - Free trials (if applicable)
   - **Intellectual Property** — ownership of platform and content:
     - Platform IP belongs to company
     - User content license (if applicable)
     - Trademark usage restrictions
   - **Termination** — conditions for account suspension or termination:
     - Company's right to terminate
     - User's right to cancel
     - Effect of termination (data deletion, access loss)
   - **Disclaimers** — limitations on warranties and guarantees:
     - Service provided "as is"
     - No guarantee of uptime or accuracy
     - Investment disclaimers (if financial service)
   - **Limitation of Liability** — caps on company liability for damages.
   - **Indemnification** — user agrees to defend company against claims
     arising from their use.
   - **Dispute Resolution** — how disputes are handled:
     - Governing law and jurisdiction
     - Arbitration clause (if applicable)
     - Class action waiver (if applicable)
   - **Changes to Terms** — how users will be notified of updates.
   - **Contact Information** — email or address for legal questions.
4. **Write** one self-contained HTML document:
   - `<!doctype html>` through `</html>`, CSS in one inline `<style>`.
   - Centered layout, max-width container (~900px for readability).
   - Table of contents with anchor links at the top.
   - Each section has an `id` for anchor navigation.
   - `data-od-id` on major sections.
   - **Typography**: Use text font throughout. Headings use font-weight
     for hierarchy, not display font. Legal text is 16px minimum for
     readability.
5. **Tone**: Professional and authoritative, but not hostile. Use "we" and
   "you" for clarity. Break complex legal concepts into shorter sentences.
6. **Disclaimer**: Add a note at the top: "This is a template. Consult a
   lawyer before using in production." Legal documents require professional
   review.
7. **Self-check**:
   - All standard sections are present and complete.
   - Service characteristics match the brief (or use sensible defaults).
   - Prohibited activities are specific and reasonable.
   - Billing terms are clear (if applicable).
   - Disclaimers and liability limitations are present.
   - Contact information is provided (email or placeholder).
   - Effective date is present (use current date or placeholder).
   - Table of contents links work correctly.
   - Text is readable (16px+, good line-height, max-width for lines).
   - Mobile-friendly (single column, readable on small screens).

## Output contract

Emit between `<artifact>` tags:

```
<artifact identifier="terms-slug" type="text/html" title="Terms of Service — Company Name">
<!doctype html>
<html>...</html>
</artifact>
```

One sentence before the artifact, nothing after.
