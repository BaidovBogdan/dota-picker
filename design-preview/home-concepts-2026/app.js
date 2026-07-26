const concepts = ["war-room", "broadcast", "notebook", "relic", "kinetic"];
const tabs = Array.from(document.querySelectorAll("[data-concept]"));
const panels = Array.from(document.querySelectorAll("[data-panel]"));
const copies = Array.from(document.querySelectorAll("[data-copy]"));
const palettes = Array.from(document.querySelectorAll("[data-palette]"));
const toast = document.querySelector(".demo-toast");
let toastTimer;

function selectConcept(name, syncUrl = true) {
  const next = concepts.includes(name) ? name : concepts[0];

  tabs.forEach((tab) => {
    const active = tab.dataset.concept === next;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
  });

  panels.forEach((panel) => {
    const active = panel.dataset.panel === next;
    panel.classList.toggle("is-active", active);
    panel.hidden = !active;
  });

  copies.forEach((copy) => copy.classList.toggle("is-active", copy.dataset.copy === next));
  palettes.forEach((palette) =>
    palette.classList.toggle("is-active", palette.dataset.palette === next),
  );

  if (syncUrl) {
    const url = new URL(window.location.href);
    url.searchParams.set("concept", next);
    window.history.replaceState({}, "", url);
  }
}

function showToast(message) {
  if (!toast) return;
  window.clearTimeout(toastTimer);
  toast.textContent = `${message} · интерактив будет на этапе реализации`;
  toast.classList.add("is-visible");
  toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 1700);
}

tabs.forEach((tab, index) => {
  tab.addEventListener("click", () => selectConcept(tab.dataset.concept));
  tab.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    let nextIndex = index;
    if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = tabs.length - 1;
    tabs[nextIndex].focus();
    selectConcept(tabs[nextIndex].dataset.concept);
  });
});

document.querySelectorAll(".demo-action").forEach((action) => {
  action.addEventListener("click", () => showToast(action.dataset.demo || "Действие"));
});

const params = new URLSearchParams(window.location.search);
if (params.get("export") === "1") document.body.classList.add("is-export");
selectConcept(params.get("concept") || concepts[0], false);
