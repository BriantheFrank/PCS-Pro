# PCS-Pro Copilot Instructions

## Project Overview
**PCS-Pro** is a lightweight, offline-first web application helping U.S. military service members and families organize Permanent Change of Station (PCS) moves. It provides three integrated features: a checklist tracker, move inventory manager, and duty station information hub—all without requiring a backend or internet connection.

## Architecture & Key Patterns

### Single-Page App Structure
- **No build process or framework** — vanilla HTML/CSS/JavaScript with localStorage for persistence
- **Central navigation** — All pages share `styles.css` for layout/theming and include `script.js` for feature modules
- **Navigation pattern** — Every page has a consistent header with brand link and three main nav items (PCS Checklist, Move Organizer, Destination Bases)

### Data Persistence
The app relies entirely on browser localStorage with two separate storage keys:
- **`pcs-checklist`** — Serialized JSON tracking checkbox states for all PCS checklist items
- **`pcs-move-inventory`** — Serialized JSON for rooms, items, categories, and label settings (excludes transient `editMode` flags)

**Key consideration:** Deserialization wraps values in wrapper functions (e.g., `coerceWeight()`, `ensureItemDefaults()`) to handle missing properties and validate types; always maintain this pattern when modifying data structures.

### Modular Feature Compartmentalization
Each major feature in `script.js` is self-contained and only initializes when its DOM elements exist:
- **Checklist module** — Runs if `.checklist-item` elements detected; handles accordion state, parent/child checkbox syncing, and persistence
- **Inventory module** — Initializes only if `#inventory-search` and `#room-form` exist; encapsulates room/item CRUD, weight calculations, and label UI
- **Base pages** — Static HTML detail pages with minimal styling; require no script logic

**Pattern:** Always guard feature initialization with conditional DOM queries (e.g., `if (checklistItems.length > 0)`) to prevent errors on pages that don't use that feature.

## Critical Implementation Patterns

### Checklist Feature
- **Parent-child relationship:** Checkboxes with `data-role="parent"` auto-check when all subtasks (`.sub-checklist input[type='checkbox']`) are complete
- **Accordion behavior:** `.checklist-item` elements toggle `.is-open` class; all details closed by default; keyboard support (Enter/Space)
- **State sync:** Non-parent checkboxes write state on change; parent state derived from subtask completion without saving

### Inventory & Weight Estimation
- **Category auto-inference:** `inferCategoryFromLabel()` guesses category (Moving Box, Bed, Couch, etc.) from item label text
- **Weight model:** `CATEGORY_DEFINITIONS` define midpoint weights (e.g., 40 lbs for box, 250 for sofa) used as fallback if user doesn't specify; always validate weights with `coerceWeight()` before calculations
- **Recalculation trigger:** Call `syncInventoryState()` after any add/remove/edit to refresh totals and save to localStorage
- **Edit modes:** Transient `editMode` state (`null`, `"rename"`, etc.) controls which UI panel (`data-panel` or `data-room-panel`) displays; never persisted

### Menu & Panel Interactions
- **Isolated menu toggles:** Separate `closeItemMenus()` and `closeRoomMenus()` to prevent cross-interference; track active index to scope menu state per row
- **Label preview panel:** Only one active context at a time; `activeLabelItem` tracks current room/item; call `refreshActiveLabelPanel()` after inventory changes
- **Event delegation:** Use `.closest()` to detect anchor clicks inside buttons (prevent accordion toggle when clicking links)

## Common Workflows

### Adding a New Checklist Item
1. Add HTML structure with `class="checklist-item"` and nested checkbox (parent or subtask)
2. Script auto-initializes accordion and state syncing—no additional JS required
3. Use `data-id` on checkboxes to tie persistence key (must be unique)

### Extending Inventory Categories
1. Add new entry to `CATEGORY_DEFINITIONS` array with `label` and `defaultWeight`
2. Update `inferCategoryFromLabel()` to detect keywords that map to the new category
3. Re-run `recalculateWeights()` to apply new category to existing items

### Adding Duty Station Pages
1. Create new `base-[name].html` file in root directory
2. Use same header/footer structure as existing base pages (copy `base-fort-bliss.html`)
3. Update nav link in `bases.html` index page
4. No script changes needed—page is purely presentational

## File Reference
- **[index.html](index.html)** — Home page with navigation cards and "How to Use" instructions
- **[pcs-checklist.html](pcs-checklist.html)** — 1900+ lines of nested checklist items with spouse/service-member sections
- **[move-inventory.html](move-inventory.html)** — Inventory form, room/item containers, and label preview panel
- **[bases.html](bases.html)** — Index page linking to all duty station detail pages
- **[base-*.html](base-fort-bliss.html)** — Detail pages for individual bases (30+ files); copy structure from Fort Bliss
- **[script.js](script.js)** — 1335 lines; contains all feature modules (checklist, inventory, state management)
- **[styles.css](styles.css)** — 1100+ lines; CSS variables for theming; BEM-like naming (e.g., `.checklist-item`, `.inventory-item-menu`)

## Design & Styling
- **CSS variables** (`:root`) define colors (`--bg`, `--surface`, `--text`, `--accent`, etc.) and are reused throughout
- **Responsive layout** — `.container` uses `min(960px, 90vw)` for flexible max-width
- **Accessibility** — ARIA attributes (`aria-expanded`, `aria-hidden`, `aria-live`) on interactive elements; keyboard navigation with Enter/Space support
- **Flexbox grids** — `.card-grid`, `.base-grid` use flex layout for responsive cards

## Testing & Debugging
- **localStorage inspection** — Open DevTools → Application → Local Storage to inspect `pcs-checklist` and `pcs-move-inventory` JSON
- **Offline capability** — All features work without internet; test by disabling network in DevTools
- **Mobile testing** — Responsive design tested at viewport widths down to ~320px; use browser DevTools device emulation
