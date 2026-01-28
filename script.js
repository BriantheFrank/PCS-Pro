// Persist checklist progress using localStorage.
const STORAGE_KEY = "pcs-checklist";

const checklistCheckboxes = Array.from(
  document.querySelectorAll("input[type='checkbox'][data-id]")
);
const checklistItems = Array.from(document.querySelectorAll(".checklist-item"));

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

// Checklist accordion + auto-complete logic (only runs when checklist items exist).
const areSubtasksComplete = (item) => {
  const subtasks = Array.from(
    item.querySelectorAll(".sub-checklist input[type='checkbox']")
  );
  if (subtasks.length === 0) {
    return false;
  }
  return subtasks.every((subtask) => subtask.checked);
};

const syncParentCheckboxState = (item) => {
  const parentCheckbox = item.querySelector(
    "input[type='checkbox'][data-role='parent']"
  );
  if (!parentCheckbox) {
    return;
  }
  const isComplete = areSubtasksComplete(item);
  parentCheckbox.checked = isComplete;
  item.classList.toggle("is-complete", isComplete);
};

const setAccordionState = (item, isOpen) => {
  const details = item.querySelector(".item-details");
  const header = item.querySelector(".item-header");
  const toggle = item.querySelector(".accordion-toggle");
  if (!details || !header || !toggle) {
    return;
  }
  item.classList.toggle("is-open", isOpen);
  details.setAttribute("aria-hidden", String(!isOpen));
  header.setAttribute("aria-expanded", String(isOpen));
  toggle.setAttribute("aria-expanded", String(isOpen));
};

const setupAccordionItem = (item) => {
  const header = item.querySelector(".item-header");
  if (!header) {
    return;
  }
  setAccordionState(item, false);

  header.addEventListener("click", (event) => {
    if (event.target.closest("a")) {
      return;
    }
    setAccordionState(item, !item.classList.contains("is-open"));
  });

  header.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setAccordionState(item, !item.classList.contains("is-open"));
    }
  });
};

if (checklistCheckboxes.length > 0) {
  checklistCheckboxes.forEach((checkbox) => {
    const id = checkbox.dataset.id;
    const isParent = checkbox.dataset.role === "parent";
    if (!isParent) {
      checkbox.checked = Boolean(state[id]);
    }

    if (!isParent) {
      checkbox.addEventListener("change", (event) => {
        state[id] = event.target.checked;
        saveState(state);
        const item = event.target.closest(".checklist-item");
        if (item) {
          syncParentCheckboxState(item);
        }
      });
    }
  });
}

if (checklistItems.length > 0) {
  checklistItems.forEach((item) => {
    syncParentCheckboxState(item);
    setupAccordionItem(item);
  });
}

// Move inventory state management using localStorage.
const INVENTORY_KEY = "pcs-move-inventory";

const loadInventory = () => {
  const stored = localStorage.getItem(INVENTORY_KEY);
  if (!stored) {
    return { rooms: [] };
  }
  try {
    return JSON.parse(stored);
  } catch (error) {
    console.warn("Unable to parse inventory state.", error);
    return { rooms: [] };
  }
};

const saveInventory = (inventory) => {
  const serialized = JSON.stringify(inventory, (key, value) =>
    key === "editMode" ? undefined : value
  );
  localStorage.setItem(INVENTORY_KEY, serialized);
};

// Inventory UI helpers are initialized only when the page includes the module elements.
const inventorySearch = document.querySelector("#inventory-search");
const roomForm = document.querySelector("#room-form");
const roomNameInput = document.querySelector("#room-name");
const roomsContainer = document.querySelector("#rooms-container");
const totalWeightDisplay = document.querySelector("#total-weight");
const highValueList = document.querySelector("#high-value-list");
const highValueEmpty = document.querySelector("#high-value-empty");

