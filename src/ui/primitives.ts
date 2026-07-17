export interface TabListController {
  select(id: string): boolean;
  tabs: HTMLButtonElement[];
}

export function bindTabList(root: HTMLElement): TabListController {
  const tabs = Array.from(
    root.querySelectorAll<HTMLButtonElement>("[data-ui-tab]"),
  );

  const select = (id: string): boolean => {
    const panel = root.querySelector<HTMLElement>(`[data-ui-panel="${id}"]`);
    if (!panel) return false;

    for (const candidate of root.querySelectorAll<HTMLElement>("[data-ui-panel]")) {
      const active = candidate === panel;
      candidate.hidden = !active;
      candidate.classList.toggle("is-active", active);
    }

    for (const tab of tabs) {
      const active = tab.dataset.uiTab === id;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
    }
    return true;
  };

  for (const tab of tabs) {
    tab.addEventListener("click", () => select(tab.dataset.uiTab ?? ""));
  }

  return { select, tabs };
}

export function trapFocusWithin(root: HTMLElement, event: KeyboardEvent): void {
  const focusable = Array.from(
    root.querySelectorAll<HTMLElement>(
      'button:not([disabled]), select:not([disabled]), input:not([disabled])',
    ),
  ).filter((element) => !element.closest<HTMLElement>("[hidden]"));
  if (focusable.length === 0) return;

  const first = focusable[0]!;
  const last = focusable[focusable.length - 1]!;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
