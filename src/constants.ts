/**
 * Stable identifiers and display strings for the plugin.
 *
 * Command IDs and the view type are part of the plugin's public surface: once
 * released they must not be renamed (AGENTS.md → Commands & settings). They are
 * centralized here so `main.ts` and the view agree on one value (D8).
 */

/** Plugin id; must match `manifest.json` and the vault folder name. */
export const PLUGIN_ID = 'mcd';

/** Workspace view type registered for the overview dashboard. */
export const VIEW_TYPE_MCD_OVERVIEW = 'mcd-overview-view';

/** View title shown in the tab and command palette. */
export const VIEW_TITLE = '宏观数据看板';

/** Ribbon / tab icon (Lucide name bundled with Obsidian). */
export const VIEW_ICON = 'trending-up';

/** Tooltip for the ribbon icon. */
export const RIBBON_TOOLTIP = '打开宏观数据看板';

/** Command id that opens the overview dashboard. Stable once released. */
export const COMMAND_OPEN_OVERVIEW = 'open-overview';
