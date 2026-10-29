/**
 * Phone layout switch for the deck builder tab: on narrow screens the card pane and
 * the deck pane take turns filling the window. The CSS (deck-builder-phone.css) reads
 * `data-phone-view` on the workspace; wider screens ignore it.
 */
export function initPhoneView(workspace) {
  const nav = document.getElementById('nativeDeckBuilderPhoneNav');
  if (!workspace || !nav) return;

  const buttons = [...nav.querySelectorAll('button[data-phone-view]')];
  const show = (view) => {
    workspace.dataset.phoneView = view;
    buttons.forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.phoneView === view));
    });
  };
  show('cards');
  nav.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-phone-view]');
    if (button) show(button.dataset.phoneView);
  });

  // Keep the Deck button's count in step with the counter the deck pane renders.
  const count = document.getElementById('nativeDeckBuilderPhoneCount');
  const counter = document.getElementById('nativeDeckBuilderCounter');
  if (!count || !counter) return;
  const syncCount = () => {
    const total = counter.querySelector('.native-deck-builder-counter-count')?.textContent;
    count.textContent = total ? `(${total})` : '';
  };
  new MutationObserver(syncCount).observe(counter, { childList: true, subtree: true });
  syncCount();
}