if (inventorySearch && roomForm && roomNameInput && roomsContainer) {
  let inventory = loadInventory();
  let currentQuery = "";
  let activeLabelItem = null;
  // Track which item's action menu is open so toggles stay scoped per item.
  let activeMenuItemId = null;
  let activeRoomMenuIndex = null;
  let openRoomIndexes = new Set();

  const normalize = (value) => value.trim().toLowerCase();

  // Estimation model note:
  // The defaults below align with commonly cited household goods weight ranges
  // used by moving companies and PCS planning guidance:
  // - Standard moving box ≈ 40 lbs
  // - Couch/sofa ≈ 200–300 lbs
  // - Dining table ≈ 150–250 lbs
  // - Queen bed ≈ 150–200 lbs
  // - Dresser ≈ 100–200 lbs
  // - Refrigerator/large appliance ≈ 250–400 lbs
  // Values are set to midpoints of those ranges for realistic planning.
  const CATEGORY_DEFINITIONS = [
    { label: "Moving Box", defaultWeight: 40 },
    { label: "Couch / Sofa", defaultWeight: 250 },
    { label: "Chair", defaultWeight: 40 },
    { label: "Bed", defaultWeight: 175 },
    { label: "Dresser", defaultWeight: 150 },
    { label: "Table", defaultWeight: 200 },
    { label: "Appliance", defaultWeight: 300 },
    { label: "Miscellaneous", defaultWeight: 40 },
  ];

  const getCategoryDefinition = (categoryLabel) =>
    CATEGORY_DEFINITIONS.find((category) => category.label === categoryLabel) ||
    CATEGORY_DEFINITIONS[CATEGORY_DEFINITIONS.length - 1];

  const inferCategoryFromLabel = (label) => {
    const normalizedLabel = normalize(label);
    if (normalizedLabel.includes("box")) {
      return "Moving Box";
    }
    if (normalizedLabel.includes("sofa") || normalizedLabel.includes("couch")) {
      return "Couch / Sofa";
    }
    if (normalizedLabel.includes("bed")) {
      return "Bed";
    }
    if (normalizedLabel.includes("dresser")) {
      return "Dresser";
    }
    if (normalizedLabel.includes("table")) {
      return "Table";
    }
    if (
      normalizedLabel.includes("fridge") ||
      normalizedLabel.includes("refrigerator") ||
      normalizedLabel.includes("appliance")
    ) {
      return "Appliance";
    }
    if (normalizedLabel.includes("chair")) {
      return "Chair";
    }
    return "Miscellaneous";
  };

  const coerceWeight = (weight, fallbackWeight) => {
    const numericWeight = Number(weight);
    if (Number.isFinite(numericWeight) && numericWeight > 0) {
      return numericWeight;
    }
    return fallbackWeight;
  };

  const ensureItemDefaults = (item) => {
    if (!item.category) {
      item.category = inferCategoryFromLabel(item.label);
    }
    const categoryDefinition = getCategoryDefinition(item.category);
    item.weight = coerceWeight(item.weight, categoryDefinition.defaultWeight);
    if (typeof item.includeInEstimate !== "boolean") {
      item.includeInEstimate = true;
    }
    // High-value flag defaults to false so existing inventories remain valid.
    if (typeof item.isHighValue !== "boolean") {
      item.isHighValue = false;
    }
    if (!item.editMode) {
      item.editMode = null;
    }
  };

  const buildCategoryOptions = (selectedCategory) =>
    CATEGORY_DEFINITIONS.map(
      (category) =>
        `<option value="${category.label}" ${
          category.label === selectedCategory ? "selected" : ""
        }>${category.label}</option>`
    ).join("");

  const buildRoomOptions = (selectedRoomIndex) =>
    inventory.rooms
      .map(
        (room, index) =>
          `<option value="${index}" ${
            index === selectedRoomIndex ? "selected" : ""
          }>${room.name}</option>`
      )
      .join("");

  const recalculateWeights = () => {
    let totalWeight = 0;
    inventory.rooms.forEach((room) => {
      let roomWeight = 0;
      room.items.forEach((item) => {
        ensureItemDefaults(item);
        if (item.includeInEstimate) {
          roomWeight += item.weight;
        }
      });
      room.roomWeight = Math.round(roomWeight);
      totalWeight += room.roomWeight;
    });
    inventory.totalWeight = Math.round(totalWeight);
  };

  const syncInventoryState = () => {
    recalculateWeights();
    // Persist checkbox state so inclusion choices survive page reloads.
    saveInventory(inventory);
  };

  const refreshActiveLabelPanel = () => {
    if (!labelPanel || labelPanel.hidden) {
      return;
    }
    const context = getActiveLabelContext();
    if (!context) {
      return;
    }
    const settings = ensureLabelSettings(context.room, context.item);
    syncLabelInputs(settings);
    applyLabelPreview(settings);
  };

  const closeItemMenus = () => {
    roomsContainer
      .querySelectorAll(".inventory-item-menu .item-menu-dropdown")
      .forEach((menu) => {
        menu.hidden = true;
      });
    roomsContainer
      .querySelectorAll(".inventory-item-menu .item-menu-trigger")
      .forEach((button) => {
        button.setAttribute("aria-expanded", "false");
      });
    activeMenuItemId = null;
  };

  // Keep room-level menus isolated from item menus.
  const closeRoomMenus = () => {
    roomsContainer
      .querySelectorAll(".inventory-room-menu .item-menu-dropdown")
      .forEach((menu) => {
        menu.hidden = true;
      });
    roomsContainer
      .querySelectorAll(".inventory-room-menu .item-menu-trigger")
      .forEach((button) => {
        button.setAttribute("aria-expanded", "false");
      });
    activeRoomMenuIndex = null;
  };

  // Per-item edit mode keeps move/rename controls contextual to the active action.
  const setItemEditMode = (roomIndex, itemIndex, mode, itemCard) => {
    const item = inventory.rooms[roomIndex]?.items[itemIndex];
    if (!item) {
      return;
    }
    item.editMode = mode;
    if (!itemCard) {
      return;
    }
    itemCard.querySelectorAll(".inventory-item-panel").forEach((panel) => {
      panel.hidden = panel.dataset.panel !== mode;
    });
  };

  // Room-level edit mode mirrors item panels for inline rename controls.
  const setRoomEditMode = (roomIndex, mode, roomCard) => {
    const room = inventory.rooms[roomIndex];
    if (!room) {
      return;
    }
    room.editMode = mode;
    if (!roomCard) {
      return;
    }
    roomCard.querySelectorAll("[data-room-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.roomPanel !== mode;
    });
  };

  const adjustActiveLabelIndexOnRemoval = (roomIndex, itemIndex) => {
    if (!activeLabelItem || activeLabelItem.roomIndex !== roomIndex) {
      return;
    }
    if (activeLabelItem.itemIndex > itemIndex) {
      activeLabelItem = {
        roomIndex: activeLabelItem.roomIndex,
        itemIndex: activeLabelItem.itemIndex - 1,
      };
    }
  };

  // Build the room inventory card with collapsible content and inline add-item form.
  const renderRoom = (room, roomIndex) => {
    const filteredQuery = normalize(currentQuery);
    const roomMatches = normalize(room.name).includes(filteredQuery);
    const filteredItems = roomMatches
      ? room.items
      : room.items.filter((item) => {
          const labelMatch = normalize(item.label).includes(filteredQuery);
          const notesMatch = normalize(item.notes || "").includes(filteredQuery);
          return labelMatch || notesMatch;
        });

    if (filteredQuery && !roomMatches && filteredItems.length === 0) {
      return "";
    }

    const itemCount = room.items.length;
    const itemsMarkup =
      filteredItems.length === 0
        ? `<p class="inventory-empty">No matching items yet.</p>`
        : `<ul class="inventory-items">
            ${filteredItems
              .map((item, itemIndex) => {
                const categoryOptions = buildCategoryOptions(item.category);
                const isIncluded = item.includeInEstimate;
                const isHighValue = item.isHighValue;
                const editMode = item.editMode || null;
                return `
                  <li class="inventory-item ${
                    isIncluded ? "" : "inventory-item--excluded"
                  }">
                    <div class="inventory-item-main">
                      <div class="inventory-item-header">
                        <strong>${item.label}</strong>
                        <div class="inventory-item-menu">
                          <button
                            type="button"
                            class="item-menu-trigger"
                            data-action="toggle-item-menu"
                            data-room-index="${roomIndex}"
                            data-item-index="${itemIndex}"
                            aria-haspopup="true"
                            aria-expanded="false"
                            aria-label="Item options"
                          >
                            ⋮
                          </button>
                          <div class="item-menu-dropdown" role="menu" hidden>
                            <button
                              type="button"
                              class="item-menu-item"
                              data-action="open-panel"
                              data-panel="move"
                              data-room-index="${roomIndex}"
                              data-item-index="${itemIndex}"
                            >
                              Move to Another Room
                            </button>
                            <button
                              type="button"
                              class="item-menu-item"
                              data-action="open-panel"
                              data-panel="rename"
                              data-room-index="${roomIndex}"
                              data-item-index="${itemIndex}"
                            >
                              Rename Item
                            </button>
                            <button
                              type="button"
                              class="item-menu-item item-menu-item--danger"
                              data-action="delete-item"
                              data-room-index="${roomIndex}"
                              data-item-index="${itemIndex}"
                            >
                              Delete Item
                            </button>
                          </div>
                        </div>
                      </div>
                      <div class="inventory-item-fields">
                        <label class="inventory-item-field">
                          Category
                          <select
                            data-field="category"
                            data-room-index="${roomIndex}"
                            data-item-index="${itemIndex}"
                          >
                            ${categoryOptions}
                          </select>
                        </label>
                        <label class="inventory-item-field">
                          Estimated weight (lbs)
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value="${item.weight}"
                            data-field="weight"
                            data-room-index="${roomIndex}"
                            data-item-index="${itemIndex}"
                          />
                        </label>
                        <label class="inventory-item-field inventory-item-checkbox">
                          <input
                            type="checkbox"
                            data-field="include"
                            data-room-index="${roomIndex}"
                            data-item-index="${itemIndex}"
                            ${isIncluded ? "checked" : ""}
                          />
                          <span>Include in weight estimate</span>
                        </label>
                        <label class="inventory-item-field inventory-item-checkbox">
                          <input
                            type="checkbox"
                            data-field="high-value"
                            data-room-index="${roomIndex}"
                            data-item-index="${itemIndex}"
                            ${isHighValue ? "checked" : ""}
                          />
                          <span>High value item</span>
                        </label>
                      </div>
                      ${
                        item.notes
                          ? `<p class="inventory-notes">${item.notes}</p>`
                          : ""
                      }
                      <div
                        class="inventory-item-panel"
                        data-panel="move"
                        ${editMode === "move" ? "" : "hidden"}
                      >
                        <label class="inventory-item-field">
                          Move to room
                          <select
                            data-move-select
                            data-room-index="${roomIndex}"
                            data-item-index="${itemIndex}"
                          >
                            ${buildRoomOptions(roomIndex)}
                          </select>
                        </label>
                        <div class="inventory-item-panel-actions">
                          <button
                            type="button"
                            class="label-action secondary"
                            data-action="cancel-panel"
                            data-room-index="${roomIndex}"
                            data-item-index="${itemIndex}"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            class="label-action"
                            data-action="confirm-move"
                            data-room-index="${roomIndex}"
                            data-item-index="${itemIndex}"
                          >
                            Move Item
                          </button>
                        </div>
                      </div>
                      <div
                        class="inventory-item-panel"
                        data-panel="rename"
                        ${editMode === "rename" ? "" : "hidden"}
                      >
                        <label class="inventory-item-field">
                          New item name
                          <input
                            type="text"
                            value="${item.label}"
                            data-rename-input
                            data-room-index="${roomIndex}"
                            data-item-index="${itemIndex}"
                          />
                        </label>
                        <div class="inventory-item-panel-actions">
                          <button
                            type="button"
                            class="label-action secondary"
                            data-action="cancel-panel"
                            data-room-index="${roomIndex}"
                            data-item-index="${itemIndex}"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            class="label-action"
                            data-action="confirm-rename"
                            data-room-index="${roomIndex}"
                            data-item-index="${itemIndex}"
                          >
                            Save Name
                          </button>
                        </div>
                      </div>
                      <div class="inventory-item-footer">
                        <div class="inventory-item-actions">
                          <button
                            type="button"
                            class="label-action"
                            data-action="view-label"
                            data-room-index="${roomIndex}"
                            data-item-index="${itemIndex}"
                          >
                            Edit Label
                          </button>
                          <button
                            type="button"
                            class="label-action secondary"
                            data-action="print-label"
                            data-room-index="${roomIndex}"
                            data-item-index="${itemIndex}"
                          >
                            Print Label
                          </button>
                        </div>
                      </div>
                    </div>
                  </li>
                `;
              })
              .join("")}
          </ul>`;

    const shouldOpen = filteredQuery || openRoomIndexes.has(roomIndex);

    return `
      <details class="inventory-room" data-room-index="${roomIndex}" ${
        shouldOpen ? "open" : ""
      }>
        <summary>
          <div class="inventory-room-summary">
            <div class="inventory-room-heading">
              <h3>${room.name}</h3>
              <span class="inventory-room-meta">${itemCount} items</span>
            </div>
            <div class="inventory-room-menu">
              <button
                type="button"
                class="item-menu-trigger"
                data-action="toggle-room-menu"
                data-room-index="${roomIndex}"
                aria-haspopup="true"
                aria-expanded="false"
                aria-label="Room options"
              >
                ⋮
              </button>
              <div class="item-menu-dropdown" role="menu" hidden>
                <button
                  type="button"
                  class="item-menu-item"
                  data-action="open-room-panel"
                  data-panel="rename"
                  data-room-index="${roomIndex}"
                >
                  Rename room
                </button>
                <button
                  type="button"
                  class="item-menu-item item-menu-item--danger"
                  data-action="delete-room"
                  data-room-index="${roomIndex}"
                >
                  Delete room
                </button>
              </div>
            </div>
          </div>
        </summary>
        <div
          class="inventory-room-panel inventory-item-panel"
          data-room-panel="rename"
          ${room.editMode === "rename" ? "" : "hidden"}
        >
          <label class="inventory-item-field">
            New room name
            <input
              type="text"
              value="${room.name}"
              data-room-rename-input
              data-room-index="${roomIndex}"
            />
          </label>
          <div class="inventory-item-panel-actions">
            <button
              type="button"
              class="label-action secondary"
              data-action="cancel-room-panel"
              data-room-index="${roomIndex}"
            >
              Cancel
            </button>
            <button
              type="button"
              class="label-action"
              data-action="confirm-room-rename"
              data-room-index="${roomIndex}"
            >
              Save Name
            </button>
          </div>
        </div>
        <form class="inventory-form" data-room-index="${roomIndex}">
          <label for="item-label-${roomIndex}">Add a box or item</label>
          <input
            id="item-label-${roomIndex}"
            name="item-label"
            type="text"
            placeholder="Box 1 – Dishes"
            required
          />
          <label for="item-category-${roomIndex}">Item category</label>
          <select id="item-category-${roomIndex}" name="item-category">
            ${buildCategoryOptions("Moving Box")}
          </select>
          <label for="item-notes-${roomIndex}">Notes (optional)</label>
          <textarea
            id="item-notes-${roomIndex}"
            name="item-notes"
            placeholder="Fragile, open first, belongs upstairs"
          ></textarea>
          <button type="submit">Add Item</button>
        </form>
        <p class="inventory-room-weight">
          Estimated Weight for ${room.name}: ${room.roomWeight} lbs
        </p>
        ${itemsMarkup}
      </details>
    `;
  };

  // High-value summary list stays in sync with the inventory state.
  const renderHighValueSummary = () => {
    if (!highValueList || !highValueEmpty) {
      return;
    }
    const highValueItems = [];
    inventory.rooms.forEach((room) => {
      room.items.forEach((item) => {
        ensureItemDefaults(item);
        if (item.isHighValue) {
          highValueItems.push({ item, roomName: room.name });
        }
      });
    });

    if (highValueItems.length === 0) {
      highValueList.innerHTML = "";
      highValueEmpty.hidden = false;
      return;
    }

    highValueEmpty.hidden = true;
    highValueList.innerHTML = highValueItems
      .map(({ item, roomName }) => {
        const weightLabel = Number.isFinite(item.weight)
          ? `${item.weight} lbs`
          : "";
        return `
          <li class="inventory-high-value-item">
            <div class="inventory-high-value-details">
              <strong>${item.label}</strong>
              <span class="inventory-high-value-room">${roomName}</span>
            </div>
            ${
              weightLabel
                ? `<span class="inventory-high-value-weight">${weightLabel}</span>`
                : ""
            }
          </li>
        `;
      })
      .join("");
  };

  // Render all rooms based on current search query and stored state.
  const renderRooms = () => {
    if (!currentQuery) {
      openRoomIndexes = new Set(
        Array.from(roomsContainer.querySelectorAll(".inventory-room"))
          .filter((roomCard) => roomCard.open)
          .map((roomCard) => Number(roomCard.dataset.roomIndex))
          .filter((roomIndex) => !Number.isNaN(roomIndex))
      );
    }

    if (inventory.rooms.length === 0) {
      roomsContainer.innerHTML = `
        <section class="info-panel">
          <h2>Start your room list</h2>
          <p>
            Add a room above to begin tracking boxes and household items for
            your move.
          </p>
        </section>
      `;
      renderHighValueSummary();
      return;
    }

    roomsContainer.innerHTML = inventory.rooms
      .map((room, index) => renderRoom(room, index))
      .join("");
    activeMenuItemId = null;
    activeRoomMenuIndex = null;

    if (totalWeightDisplay) {
      totalWeightDisplay.textContent = `${inventory.totalWeight} lbs`;
    }
    renderHighValueSummary();
  };

  // Add a room to the inventory state.
  roomForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = roomNameInput.value.trim();
    if (!name) {
      return;
    }
    inventory.rooms.push({ name, items: [] });
    syncInventoryState();
    roomNameInput.value = "";
    renderRooms();
  });

  // Delegated handler to capture add-item submissions for any room.
  roomsContainer.addEventListener("submit", (event) => {
    const form = event.target.closest("form[data-room-index]");
    if (!form) {
      return;
    }
    event.preventDefault();
    const roomIndex = Number(form.dataset.roomIndex);
    const labelInput = form.querySelector("input[name='item-label']");
    const categorySelect = form.querySelector("select[name='item-category']");
    const notesInput = form.querySelector("textarea[name='item-notes']");
    const label = labelInput.value.trim();
    const notes = notesInput.value.trim();
    const category = categorySelect?.value || "Miscellaneous";
    if (!label || Number.isNaN(roomIndex)) {
      return;
    }
    const categoryDefinition = getCategoryDefinition(category);
    const newItem = {
      label,
      category,
      notes,
      weight: categoryDefinition.defaultWeight,
      includeInEstimate: true,
      // High-value flag stays false unless explicitly marked by the user.
      isHighValue: false,
    };
    inventory.rooms[roomIndex].items.push(newItem);
    syncInventoryState();
    labelInput.value = "";
    notesInput.value = "";
    renderRooms();
  });

  roomsContainer.addEventListener("change", (event) => {
    const target = event.target.closest("[data-field]");
    if (!target) {
      return;
    }
    const roomIndex = Number(target.dataset.roomIndex);
    const itemIndex = Number(target.dataset.itemIndex);
    if (Number.isNaN(roomIndex) || Number.isNaN(itemIndex)) {
      return;
    }
    const item = inventory.rooms[roomIndex]?.items[itemIndex];
    if (!item) {
      return;
    }
    if (target.dataset.field === "category") {
      item.category = target.value;
      item.weight = getCategoryDefinition(item.category).defaultWeight;
    }
    if (target.dataset.field === "weight") {
      item.weight = coerceWeight(
        target.value,
        getCategoryDefinition(item.category).defaultWeight
      );
    }
    if (target.dataset.field === "include") {
      item.includeInEstimate = target.checked;
    }
    if (target.dataset.field === "high-value") {
      // Update the high-value summary list immediately when toggled.
      item.isHighValue = target.checked;
    }
    syncInventoryState();
    renderRooms();
  });

  // Live search filters rooms, items, and notes as the user types.
  inventorySearch.addEventListener("input", (event) => {
    currentQuery = event.target.value;
    renderRooms();
  });

  // Label preview & print handling.
  const labelPanel = document.querySelector("#label-panel");
  const labelTitle = document.querySelector("#label-title");
  const labelRoom = document.querySelector("#label-room");
  const labelWeight = document.querySelector("#label-weight");
  const labelNotes = document.querySelector("#label-notes");
  const labelNotesRow = document.querySelector("#label-notes-row");
  const labelTitleInput = document.querySelector("#label-title-input");
  const labelRoomInput = document.querySelector("#label-room-input");
  const labelWeightInput = document.querySelector("#label-weight-input");
  const labelNotesInput = document.querySelector("#label-notes-input");
  const labelTitleSizeInput = document.querySelector("#label-title-size");
  const labelBodySizeInput = document.querySelector("#label-body-size");
  const labelTitleSizeValue = document.querySelector("#label-title-size-value");
  const labelBodySizeValue = document.querySelector("#label-body-size-value");
  const printLabelButton = document.querySelector("#print-label-button");
  const downloadLabelButton = document.querySelector("#download-label-button");
  const closeLabelButton = document.querySelector("#close-label-button");
  const printLabel = document.querySelector("#print-label");

  const defaultLabelSettings = (room, item) => ({
    title: item.label,
    room: room.name,
    weight: `${item.weight} lbs`,
    notes: item.notes || "",
    titleSize: 26,
    bodySize: 18,
  });

  const ensureLabelSettings = (room, item) => {
    if (!item.labelSettings) {
      item.labelSettings = defaultLabelSettings(room, item);
    }
    const defaults = defaultLabelSettings(room, item);
    item.labelSettings = {
      ...defaults,
      ...item.labelSettings,
    };
    return item.labelSettings;
  };

  const applyLabelPreview = (settings) => {
    if (!labelTitle || !labelRoom || !labelWeight || !labelNotes || !printLabel) {
      return;
    }
    labelTitle.textContent = settings.title || "Box Label";
    labelRoom.textContent = settings.room || "Room";
    labelWeight.textContent = settings.weight || "Weight";
    labelNotes.textContent = settings.notes || "";
    if (labelNotesRow) {
      labelNotesRow.hidden = !settings.notes;
    }
    printLabel.style.setProperty("--label-title-size", `${settings.titleSize}px`);
    printLabel.style.setProperty("--label-body-size", `${settings.bodySize}px`);
  };

  const syncLabelInputs = (settings) => {
    if (labelTitleInput) {
      labelTitleInput.value = settings.title;
    }
    if (labelRoomInput) {
      labelRoomInput.value = settings.room;
    }
    if (labelWeightInput) {
      labelWeightInput.value = settings.weight;
    }
    if (labelNotesInput) {
      labelNotesInput.value = settings.notes;
    }
    if (labelTitleSizeInput) {
      labelTitleSizeInput.value = settings.titleSize;
    }
    if (labelBodySizeInput) {
      labelBodySizeInput.value = settings.bodySize;
    }
    if (labelTitleSizeValue) {
      labelTitleSizeValue.textContent = `${settings.titleSize}px`;
    }
    if (labelBodySizeValue) {
      labelBodySizeValue.textContent = `${settings.bodySize}px`;
    }
  };

  const getActiveLabelContext = () => {
    if (!activeLabelItem) {
      return null;
    }
    const room = inventory.rooms[activeLabelItem.roomIndex];
    const item = room?.items[activeLabelItem.itemIndex];
    if (!room || !item) {
      return null;
    }
    return { room, item };
  };

  const openLabelPanel = (roomIndex, itemIndex) => {
    if (!labelPanel) {
      return;
    }
    const room = inventory.rooms[roomIndex];
    const item = room?.items[itemIndex];
    if (!room || !item) {
      return;
    }
    activeLabelItem = { roomIndex, itemIndex };
    const labelSettings = ensureLabelSettings(room, item);
    saveInventory(inventory);
    syncLabelInputs(labelSettings);
    applyLabelPreview(labelSettings);
    labelPanel.hidden = false;
    labelPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const updateLabelSetting = (field, value) => {
    const context = getActiveLabelContext();
    if (!context) {
      return;
    }
    const labelSettings = ensureLabelSettings(context.room, context.item);
    labelSettings[field] = value;
    applyLabelPreview(labelSettings);
    saveInventory(inventory);
  };

  const slugify = (text) =>
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "label";

  const escapeHtml = (value) =>
    String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  // Label file generation is handled client-side to avoid any backend dependency.
  const buildLabelFile = (settings) => {
    const safeTitle = escapeHtml(settings.title);
    const safeRoom = escapeHtml(settings.room);
    const safeWeight = escapeHtml(settings.weight);
    const safeNotes = escapeHtml(settings.notes);
    const notesMarkup = settings.notes
      ? `<div class="label-row"><span class="label-key">Notes:</span><span class="label-value label-body">${safeNotes}</span></div>`
      : "";
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeTitle} Label</title>
    <style>
      body { margin: 0; padding: 2rem; font-family: "Inter", "Roboto", "Segoe UI", system-ui, sans-serif; background: #ffffff; }
      .print-label { border: 2px solid #111827; border-radius: 12px; padding: 1.5rem; display: grid; gap: 0.75rem; }
      .label-row { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: baseline; }
      .label-key { font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; font-size: 0.85rem; }
      .label-value { font-weight: 600; color: #111827; }
      .label-title { font-size: ${settings.titleSize}px; }
      .label-body { font-size: ${settings.bodySize}px; }
      @media print {
        body { padding: 0; }
        .print-label { page-break-inside: avoid; }
      }
    </style>
  </head>
  <body>
    <div class="print-label">
      <div class="label-row">
        <span class="label-key">Box:</span>
        <span class="label-value label-title">${safeTitle}</span>
      </div>
      <div class="label-row">
        <span class="label-key">Room:</span>
        <span class="label-value label-body">${safeRoom}</span>
      </div>
      <div class="label-row">
        <span class="label-key">Est. Weight:</span>
        <span class="label-value label-body">${safeWeight}</span>
      </div>
      ${notesMarkup}
    </div>
  </body>
</html>`;
  };

  if (labelTitleInput) {
    labelTitleInput.addEventListener("input", (event) => {
      updateLabelSetting("title", event.target.value);
    });
  }
  if (labelRoomInput) {
    labelRoomInput.addEventListener("input", (event) => {
      updateLabelSetting("room", event.target.value);
    });
  }
  if (labelWeightInput) {
    labelWeightInput.addEventListener("input", (event) => {
      updateLabelSetting("weight", event.target.value);
    });
  }
  if (labelNotesInput) {
    labelNotesInput.addEventListener("input", (event) => {
      updateLabelSetting("notes", event.target.value);
    });
  }
  if (labelTitleSizeInput) {
    labelTitleSizeInput.addEventListener("input", (event) => {
      const size = Number(event.target.value) || 26;
      if (labelTitleSizeValue) {
        labelTitleSizeValue.textContent = `${size}px`;
      }
      updateLabelSetting("titleSize", size);
    });
  }
  if (labelBodySizeInput) {
    labelBodySizeInput.addEventListener("input", (event) => {
      const size = Number(event.target.value) || 18;
      if (labelBodySizeValue) {
        labelBodySizeValue.textContent = `${size}px`;
      }
      updateLabelSetting("bodySize", size);
    });
  }

  if (printLabelButton) {
    printLabelButton.addEventListener("click", () => {
      if (!activeLabelItem) {
        return;
      }
      window.print();
    });
  }

  if (downloadLabelButton) {
    downloadLabelButton.addEventListener("click", () => {
      const context = getActiveLabelContext();
      if (!context) {
        return;
      }
      const settings = ensureLabelSettings(context.room, context.item);
      const fileContents = buildLabelFile(settings);
      const filename = `${slugify(settings.title || settings.room)}-label.html`;
      const blob = new Blob([fileContents], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    });
  }

  if (closeLabelButton && labelPanel) {
    closeLabelButton.addEventListener("click", () => {
      labelPanel.hidden = true;
      activeLabelItem = null;
    });
  }

  // Close item action menus when clicking elsewhere on the page.
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".inventory-item-menu")) {
      closeItemMenus();
    }
    if (!event.target.closest(".inventory-room-menu")) {
      closeRoomMenus();
    }
  });

  // Item-level action menu handlers (move, rename, delete, label shortcuts).
  roomsContainer.addEventListener("click", (event) => {
    const actionButton = event.target.closest("[data-action]");
    if (!actionButton) {
      return;
    }
    const action = actionButton.dataset.action;
    const roomIndex = Number(actionButton.dataset.roomIndex);
    if (Number.isNaN(roomIndex)) {
      return;
    }
    const room = inventory.rooms[roomIndex];
    if (!room) {
      return;
    }

    // Room-level action menu handling.
    if (action === "toggle-room-menu") {
      event.preventDefault();
      event.stopPropagation();
      const menuWrapper = actionButton.closest(".inventory-room-menu");
      const menu = menuWrapper?.querySelector(".item-menu-dropdown");
      if (!menu || !menuWrapper) {
        return;
      }
      const shouldOpen = activeRoomMenuIndex !== roomIndex || menu.hidden;
      closeRoomMenus();
      closeItemMenus();
      if (shouldOpen) {
        menu.hidden = false;
        actionButton.setAttribute("aria-expanded", "true");
        activeRoomMenuIndex = roomIndex;
      }
      return;
    }
    if (action === "open-room-panel") {
      event.preventDefault();
      event.stopPropagation();
      const panelName = actionButton.dataset.panel;
      const roomCard = actionButton.closest(".inventory-room");
      closeRoomMenus();
      closeItemMenus();
      // Track per-room edit mode so rename controls only appear when requested.
      setRoomEditMode(roomIndex, panelName, roomCard);
      const panel = roomCard?.querySelector(
        `[data-room-panel="${panelName}"]`
      );
      const focusTarget = panel?.querySelector("input");
      focusTarget?.focus();
      return;
    }
    if (action === "cancel-room-panel") {
      event.preventDefault();
      event.stopPropagation();
      const roomCard = actionButton.closest(".inventory-room");
      setRoomEditMode(roomIndex, null, roomCard);
      return;
    }
    if (action === "confirm-room-rename") {
      event.preventDefault();
      event.stopPropagation();
      const roomCard = actionButton.closest(".inventory-room");
      const input = roomCard?.querySelector("[data-room-rename-input]");
      const newName = input?.value.trim();
      if (!newName) {
        return;
      }
      const oldRoomName = room.name;
      room.name = newName;
      room.editMode = null;
      room.items.forEach((item) => {
        if (
          item.labelSettings &&
          (!item.labelSettings.room || item.labelSettings.room === oldRoomName)
        ) {
          item.labelSettings.room = newName;
        }
      });
      syncInventoryState();
      renderRooms();
      refreshActiveLabelPanel();
      return;
    }
    if (action === "delete-room") {
      event.preventDefault();
      event.stopPropagation();
      const confirmed = window.confirm(
        "Delete this room and all items inside it? This cannot be undone."
      );
      if (!confirmed) {
        return;
      }
      const wasActiveRoom =
        activeLabelItem && activeLabelItem.roomIndex === roomIndex;
      inventory.rooms.splice(roomIndex, 1);
      if (wasActiveRoom) {
        if (labelPanel) {
          labelPanel.hidden = true;
        }
        activeLabelItem = null;
      } else if (activeLabelItem && activeLabelItem.roomIndex > roomIndex) {
        activeLabelItem = {
          roomIndex: activeLabelItem.roomIndex - 1,
          itemIndex: activeLabelItem.itemIndex,
        };
      }
      openRoomIndexes = new Set(
        Array.from(openRoomIndexes)
          .filter((index) => index !== roomIndex)
          .map((index) => (index > roomIndex ? index - 1 : index))
      );
      closeRoomMenus();
      closeItemMenus();
      syncInventoryState();
      renderRooms();
      refreshActiveLabelPanel();
      return;
    }

    const itemIndex = Number(actionButton.dataset.itemIndex);
    const item = room?.items[itemIndex];
    if (!item) {
      return;
    }

    if (action === "toggle-item-menu") {
      // Toggle the clicked menu, ensuring only one menu is open at a time.
      const menuWrapper = actionButton.closest(".inventory-item-menu");
      const menu = menuWrapper?.querySelector(".item-menu-dropdown");
      if (!menu || !menuWrapper) {
        return;
      }
      const menuId = `${roomIndex}-${itemIndex}`;
      const shouldOpen = activeMenuItemId !== menuId || menu.hidden;
      closeItemMenus();
      closeRoomMenus();
      if (shouldOpen) {
        menu.hidden = false;
        actionButton.setAttribute("aria-expanded", "true");
        activeMenuItemId = menuId;
      }
      return;
    }
    if (action === "open-panel") {
      const panelName = actionButton.dataset.panel;
      const itemCard = actionButton.closest(".inventory-item");
      closeItemMenus();
      closeRoomMenus();
      // Track per-item edit mode so move/rename controls only appear when requested.
      setItemEditMode(roomIndex, itemIndex, panelName, itemCard);
      const panel = itemCard?.querySelector(
        `.inventory-item-panel[data-panel="${panelName}"]`
      );
      const focusTarget = panel?.querySelector("input, select");
      focusTarget?.focus();
      return;
    }
    if (action === "cancel-panel") {
      const itemCard = actionButton.closest(".inventory-item");
      setItemEditMode(roomIndex, itemIndex, null, itemCard);
      return;
    }
    if (action === "confirm-move") {
      const itemCard = actionButton.closest(".inventory-item");
      const select = itemCard?.querySelector("[data-move-select]");
      const destinationIndex = Number(select?.value);
      if (Number.isNaN(destinationIndex)) {
        return;
      }
      if (destinationIndex === roomIndex) {
        setItemEditMode(roomIndex, itemIndex, null, itemCard);
        return;
      }
      const oldRoomName = room.name;
      const [movedItem] = room.items.splice(itemIndex, 1);
      if (!movedItem) {
        return;
      }
      movedItem.editMode = null;
      const wasActive =
        activeLabelItem &&
        activeLabelItem.roomIndex === roomIndex &&
        activeLabelItem.itemIndex === itemIndex;
      if (!wasActive) {
        adjustActiveLabelIndexOnRemoval(roomIndex, itemIndex);
      }
      const destinationRoom = inventory.rooms[destinationIndex];
      destinationRoom.items.push(movedItem);
      if (movedItem.labelSettings && movedItem.labelSettings.room === oldRoomName) {
        movedItem.labelSettings.room = destinationRoom.name;
      }
      if (wasActive) {
        activeLabelItem = {
          roomIndex: destinationIndex,
          itemIndex: destinationRoom.items.length - 1,
        };
      }
      syncInventoryState();
      renderRooms();
      refreshActiveLabelPanel();
      return;
    }
    if (action === "confirm-rename") {
      const itemCard = actionButton.closest(".inventory-item");
      const input = itemCard?.querySelector("[data-rename-input]");
      const newLabel = input?.value.trim();
      if (!newLabel) {
        return;
      }
      const oldLabel = item.label;
      item.label = newLabel;
      item.editMode = null;
      if (
        item.labelSettings &&
        (!item.labelSettings.title || item.labelSettings.title === oldLabel)
      ) {
        item.labelSettings.title = newLabel;
      }
      syncInventoryState();
      renderRooms();
      refreshActiveLabelPanel();
      return;
    }
    if (action === "delete-item") {
      const confirmed = window.confirm(
        "Are you sure you want to delete this item? This cannot be undone."
      );
      if (!confirmed) {
        return;
      }
      const wasActive =
        activeLabelItem &&
        activeLabelItem.roomIndex === roomIndex &&
        activeLabelItem.itemIndex === itemIndex;
      room.items.splice(itemIndex, 1);
      if (wasActive) {
        if (labelPanel) {
          labelPanel.hidden = true;
        }
        activeLabelItem = null;
      } else {
        adjustActiveLabelIndexOnRemoval(roomIndex, itemIndex);
      }
      syncInventoryState();
      renderRooms();
      refreshActiveLabelPanel();
      return;
    }
    if (action === "view-label") {
      openLabelPanel(roomIndex, itemIndex);
      return;
    }
    if (action === "print-label") {
      openLabelPanel(roomIndex, itemIndex);
      setTimeout(() => window.print(), 50);
    }
  });

  syncInventoryState();
  renderRooms();
}

// Move logistics calendar + accordion events.
const calendarGrid = document.querySelector("#calendar-grid");
const calendarLabel = document.querySelector("#calendar-label");
const calendarToggleButtons = Array.from(
  document.querySelectorAll("[data-view]")
);
const calendarNavButtons = Array.from(
  document.querySelectorAll("[data-nav]")
);
const logisticsSections = Array.from(
  document.querySelectorAll(".logistics-section[data-event-id]")
);
const itineraryStopsContainer = document.querySelector("#itinerary-stops");
const itineraryTemplate = document.querySelector("#itinerary-stop-template");
const addItineraryStopButton = document.querySelector("#add-itinerary-stop");

if (calendarGrid && calendarLabel) {
  const calendarState = {
    view: "month",
    focusDate: new Date(),
  };
  const events = new Map();

  const toDateKey = (date) =>
    [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0"),
    ].join("-");

  const parseTime = (value) => {
    if (!value) {
      return "";
    }
    const [hours, minutes] = value.split(":").map(Number);
    const clock = new Date();
    clock.setHours(hours, minutes || 0, 0, 0);
    return clock.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const startOfWeek = (date) => {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - start.getDay());
    return start;
  };

  const endOfWeek = (date) => {
    const end = startOfWeek(date);
    end.setDate(end.getDate() + 6);
    return end;
  };

  const updateCalendarLabel = (startDate, endDate) => {
    if (calendarState.view === "month") {
      calendarLabel.textContent = new Intl.DateTimeFormat("en-US", {
        month: "long",
        year: "numeric",
      }).format(calendarState.focusDate);
      return;
    }
    const formatter = new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
    });
    calendarLabel.textContent = `Week of ${formatter.format(
      startDate
    )} – ${formatter.format(endDate)}`;
  };

  const renderCalendar = () => {
    const focusDate = calendarState.focusDate;
    const monthStart = new Date(focusDate.getFullYear(), focusDate.getMonth(), 1);
    const monthEnd = new Date(focusDate.getFullYear(), focusDate.getMonth() + 1, 0);
    let startDate = monthStart;
    let endDate = monthEnd;

    if (calendarState.view === "month") {
      startDate = startOfWeek(monthStart);
      endDate = endOfWeek(monthEnd);
    } else {
      startDate = startOfWeek(focusDate);
      endDate = endOfWeek(focusDate);
    }

    updateCalendarLabel(startDate, endDate);
    calendarGrid.innerHTML = "";

    const eventsByDate = {};
    events.forEach((event) => {
      if (!event.date) {
        return;
      }
      if (!eventsByDate[event.date]) {
        eventsByDate[event.date] = [];
      }
      eventsByDate[event.date].push(event);
    });

    Object.values(eventsByDate).forEach((dayEvents) => {
      dayEvents.sort((a, b) => (a.time || "").localeCompare(b.time || ""));
    });

    const dayIterator = new Date(startDate);
    const todayKey = toDateKey(new Date());

    while (dayIterator <= endDate) {
      const dayKey = toDateKey(dayIterator);
      const dayCell = document.createElement("div");
      dayCell.className = "calendar-day";
      dayCell.setAttribute("role", "gridcell");

      if (calendarState.view === "month" && dayIterator.getMonth() !== focusDate.getMonth()) {
        dayCell.classList.add("is-outside");
      }
      if (dayKey === todayKey) {
        dayCell.classList.add("is-today");
      }

      const header = document.createElement("div");
      header.className = "calendar-day-header";
      header.textContent = dayIterator.toLocaleDateString("en-US", {
        weekday: "short",
        day: "numeric",
      });
      dayCell.appendChild(header);

      const eventList = document.createElement("div");
      eventList.className = "calendar-events";
      const dayEvents = eventsByDate[dayKey] || [];
      dayEvents.forEach((event) => {
        const eventCard = document.createElement("div");
        eventCard.className = "calendar-event";

        const title = document.createElement("div");
        title.className = "calendar-event-title";
        title.textContent = event.title;
        eventCard.appendChild(title);

        const metaPieces = [];
        if (event.time) {
          metaPieces.push(parseTime(event.time));
        }
        if (event.location) {
          metaPieces.push(event.location);
        }
        if (metaPieces.length > 0) {
          const meta = document.createElement("div");
          meta.className = "calendar-event-meta";
          meta.textContent = metaPieces.join(" • ");
          eventCard.appendChild(meta);
        }

        eventList.appendChild(eventCard);
      });

      dayCell.appendChild(eventList);
      calendarGrid.appendChild(dayCell);

      dayIterator.setDate(dayIterator.getDate() + 1);
    }
  };

  const upsertEvent = (event) => {
    events.set(event.id, event);
    renderCalendar();
  };

  const removeEvent = (eventId) => {
    if (events.has(eventId)) {
      events.delete(eventId);
      renderCalendar();
    }
  };

  const updateEventFromSection = (section) => {
    const eventId = section.dataset.eventId;
    const title = section.dataset.eventTitle;
    const dateInput = section.querySelector("[data-role='date']");
    const timeInput = section.querySelector("[data-role='time']");
    const locationInput = section.querySelector("[data-role='location']");
    const notesInput = section.querySelector("[data-role='notes']");

    if (!dateInput || !title || !eventId) {
      return;
    }

    const dateValue = dateInput.value;
    if (!dateValue) {
      removeEvent(eventId);
      return;
    }

    upsertEvent({
      id: eventId,
      title,
      date: dateValue,
      time: timeInput ? timeInput.value : "",
      location: locationInput ? locationInput.value.trim() : "",
      notes: notesInput ? notesInput.value.trim() : "",
    });
  };

  const attachSectionListeners = (section) => {
    const inputs = Array.from(
      section.querySelectorAll(
        "[data-role='date'], [data-role='time'], [data-role='location'], [data-role='notes']"
      )
    );

    inputs.forEach((input) => {
      input.addEventListener("input", () => updateEventFromSection(section));
      input.addEventListener("change", () => updateEventFromSection(section));
    });

    const clearButton = section.querySelector("[data-action='clear-event']");
    const dateInput = section.querySelector("[data-role='date']");
    const timeInput = section.querySelector("[data-role='time']");

    if (clearButton && dateInput) {
      clearButton.addEventListener("click", () => {
        dateInput.value = "";
        if (timeInput) {
          timeInput.value = "";
        }
        updateEventFromSection(section);
      });
    }
  };

  logisticsSections.forEach((section) => {
    attachSectionListeners(section);
  });

  const renderItineraryStop = () => {
    if (!itineraryStopsContainer || !itineraryTemplate) {
      return;
    }
    const clone = itineraryTemplate.content.cloneNode(true);
    const stopElement = clone.querySelector(".itinerary-stop");
    if (!stopElement) {
      return;
    }
    const stopId = `stop-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    stopElement.dataset.stopId = stopId;

    const updateStopEvent = () => {
      const dateInput = stopElement.querySelector("[data-role='stop-date']");
      const cityInput = stopElement.querySelector("[data-role='stop-city']");
      const lodgingInput = stopElement.querySelector("[data-role='stop-lodging']");
      const calendarToggle = stopElement.querySelector("[data-role='stop-calendar']");

      if (!dateInput || !calendarToggle) {
        return;
      }

      const eventId = `itinerary-${stopId}`;
      if (!calendarToggle.checked || !dateInput.value) {
        removeEvent(eventId);
        return;
      }

      const city = cityInput ? cityInput.value.trim() : "";
      const lodging = lodgingInput ? lodgingInput.value.trim() : "";
      const title = city ? `Itinerary stop: ${city}` : "Itinerary stop";
      const locationDetail = lodging || city;

      upsertEvent({
        id: eventId,
        title,
        date: dateInput.value,
        time: "",
        location: locationDetail,
      });
    };

    const inputs = Array.from(
      stopElement.querySelectorAll(
        "[data-role='stop-city'], [data-role='stop-date'], [data-role='stop-lodging'], [data-role='stop-calendar']"
      )
    );

    inputs.forEach((input) => {
      input.addEventListener("input", updateStopEvent);
      input.addEventListener("change", updateStopEvent);
    });

    const removeButton = stopElement.querySelector("[data-action='remove-stop']");
    if (removeButton) {
      removeButton.addEventListener("click", () => {
        removeEvent(`itinerary-${stopId}`);
        stopElement.remove();
      });
    }

    itineraryStopsContainer.appendChild(stopElement);
  };

  if (addItineraryStopButton) {
    addItineraryStopButton.addEventListener("click", renderItineraryStop);
  }

  calendarToggleButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const newView = button.dataset.view;
      if (!newView || newView === calendarState.view) {
        return;
      }
      calendarState.view = newView;
      calendarToggleButtons.forEach((toggle) => {
        toggle.classList.toggle("is-active", toggle.dataset.view === newView);
      });
      renderCalendar();
    });
  });

  calendarNavButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.nav;
      const newDate = new Date(calendarState.focusDate);

      switch (action) {
        case "prev-month":
          newDate.setMonth(newDate.getMonth() - 1);
          break;
        case "next-month":
          newDate.setMonth(newDate.getMonth() + 1);
          break;
        case "prev-week":
          newDate.setDate(newDate.getDate() - 7);
          break;
        case "next-week":
          newDate.setDate(newDate.getDate() + 7);
          break;
        default:
          return;
      }

      calendarState.focusDate = newDate;
      renderCalendar();
    });
  });

  renderCalendar();
}
