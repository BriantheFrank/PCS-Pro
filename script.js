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

  const normalize = (value) => value.trim().toLowerCase();

  // Estimation model note:
  // Professional moving estimators typically assign average weights to common
  // box sizes (small ~25 lbs, medium ~35-40 lbs, large ~60 lbs, wardrobe ~75 lbs).
  // This mirrors that guidance by mapping label keywords to those box weights
  // and defaulting unknown items to a standard box average (40 lbs).
  const WEIGHT_ESTIMATES = [
    { keywords: ["wardrobe"], weight: 75 },
    { keywords: ["large box", "large"], weight: 60 },
    { keywords: ["medium box", "medium"], weight: 40 },
    { keywords: ["small box", "small"], weight: 25 },
    { keywords: ["book", "books"], weight: 45 },
  ];

  const DEFAULT_ITEM_WEIGHT = 40;

  const estimateItemWeight = (label) => {
    const normalizedLabel = normalize(label);
    const match = WEIGHT_ESTIMATES.find(({ keywords }) =>
      keywords.some((keyword) => normalizedLabel.includes(keyword))
    );
    return match ? match.weight : DEFAULT_ITEM_WEIGHT;
  };

  const coerceWeight = (weight, label) => {
    const numericWeight = Number(weight);
    if (Number.isFinite(numericWeight) && numericWeight > 0) {
      return numericWeight;
    }
    return estimateItemWeight(label);
  };

  const recalculateWeights = () => {
    let totalWeight = 0;
    inventory.rooms.forEach((room) => {
      let roomWeight = 0;
      room.items.forEach((item) => {
        item.weight = coerceWeight(item.weight, item.label);
        roomWeight += item.weight;
      });
      room.roomWeight = Math.round(roomWeight);
      totalWeight += room.roomWeight;
    });
    inventory.totalWeight = Math.round(totalWeight);
  };

  const syncInventoryState = () => {
    recalculateWeights();
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
              .map(
                (item, itemIndex) => `
                  <li class="inventory-item">
                    <div class="inventory-item-header">
                      <strong>${item.label}</strong>
                      <label class="inventory-item-weight">
                        Estimated weight (lbs)
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value="${item.weight}"
                          data-room-index="${roomIndex}"
                          data-item-index="${itemIndex}"
                        />
                      </label>
                    </div>
                    ${
                      item.notes
                        ? `<p class="inventory-notes">${item.notes}</p>`
                        : ""
                    }
                  </li>
                `
              )
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
    const notesInput = form.querySelector("textarea[name='item-notes']");
    const label = labelInput.value.trim();
    const notes = notesInput.value.trim();
    if (!label || Number.isNaN(roomIndex)) {
      return;
    }
    inventory.rooms[roomIndex].items.push({
      label,
      notes,
      weight: estimateItemWeight(label),
    });
    syncInventoryState();
    labelInput.value = "";
    notesInput.value = "";
    renderRooms();
  });

  roomsContainer.addEventListener("change", (event) => {
    const weightInput = event.target.closest("input[data-room-index]");
    if (!weightInput) {
      return;
    }
    const roomIndex = Number(weightInput.dataset.roomIndex);
    const itemIndex = Number(weightInput.dataset.itemIndex);
    if (Number.isNaN(roomIndex) || Number.isNaN(itemIndex)) {
      return;
    }
    const item = inventory.rooms[roomIndex]?.items[itemIndex];
    if (!item) {
      return;
    }
    item.weight = coerceWeight(weightInput.value, item.label);
    syncInventoryState();
    renderRooms();
  });

  // Live search filters rooms, items, and notes as the user types.
  inventorySearch.addEventListener("input", (event) => {
    currentQuery = event.target.value;
    renderRooms();
  });

  syncInventoryState();
  renderRooms();
}
