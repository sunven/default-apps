window.hallmarkSlots = (slots) => {
  for (const [name, source] of Object.entries(slots)) {
    const slot = document.querySelector(`[data-slot="${name}"]`);
    if (!slot) continue;
    const img = new Image();
    img.alt = (typeof source === 'object' && source.alt) || slot.dataset.alt || '';
    img.onload = () => {
      slot.querySelectorAll(':scope > img').forEach(old => old.remove());
      slot.prepend(img);
    };
    img.src = typeof source === 'string' ? source : source.src;
  }
};

document.querySelectorAll('[data-switcher]').forEach(switcher => {
  const tablist = switcher.querySelector('[role="tablist"]');
  const tabs = Array.from(tablist.querySelectorAll('[role="tab"]'));
  const panels = tabs.map(tab => document.getElementById(tab.getAttribute('aria-controls')));

  function select(index, focus = false) {
    tabs.forEach((tab, i) => {
      tab.setAttribute('aria-selected', String(i === index));
      tab.tabIndex = i === index ? 0 : -1;
      panels[i].hidden = i !== index;
    });
    if (focus) tabs[index].focus();
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => select(index));
    tab.addEventListener('keydown', event => {
      let next = index;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length - 1;
      else return;
      event.preventDefault();
      select(next, true);
    });
  });

  select(0);
  switcher.classList.add('is-enhanced');
  tablist.hidden = false;
});
