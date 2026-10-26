export interface TabListController {
  select(id: string): boolean;
  tabs: HTMLButtonElement[];
}

export function bindTabList(root: HTMLElement): TabListController {
  const tabs = Array.from(
    root.querySelectorAll<HTMLButtonElement>("[data-ui-tab]"),
  );
  const panels = Array.from(
    root.querySelectorAll<HTMLElement>("[data-ui-panel]"),
  );

  const select = (id: string): boolean => {
    const panel = panels.find((candidate) => candidate.dataset.uiPanel === id);
    if (!panel) return false;

    for (const candidate of panels) {
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
    const id = tab.dataset.uiTab ?? "";
    const panel = panels.find((candidate) => candidate.dataset.uiPanel === id);
    tab.id ||= `${root.id}-tab-${id}`;
    panel?.setAttribute("aria-labelledby", tab.id);
    tab.addEventListener("click", () => select(tab.dataset.uiTab ?? ""));
    tab.addEventListener("keydown", (event) => {
      const index = tabs.indexOf(tab);
      let next: number;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % tabs.length;
      else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index + tabs.length - 1) % tabs.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = tabs.length - 1;
      else return;
      event.preventDefault();
      const target = tabs[next]!;
      if (select(target.dataset.uiTab ?? "")) target.focus();
    });
  }

  select(
    tabs.find((tab) => tab.getAttribute("aria-selected") === "true")?.dataset.uiTab ??
      tabs[0]?.dataset.uiTab ?? "",
  );

  return { select, tabs };
}

export function trapFocusWithin(root: HTMLElement, event: KeyboardEvent): void {
  const focusable = Array.from(
    root.querySelectorAll<HTMLElement>(
      'button:not([disabled]), select:not([disabled]), input:not([disabled]), summary',
    ),
  ).filter((element) => element.tabIndex >= 0 && !element.closest<HTMLElement>("[hidden]"));
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
