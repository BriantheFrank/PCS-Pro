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

// Accordion behavior for checklist sections.
const checklistSections = Array.from(
  document.querySelectorAll(".checklist-section")
);

if (checklistSections.length > 0) {
  checklistSections.forEach((section) => {
    section.addEventListener("toggle", () => {
      if (!section.open) {
        return;
      }
      checklistSections.forEach((otherSection) => {
        if (otherSection !== section) {
          otherSection.removeAttribute("open");
        }
      });
    });
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
  localStorage.setItem(INVENTORY_KEY, JSON.stringify(inventory));
};

// Inventory UI helpers are initialized only when the page includes the module elements.
const inventorySearch = document.querySelector("#inventory-search");
const roomForm = document.querySelector("#room-form");
const roomNameInput = document.querySelector("#room-name");
const roomsContainer = document.querySelector("#rooms-container");
const totalWeightDisplay = document.querySelector("#total-weight");

if (inventorySearch && roomForm && roomNameInput && roomsContainer) {
  let inventory = loadInventory();
  let currentQuery = "";
  let activeLabelItem = null;

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
  };

  const buildCategoryOptions = (selectedCategory) =>
    CATEGORY_DEFINITIONS.map(
      (category) =>
        `<option value="${category.label}" ${
          category.label === selectedCategory ? "selected" : ""
        }>${category.label}</option>`
    ).join("");

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
                return `
                  <li class="inventory-item ${
                    isIncluded ? "" : "inventory-item--excluded"
                  }">
                    <div class="inventory-item-main">
                      <div class="inventory-item-header">
                        <strong>${item.label}</strong>
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
                      </div>
                      ${
                        item.notes
                          ? `<p class="inventory-notes">${item.notes}</p>`
                          : ""
                      }
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

    return `
      <details class="inventory-room" ${filteredQuery ? "open" : ""}>
        <summary>
          <h3>${room.name}</h3>
          <span class="inventory-room-meta">${itemCount} items</span>
        </summary>
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

  // Render all rooms based on current search query and stored state.
  const renderRooms = () => {
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
      return;
    }

    roomsContainer.innerHTML = inventory.rooms
      .map((room, index) => renderRoom(room, index))
      .join("");

    if (totalWeightDisplay) {
      totalWeightDisplay.textContent = `${inventory.totalWeight} lbs`;
    }
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

  roomsContainer.addEventListener("click", (event) => {
    const actionButton = event.target.closest("button[data-action]");
    if (!actionButton) {
      return;
    }
    const roomIndex = Number(actionButton.dataset.roomIndex);
    const itemIndex = Number(actionButton.dataset.itemIndex);
    const room = inventory.rooms[roomIndex];
    const item = room?.items[itemIndex];
    if (!room || !item) {
      return;
    }
    if (actionButton.dataset.action === "view-label") {
      openLabelPanel(roomIndex, itemIndex);
    }
    if (actionButton.dataset.action === "print-label") {
      openLabelPanel(roomIndex, itemIndex);
      setTimeout(() => window.print(), 50);
    }
  });

  syncInventoryState();
  renderRooms();
}
