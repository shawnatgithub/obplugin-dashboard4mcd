import { renderEmptyDetail } from '../src/ui/detail';
import { ONBOARDING_TITLE, renderOnboarding } from '../src/ui/onboarding';

/**
 * Onboarding (S4b) and empty-detail DOM tests (T3-4). Both are pure composers,
 * so these lock the structure and the handler wiring directly: the guide states
 * why real data is absent, lists three steps, and exposes only the actions whose
 * handlers were supplied (UI-UX §6 failure-not-silent, never a blank screen).
 */

function mount(): HTMLElement {
	const root = document.createElement('div');
	document.body.appendChild(root);
	return root;
}

afterEach(() => {
	document.body.textContent = '';
});

describe('renderOnboarding — structure', () => {
	it('renders the scoped root, icon, default title and intro', () => {
		const root = mount();
		renderOnboarding(root);
		expect(root.querySelector('.mcd-root.mcd-view')).not.toBeNull();
		expect(root.querySelector('.mcd-empty__icon svg')).not.toBeNull();
		expect(root.querySelector('.mcd-empty__title')?.textContent).toBe(
			ONBOARDING_TITLE,
		);
		expect(root.querySelector('.mcd-empty > p.mcd-muted')?.textContent).toContain(
			'尚未接入本地 ETL 数据',
		);
	});

	it('lists exactly three numbered steps', () => {
		const root = mount();
		renderOnboarding(root);
		const steps = root.querySelectorAll('.mcd-steps li');
		expect(steps).toHaveLength(3);
		expect(steps[0]?.querySelector('strong')?.textContent).toContain('1 ');
		expect(steps[2]?.querySelector('strong')?.textContent).toContain('3 ');
		expect(
			steps[0]?.querySelector('.mcd-onboarding__step-body')?.textContent,
		).toContain('设置');
	});

	it('honours a custom title and shows the loader detail line', () => {
		const root = mount();
		renderOnboarding(root, { title: '自定义标题', detail: '尚未配置数据目录' });
		expect(root.querySelector('.mcd-empty__title')?.textContent).toBe(
			'自定义标题',
		);
		expect(
			root.querySelector('.mcd-onboarding__detail')?.textContent,
		).toContain('当前状态：尚未配置数据目录');
	});

	it('omits the detail line when none is supplied', () => {
		const root = mount();
		renderOnboarding(root);
		expect(root.querySelector('.mcd-onboarding__detail')).toBeNull();
	});
});

describe('renderOnboarding — actions', () => {
	it('always shows the primary 打开设置 and fires its handler', () => {
		const onOpenSettings = jest.fn();
		const root = mount();
		renderOnboarding(root, { handlers: { onOpenSettings } });
		const primary = root.querySelector<HTMLElement>('.mcd-button--primary');
		expect(primary?.textContent).toBe('打开设置');
		primary?.click();
		expect(onOpenSettings).toHaveBeenCalledTimes(1);
	});

	it('hides 查看示例数据 and 刷新 unless their handlers are supplied', () => {
		const root = mount();
		renderOnboarding(root);
		const labels = Array.from(root.querySelectorAll('.mcd-empty__actions button')).map(
			(b) => b.textContent,
		);
		expect(labels).toEqual(['打开设置']);
	});

	it('shows the optional actions and wires them when supplied', () => {
		const onShowSample = jest.fn();
		const onRefresh = jest.fn();
		const root = mount();
		renderOnboarding(root, { handlers: { onShowSample, onRefresh } });
		const buttons = Array.from(
			root.querySelectorAll<HTMLElement>('.mcd-empty__actions button'),
		);
		expect(buttons.map((b) => b.textContent)).toEqual([
			'打开设置',
			'查看示例数据',
			'刷新',
		]);
		buttons[1]?.click();
		buttons[2]?.click();
		expect(onShowSample).toHaveBeenCalledTimes(1);
		expect(onRefresh).toHaveBeenCalledTimes(1);
	});

	it('clears the container on re-render', () => {
		const root = mount();
		renderOnboarding(root);
		renderOnboarding(root);
		expect(root.querySelectorAll('.mcd-empty')).toHaveLength(1);
	});
});

describe('renderEmptyDetail', () => {
	it('prompts to pick an indicator and offers 打开总览', () => {
		const root = mount();
		renderEmptyDetail(root);
		expect(root.querySelector('.mcd-empty__title')?.textContent).toBe(
			'未选择指标',
		);
		expect(root.querySelector('.mcd-empty > p.mcd-muted')?.textContent).toContain(
			'总览',
		);
		expect(
			root.querySelector<HTMLElement>('.mcd-button--primary')?.textContent,
		).toBe('打开总览');
	});

	it('fires onOpenOverview when the button is clicked', () => {
		const onOpenOverview = jest.fn();
		const root = mount();
		renderEmptyDetail(root, { onOpenOverview });
		root.querySelector<HTMLElement>('.mcd-button--primary')?.click();
		expect(onOpenOverview).toHaveBeenCalledTimes(1);
	});
});
