/**
     * Collapsible right side menu. Adds a toggle handle riding the left edge of
     * the side menu; clicking it slides the whole menu (tab row + panels) off
     * screen and back. State is persisted in localStorage.
     */
    const COLLAPSED_CLASS = 'side-menu-collapsed';
    const STORAGE_KEY = 'ptcg-sim.side-menu-collapsed';
    
    export const initializeSideMenuToggle = () => {
      // inject the toggle button once
      if (document.getElementById('sideMenuToggle')) return;
    
      const toggle = document.createElement('button');
      toggle.id = 'sideMenuToggle';
      toggle.type = 'button';
      toggle.setAttribute('aria-label', 'Toggle side menu');
      toggle.setAttribute('aria-expanded', 'true');
      toggle.innerHTML = '<span class="side-menu-toggle-arrow">&#9656;</span>';
    
      document.body.appendChild(toggle);
    
      const applyState = (collapsed) => {
        document.body.classList.toggle(COLLAPSED_CLASS, collapsed);
        toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        toggle.title = collapsed ? 'Open menu' : 'Close menu';
        toggle.querySelector('.side-menu-toggle-arrow').innerHTML = collapsed
          ? '&#9666;'
          : '&#9656;';
        try {
          window.localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0');
        } catch {
          // storage unavailable — state is session-only
        }
    
        // Full-width playmat: when collapsed, the board iframes widen to reclaim
        // the menu's space. The sim recalculates card positions from live
        // container dimensions, so a window resize event after the 220ms slide
        // lets all existing sizing handlers run.
        window.setTimeout(() => window.dispatchEvent(new Event('resize')), 260);
      };
    
      // restore persisted state
      let initiallyCollapsed = false;
      try {
        initiallyCollapsed = window.localStorage.getItem(STORAGE_KEY) === '1';
      } catch {
        initiallyCollapsed = false;
      }
      applyState(initiallyCollapsed);
    
      toggle.addEventListener('click', () => {
        applyState(!document.body.classList.contains(COLLAPSED_CLASS));
      });
    };
    