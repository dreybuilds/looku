# Looku development

For interface additions, layout fixes, typography or spacing changes, read `DESIGN_SYSTEM.md` first. Reuse `dist/ui.js` and the tokens in `dist/ui.css`; extend their live gallery for new shared patterns. For every new page or admin section, extend the route inventory in `qa/site-layout.spec.js`. Run the full inventory for shared layout changes and inspect desktop and phone screenshots before release. Keep the landing page and merchant storefront identities separate from the app/admin system.

Preserve concurrent work on `main`. Use the repository's configured `dreybuilds` identity for commits; deployment follows the existing Git integration.
