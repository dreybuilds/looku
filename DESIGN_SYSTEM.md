# Looku interface system

The Stores page is the reference for browsing. The live gallery at `/design-system.html` uses the actual components, so changing the shared source changes both the gallery and the app.

## Sources of truth

- `dist/ui.js`: `pageHeader`, `sectionHeader`, `contentCard`, `emptyState` and `actionLink`. They create DOM nodes, render content as text and reject unsupported link protocols. Use `pageHeader(...).outerHTML` in existing string-based screens.
- `dist/ui.css`: spacing, typography, controls, surfaces, responsive layouts and the compatibility styles for existing app panels. Load it after `style.css` with `looku-ui` on the body.
- `dist/design-system.js`: rendered examples of the shared components.

The system applies to the app and admin workspace. The marketing landing page and public merchant storefronts retain their separate visual identities.

## Composition

Start a task screen with one `pageHeader`: title, one short description and up to two secondary actions. Keep the main task's controls beside its content. The Stores page puts browsing first; selling and the wishlist are header links.

Use `sectionHeader` for content groups. Place an optional search or filter in its `control` slot; it moves below the heading on small screens. Use `ui-section` for separation between groups and `ui-grid` for collections. Avoid turning explanatory copy or every secondary action into its own large card.

Use `contentCard` for a collection entry: a short category label, name, concise description and one action. Use `emptyState` for empty results or loading feedback, and update its text for errors. Give links descriptive names. External shopping links use `external: true`; affiliate links additionally use `sponsored: true`.

```js
import {pageHeader, sectionHeader, contentCard} from './ui.js';
main.replaceChildren(pageHeader({
  title: 'Your collection',
  description: 'Choose a piece to explore.',
  actions: [{label: 'Open wishlist', href: '#wishlist'}]
}));
const section = document.createElement('section');
section.className = 'ui-section';
section.append(sectionHeader({title: 'Recently added'}));
const grid = document.createElement('div');
grid.className = 'ui-grid';
grid.append(contentCard({
  title: 'Everyday collection', description: 'Pieces for the week ahead.',
  action: {label: 'View collection', href: '#wardrobe'}
}));
section.append(grid);
main.append(section);
```

## Extending and verifying

Change the relevant token or component first when fixing repeated layout issues. Extend the gallery for a new reusable pattern. Keep feature-specific rules scoped to the feature; keep shared type and spacing rules in `ui.css`.

For interface changes, run the design-system browser checks and the affected feature flow. Inspect desktop and phone screenshots: headings must have a clear hierarchy, controls and text must remain separated, and primary content must appear without scrolling through promotional panels. Include the admin surface when changing global app tokens. The design-system tests check overflow, heading hierarchy, accessibility and search/link behaviour.

When adding browser assets, include them in the local asset bundle, offline shell and any applicable Vercel host allowlist. Merchant subdomains need `ui.js` because their shared merchant module imports it; their visual style remains separate.

Use `selectionCard` in a `ui-choice-grid` for service choices. Maintain `aria-pressed` on selection and keep any associated form control in sync. Use `ui-two-column` to place a request form next to its history or supporting details; it stacks on smaller screens. `emptyState(message, title)` optionally adds a short heading. Subtle elevation comes from `--ui-shadow`, shared by cards and panels. The gallery includes all three patterns. Merchant logo/theme controls are feature-specific; custom storefront colours stay outside `looku-ui`.

## Site-wide coverage

Every rendered page loads `ui.css`. App and admin use `looku-ui`; the landing page uses `looku-editorial`; public merchant pages use `storefront`; the Pinterest embed uses `looku-embed`. These share the spacing and control rules while keeping the appropriate brand. The privacy page uses `looku-ui ui-document` for a readable text column.

Use `ui-form-panel` to bound editing surfaces, `ui-form` or `stack` for field spacing, `ui-surface` for a panel's internal rhythm, `ui-two-column` for an edit/history layout and `ui-workspace` with `ui-workspace-nav` for admin navigation. `metricCard` renders summary counts. Group each label with its control, either inside the label or in a `ui-field` with an explicit `for`/`id` pair, and action groups use `ui-actions` or `actions`; metadata must have explicit spacing rather than relying on line breaks.

For a new route or admin section, extend `qa/site-layout.spec.js`. That inventory checks every page at desktop and phone sizes; `qa/merchant-stores.spec.js` also checks the signed-in merchant editor. Shared layout changes require this full inventory plus affected interaction tests. Inspect the screenshots, especially long records, forms, empty states and narrow screens. The production build verifies that every HTML entry includes the shared stylesheet and that host allowlists serve its dependencies.
