# 404 Error Page Checklist

## P0 (must pass before emitting `<artifact>`)

- [ ] Single-file HTML output (`<!doctype html>`, inline CSS/JS, no build step).
- [ ] Renders directly from disk with no server.
- [ ] Includes clear "404" or "Page Not Found" heading.
- [ ] Includes helpful error message explaining what happened.
- [ ] Includes at least one navigation option (home link, search, or sitemap).
- [ ] Uses only colors and typography from active DESIGN.md.
- [ ] No sandbox-hostile APIs without safe guards (`localStorage`, `alert`, `confirm`, `prompt`, `window.open`).
- [ ] Placeholder values stay honest (`—` when unknown), no fabricated claims.
- [ ] No lorem ipsum or generic placeholder text.

## P1 (quality bar)

- [ ] Typography hierarchy is clear (error code, heading, body, links).
- [ ] Spacing rhythm is consistent and balanced.
- [ ] Contrast meets WCAG AA minimum (4.5:1 for body text).
- [ ] Layout is centered and readable at common viewport sizes (375px mobile, 1366px desktop).
- [ ] Links have clear hover states.
- [ ] Tone is friendly and helpful, not hostile or technical.

## P2 (polish)

- [ ] Includes visual interest (illustration, icon, or subtle animation).
- [ ] Search box (if present) has focus state and keyboard support.
- [ ] Suggested links (if present) are relevant and helpful.
- [ ] Footer or header navigation (if present) matches site structure.
- [ ] Mobile-friendly: single column, readable on small screens.
