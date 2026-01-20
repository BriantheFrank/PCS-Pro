// Persist checklist progress using localStorage.
const STORAGE_KEY = "pcs-checklist";

const checkboxes = Array.from(document.querySelectorAll("input[type='checkbox']"));

const loadState = () => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    return {};
  }
  try {
    return JSON.parse(stored);
  } catch (error) {
    console.warn("Unable to parse checklist state.", error);
    return {};
  }
};

const saveState = (state) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
};

const state = loadState();

checkboxes.forEach((checkbox) => {
  const id = checkbox.dataset.id;
  checkbox.checked = Boolean(state[id]);

  checkbox.addEventListener("change", (event) => {
    state[id] = event.target.checked;
    saveState(state);
  });
});
