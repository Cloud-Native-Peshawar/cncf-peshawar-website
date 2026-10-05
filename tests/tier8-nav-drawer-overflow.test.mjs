/**
 * Tier 8: Mobile Navigation Drawer Overflow & Accessibility E2E Test Suite
 * CNCF Peshawar Automation Suite
 *
 * Guards the mobile navigation drawer against viewport overflow (issue #14):
 * - The drawer is bounded by the viewport, not by its content, so every link stays
 *   reachable on short (390px tall) and narrow (320px wide) screens
 * - Drawer and document scroll independently: overscroll cannot chain to the page
 * - The page behind the drawer is locked in place and its scroll offset survives
 * - The toggle stays reachable and the closed drawer leaves the tab order
 * - Focus rings stay visible on items the drawer scrolls into view
 * - Safe-area insets and increased text sizes are honoured
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { TestHarness } from './test-utils.mjs';

const navSrc = fs.readFileSync('src/components/Nav.astro', 'utf-8');

const markup = navSrc.split('<style>')[0];
const navCss = navSrc.split('<style>')[1]?.split('</style>')[0] ?? '';
const navScript = navSrc.split('<script>')[1]?.split('</script>')[0] ?? '';

// Extract a single declaration value for `selector` from a CSS source block.
// Comments are stripped first, since a declaration may be preceded by an
// explanatory comment, and the property is anchored to a declaration boundary so
// `max-height` cannot match `--drawer-max-height`.
const cssValue = (css, selector, property) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rule = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  assert.ok(rule, `Expected a "${selector}" rule in the component CSS`);
  const body = rule[1].replace(/\/\*[\s\S]*?\*\//g, '').trim();
  const decl = new RegExp(`(?:^|[;{]\\s*)${property}\\s*:\\s*([^;]+)`).exec(body);
  return decl ? decl[1].trim() : null;
};

export async function runTier8Suite() {
  const suite = new TestHarness('Tier 8: Mobile Nav Drawer Overflow & Accessibility');

  // =====================================================================
  // VIEWPORT-AWARE BOUNDS
  // =====================================================================
  suite.group('Viewport-Aware Bounds: The Drawer Never Outgrows the Screen');

  await suite.test('D1: Drawer caps its height from the dynamic viewport, with a vh fallback', () => {
    const maxHeight = cssValue(navCss, '.nav-drawer', 'max-height');
    assert.equal(
      maxHeight,
      'var(--nav-drawer-max-height, var(--drawer-max-height))',
      'Drawer max-height must fall back to the CSS ceiling before the script measures the layout'
    );
    assert.match(
      navCss,
      /--drawer-max-height:\s*calc\(100vh\s*-\s*7rem\)/,
      'A 100vh fallback ceiling is required for browsers without dynamic viewport units'
    );
    assert.match(
      navCss,
      /@supports\s*\(height:\s*100dvh\)\s*\{[\s\S]*?\.nav-drawer\s*\{[\s\S]*?--drawer-max-height:\s*calc\(100dvh\s*-\s*7rem\)/,
      'Dynamic viewport units must upgrade the ceiling where @supports height: 100dvh is available'
    );
  });

  await suite.test('D2: The script measures the real gap between the sticky nav and the viewport', () => {
    assert.match(
      navScript,
      /function updateMaxHeight\(\)/,
      'The drawer ceiling must be computed from live layout, not a hardcoded pixel value'
    );
    assert.match(
      navScript,
      /getBoundingClientRect\(\)\.bottom/,
      'Available height must be derived from where the sticky nav actually ends'
    );
    assert.match(
      navScript,
      /window\.innerHeight\s*-\s*navBottom\s*-\s*gap\s*-\s*insetBottom/,
      'Available height must subtract the nav offset, the drawer gap, and the safe-area inset'
    );
    assert.match(
      navScript,
      /Math\.max\(available,\s*0\)/,
      'The ceiling must clamp at zero rather than go negative on a very short viewport'
    );
    assert.doesNotMatch(
      navScript,
      /maxHeight\s*=\s*['"]\d+px['"]/,
      'No fixed pixel max-height may be written inline, which would ignore text scaling'
    );
  });

  await suite.test('D3: Drawer grows downward from the nav instead of using fixed heights', () => {
    assert.equal(cssValue(navCss, '.nav-drawer', 'position'), 'absolute');
    assert.match(
      cssValue(navCss, '.nav-drawer', 'top'),
      /calc\(100%\s*\+\s*var\(--space-xs\)\)/,
      'The drawer must hang below the sticky nav so its ceiling is the remaining viewport'
    );
    assert.equal(
      cssValue(navCss, '.nav-drawer', 'height'),
      null,
      'A fixed height on the drawer would clip content instead of scrolling it'
    );
    assert.doesNotMatch(
      navCss,
      /\.nav-drawer\s*\{[^}]*overflow\s*:\s*visible/,
      'The drawer must never let content escape its own box'
    );
  });

  // =====================================================================
  // INDEPENDENT SCROLL
  // =====================================================================
  suite.group('Independent Scroll: The Drawer Scrolls, the Page Does Not');

  await suite.test('D4: The drawer is its own scroll container with overscroll containment', () => {
    assert.equal(cssValue(navCss, '.nav-drawer', 'overflow-y'), 'auto', 'The drawer must scroll internally');
    assert.equal(
      cssValue(navCss, '.nav-drawer', 'overscroll-behavior'),
      'contain',
      'Overscroll must be contained so reaching the end of the list cannot scroll the page behind'
    );
    assert.match(
      navCss,
      /-webkit-overflow-scrolling:\s*touch/,
      'Momentum scrolling must be enabled for iOS Safari'
    );
    assert.match(
      cssValue(navCss, '.nav-drawer', 'scroll-padding-block'),
      /var\(--space-2xs\)/,
      'Scroll padding keeps focused items clear of the drawer edge'
    );
  });

  await suite.test('D5: Opening the drawer freezes the document without moving the sticky nav', () => {
    assert.match(
      navCss,
      /html:has\(\.nav-drawer\.is-open\)\s*\{[^}]*overflow:\s*hidden/s,
      'The root overflow must be hidden while the drawer is open so the page cannot scroll behind it'
    );
    assert.match(
      navCss,
      /html:has\(\.nav-drawer\.is-open\)\s*\{[^}]*overscroll-behavior:\s*none/s,
      'Overscroll must also be disabled on the frozen page, not just on the drawer'
    );
    // Fixing the body was the obvious lock, but it drags the sticky nav out of the
    // viewport and leaves the drawer with no visible way to close it.
    assert.doesNotMatch(
      navCss,
      /body:has\(\.nav-drawer\.is-open\)\s*\{[^}]*position:\s*fixed/s,
      'The body must not be fixed while the drawer is open, which would push the sticky nav off screen'
    );
    assert.equal(
      cssValue(navCss, '.nav-wrapper', 'position'),
      'sticky',
      'The nav wrapper must stay sticky so the toggle remains on screen while the drawer is open'
    );
    assert.match(
      navScript,
      /scrollY\s*=\s*window\.scrollY/,
      'The pre-lock scroll offset must be captured on open'
    );
  });

  await suite.test('D6: Closing the drawer releases the lock and restores the previous position', () => {
    assert.match(
      navScript,
      /window\.scrollTo\(\{ top: scrollY, behavior: 'instant' \}\)/,
      'Restoring the position must be instant; the site scrolls smoothly and would visibly rewind'
    );
    assert.match(
      navScript,
      /const restore = \(\) => \{[\s\S]{0,220}requestAnimationFrame\(restore\);/,
      'The offset must be reasserted on a later frame, since handing back the scrollbar reflows the page and re-anchors it'
    );
    assert.doesNotMatch(
      navScript,
      /document\.body\.style\.overflow\s*=\s*'hidden'/,
      'The scroll lock is CSS-driven and must not be duplicated as an inline body style'
    );
  });

  await suite.test('D7: Losing the scrollbar is compensated so the page does not jump sideways', () => {
    assert.match(
      navScript,
      /window\.innerWidth\s*-\s*document\.documentElement\.clientWidth/,
      'The scrollbar width must be measured on open'
    );
    assert.match(
      navCss,
      /body:has\(\.nav-drawer\.is-open\)\s*\{[^}]*padding-right:\s*var\(--nav-scrollbar-gap,\s*0px\)/s,
      'The measured scrollbar width must be applied as body padding-right'
    );
    assert.match(
      navScript,
      /removeProperty\('--nav-scrollbar-gap'\)/,
      'The scrollbar-gap custom property must be cleared on close'
    );
  });

  // =====================================================================
  // ACCESSIBILITY
  // =====================================================================
  suite.group('Accessibility: Toggle Reachability, Tab Order, and Focus Visibility');

  await suite.test('D8: The closed drawer is inert, so its links leave the tab order', () => {
    assert.match(
      markup,
      /id="mobile-nav-drawer"[^>]*aria-hidden="true"[^>]*\binert\b/,
      'The drawer must ship inert and hidden, otherwise hidden links are still tabbable'
    );
    assert.match(
      navScript,
      /drawer\.removeAttribute\('inert'\)/,
      'Opening the drawer must remove inert'
    );
    assert.match(
      navScript,
      /drawer\.setAttribute\('inert',\s*''\)/,
      'Closing the drawer must restore inert'
    );
  });

  await suite.test('D9: The toggle stays operable while the drawer content is scrolled', () => {
    // The toggle lives outside .nav-drawer, so the drawer scroll container cannot move it.
    assert.match(markup, /class="nav__toggle"/);
    const toggleStart = markup.indexOf('class="nav__toggle"');
    const drawerStart = markup.indexOf('id="mobile-nav-drawer"');
    assert.ok(drawerStart > toggleStart, 'The toggle must be rendered before the drawer, outside its scroll box');
    assert.doesNotMatch(
      markup.slice(drawerStart),
      /nav__toggle/,
      'The toggle must not be inside the scrolling drawer, or scrolling could push it out of reach'
    );
    assert.equal(
      cssValue(navCss, '.nav__toggle', 'height'),
      '44px',
      'The toggle must keep a 44px tap target'
    );
    assert.equal(cssValue(navCss, '.nav__toggle', 'flex-shrink'), '0', 'The toggle must not be squeezed by the brand text');
  });

  await suite.test('D10: Escape closes the drawer and returns focus to the toggle', () => {
    assert.match(
      navScript,
      /e\.key === 'Escape'[^}]*closeDrawer\(\{\s*restoreFocus:\s*true\s*\}\)/s,
      'Escape must close the drawer and move focus back to the toggle'
    );
    assert.match(navScript, /if\s*\(restoreFocus\)\s*toggleBtn\.focus\(\)/);
  });

  await suite.test('D11: Tab focus is contained in the open drawer', () => {
    assert.match(
      navScript,
      /e\.key !== 'Tab' \|\| !drawer\.classList\.contains\('is-open'\)/,
      'Focus containment must apply only while the drawer is open'
    );
    assert.match(
      navScript,
      /const focusables = \[toggleBtn, \.\.\.drawer\.querySelectorAll[^\]]*\]/s,
      'The focus loop must span the toggle and every drawer control'
    );
    assert.match(navScript, /e\.shiftKey/, 'Shift+Tab must wrap backwards from the toggle');
  });

  await suite.test('D12: Focus rings are visible on drawer links and the CTA', () => {
    const focusRule = /\.nav-drawer__link:focus-visible,\s*\n?\s*\.nav-drawer__action a:focus-visible\s*\{([^}]*)\}/.exec(
      navCss
    );
    assert.ok(focusRule, 'Drawer links and the drawer CTA must define a :focus-visible treatment');
    assert.match(focusRule[1], /outline:\s*2px solid/, 'The focus ring must have a visible 2px outline');
    assert.match(
      focusRule[1],
      /outline-offset:\s*-2px/,
      'The ring must sit inside the item so it is not clipped by the scroll container'
    );
    assert.match(
      cssValue(navCss, '.nav-drawer__link', 'scroll-margin-block'),
      /var\(--space-2xs\)/,
      'Focused links need scroll margin so the browser does not align them flush with the drawer edge'
    );
  });

  await suite.test('D13: The drawer closes itself when the toggle disappears at the desktop breakpoint', () => {
    assert.match(
      navScript,
      /matchMedia\('\(min-width: 860px\)'\)/,
      'The desktop breakpoint must be observed so an open drawer is never left without a toggle'
    );
    assert.match(
      navScript,
      /if \(e\.matches && drawer\.classList\.contains\('is-open'\)\)[\s\S]{0,200}closeDrawer\(\)/,
      'Crossing into the desktop layout must close the drawer'
    );
  });

  // =====================================================================
  // DEVICE AND PREFERENCE ROBUSTNESS
  // =====================================================================
  suite.group('Device and Preference Robustness: Safe Areas, Text Size, Rotation');

  await suite.test('D14: Safe-area insets are added without padding devices that need none', () => {
    for (const side of ['right', 'bottom', 'left']) {
      const value = cssValue(navCss, '.nav-drawer', `padding-${side}`);
      assert.ok(value, `Drawer padding-${side} must be declared`);
      assert.match(
        value,
        /env\(safe-area-inset-(right|bottom|left),\s*0px\)/,
        `padding-${side} must include its safe-area inset, with a 0px default so unsupported devices add nothing`
      );
    }
    assert.equal(
      cssValue(navCss, '.nav-drawer', 'padding'),
      'var(--space-md)',
      'The drawer must keep its base padding token, with insets layered on top'
    );
  });

  await suite.test('D15: Drawer items scale with the user font size and stay tappable', () => {
    assert.match(
      cssValue(navCss, '.nav-drawer__link', 'font-size'),
      /var\(--font-size-base\)/,
      'Drawer links must size in rem-based tokens so browser text scaling applies'
    );
    assert.equal(
      cssValue(navCss, '.nav-drawer__link', 'min-height'),
      '44px',
      'Drawer links must keep a 44px minimum target'
    );
    assert.match(
      cssValue(navCss, '.nav-drawer__link', 'overflow-wrap'),
      /anywhere/,
      'Long labels must wrap rather than clip when the text is enlarged'
    );
  });

  await suite.test('D16: The ceiling is re-measured whenever the viewport changes', () => {
    assert.match(
      navScript,
      /window\.addEventListener\('resize',\s*onViewportChange\)/,
      'A resize must recompute the ceiling'
    );
    assert.match(
      navScript,
      /window\.addEventListener\('orientationchange',\s*onViewportChange\)/,
      'Rotation must recompute the ceiling'
    );
    assert.match(
      navScript,
      /visualViewport\?\.addEventListener\('resize',\s*onViewportChange\)/,
      'A soft keyboard must recompute the ceiling'
    );
    assert.match(
      navScript,
      /if \(drawer\.classList\.contains\('is-open'\)\) updateMaxHeight\(\)/,
      'Re-measuring must not disturb a closed drawer'
    );
  });

  await suite.test('D17: Opening resets the scroll position, so the list always starts at the top', () => {
    assert.match(
      navScript,
      /drawer\.scrollTop = 0;\s*\n\s*drawer\.classList\.remove\('is-open'\)/,
      'The scroll position must be cleared while the drawer is still rendered, or the browser restores the stale offset'
    );
    assert.match(
      navScript,
      /drawer\.scrollTop = 0;\s*\n\s*updateMaxHeight\(\);\s*\n\s*drawer\.classList\.add\('is-open'\)/,
      'A reopened drawer must also be cleared immediately before it is shown'
    );
  });

  await suite.test('D18: The wordmark yields to the toggle when the text is enlarged', () => {
    assert.equal(
      cssValue(navCss, '.nav__brand', 'min-width'),
      '0',
      'The brand must be allowed to shrink, or it slides over the toggle at large text sizes'
    );
    assert.equal(
      cssValue(navCss, '.nav__brand-text', 'flex-wrap'),
      'wrap',
      'The wordmark must wrap rather than push into the toggle'
    );
    assert.equal(
      cssValue(navCss, '.nav__brand-text', 'overflow-wrap'),
      'break-word',
      'The wordmark may break inside a word only when it cannot fit a line of its own'
    );
    assert.doesNotMatch(
      navCss,
      /\.nav__brand-text\s*\{[^}]*overflow-wrap:\s*anywhere/,
      '`anywhere` would shatter the wordmark per character at large text sizes and starve the drawer of space'
    );
    assert.equal(
      cssValue(navCss, '.nav__logo-icon', 'flex-shrink'),
      '0',
      'The logo must keep its size while the wordmark wraps'
    );
    assert.equal(
      cssValue(navCss, '.nav__actions', 'flex-shrink'),
      '0',
      'The toggle and CTA must never be squeezed by the brand'
    );
  });

  suite.printResults();
  return suite.getSummary();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runTier8Suite().then(summary => {
    if (summary.failed > 0) process.exit(1);
  });
}
