/**
 * reason_code → user-facing copy, plus panel-shape helpers (T3-5).
 *
 * UI-UX §6 "失败不静默": every grayed-out control must explain itself. This
 * module is the single source of truth for that wording (D8) so the overview,
 * detail toolbar, and limited-state banner never drift apart. The map is typed
 * `Record<ReasonCode, string>` so adding a code to the contract without copy
 * here is a compile error, not a silent blank tooltip.
 *
 * The templates are self-authored from each code's semantics: the v0.1 §5
 * template lives in an archived doc outside the working set (spec §4 D-M2-6).
 */

import type { FullPanel, ReasonCode, StubPanel } from './types';

/** Exhaustive copy for the seven capability reason codes. */
const REASON_TEXT: Record<ReasonCode, string> = {
	INSUFFICIENT_HISTORY: '历史数据不足，暂无法进行该分析',
	MISSING_MONTHS: '存在连续缺月，该视图暂不可用（缺月按 null 保留，不插值）',
	INCOMPATIBLE_FREQUENCY: '数据频率不匹配（如季度 vs 月度），无法按此视图展示',
	INCOMPATIBLE_REGION: '地区口径不一致，禁止跨区叠加；可拆分双图对比',
	UNIT_MISMATCH: '单位不一致，无法在同一坐标轴叠加',
	DERIVED_NOT_FOUND: '缺少对应衍生序列（同比 / 环比未生成）',
	SOURCE_UNSUPPORTED: '数据源暂不支持该指标，尚未接入采集',
};

/** Human copy for a reason code (always non-empty; see the exhaustive map). */
export function reasonText(code: ReasonCode): string {
	return REASON_TEXT[code];
}

/** Narrow a capabilities panel to the source-unsupported stub branch (G15). */
export function isStub(panel: FullPanel | StubPanel): panel is StubPanel {
	return (panel as StubPanel).source_supported === false;
}

/**
 * The reason a whole panel is unavailable, or null when it is a full panel.
 * A full panel may still disable individual modes/transforms; those carry their
 * own reason_code and are read directly by the detail toolbar.
 */
export function panelReason(panel: FullPanel | StubPanel): ReasonCode | null {
	return isStub(panel) ? panel.reason_code : null;
}
