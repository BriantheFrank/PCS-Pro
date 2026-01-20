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
  let activeLabelItem = null;
  let scannerStream = null;
  let scannerAnimation = null;

  // QR-related helpers ensure each item has a unique ID and QR value.
  const generateItemId = () => {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return `box-${window.crypto.randomUUID()}`;
    }
    return `box-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  };

  const ensureInventoryIdentifiers = () => {
    inventory.rooms.forEach((room) => {
      room.items.forEach((item) => {
        if (!item.id) {
          item.id = generateItemId();
        }
        if (!item.qrValue) {
          item.qrValue = item.id;
        }
      });
    });
  };

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
        if (typeof item.includeInEstimate !== "boolean") {
          item.includeInEstimate = true;
        }
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
    ensureInventoryIdentifiers();
    recalculateWeights();
    // Persist checkbox state so inclusion choices survive page reloads.
    saveInventory(inventory);
  };

  // QR-related helper for rendering QR codes in item lists and labels.
  const renderQrCode = (container, value, size = 64) => {
    if (!container) {
      return;
    }
    container.innerHTML = "";
    if (!window.QRCode) {
      container.textContent = value;
      return;
    }
    // QR code generation (client-side only).
    new QRCode(container, {
      text: value,
      width: size,
      height: size,
      correctLevel: QRCode.CorrectLevel.M,
    });
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
                    <div class="inventory-item-main">
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
                      <div class="inventory-item-footer">
                        <div class="qr-code" data-qr-value="${item.qrValue}" aria-label="QR code for ${item.label}"></div>
                        <div class="inventory-item-actions">
                          <button
                            type="button"
                            class="label-action"
                            data-action="view-label"
                            data-room-index="${roomIndex}"
                            data-item-index="${itemIndex}"
                          >
                            View Label
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

    // QR code rendering happens after rooms render into the DOM.
    document.querySelectorAll(".qr-code[data-qr-value]").forEach((node) => {
      const value = node.dataset.qrValue;
      renderQrCode(node, value, 72);
    });
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
    const newItem = {
      label,
      notes,
      weight: estimateItemWeight(label),
      id: generateItemId(),
      qrValue: null,
    };
    newItem.qrValue = newItem.id;
    inventory.rooms[roomIndex].items.push(newItem);
    syncInventoryState();
    labelInput.value = "";
    notesInput.value = "";
    renderRooms();
  });

  roomsContainer.addEventListener("change", (event) => {
    const target = event.target.closest("input[data-field]");
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
    if (target.dataset.field === "weight") {
      item.weight = coerceWeight(target.value, item.label);
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

  // QR-related label preview & print handling.
  const labelPanel = document.querySelector("#label-panel");
  const labelTitle = document.querySelector("#label-title");
  const labelRoom = document.querySelector("#label-room");
  const labelWeight = document.querySelector("#label-weight");
  const labelNotes = document.querySelector("#label-notes");
  const labelId = document.querySelector("#label-id");
  const labelQr = document.querySelector("#label-qr");
  const printLabelButton = document.querySelector("#print-label-button");
  const closeLabelButton = document.querySelector("#close-label-button");

  const openLabelPanel = (room, item) => {
    if (!labelPanel || !labelTitle || !labelRoom || !labelWeight || !labelId) {
      return;
    }
    activeLabelItem = { room, item };
    labelTitle.textContent = item.label;
    labelRoom.textContent = `Room: ${room.name}`;
    labelWeight.textContent = `Estimated weight: ${item.weight} lbs`;
    labelId.textContent = item.id;
    labelNotes.textContent = item.notes ? `Notes: ${item.notes}` : "";
    labelNotes.style.display = item.notes ? "block" : "none";
    renderQrCode(labelQr, item.qrValue, 160);
    labelPanel.hidden = false;
    labelPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (printLabelButton) {
    printLabelButton.addEventListener("click", () => {
      if (!activeLabelItem) {
        return;
      }
      window.print();
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
      openLabelPanel(room, item);
    }
    if (actionButton.dataset.action === "print-label") {
      openLabelPanel(room, item);
      window.print();
    }
  });

  // QR scanning logic uses jsQR to match scanned values to stored items.
  const scanButton = document.querySelector("#scan-qr-button");
  const scannerModal = document.querySelector("#scanner-modal");
  const scannerVideo = document.querySelector("#scanner-video");
  const scannerCanvas = document.querySelector("#scanner-canvas");
  const scannerStatus = document.querySelector("#scanner-status");
  const scannerResult = document.querySelector("#scanner-result");
  const closeScannerButton = document.querySelector("#close-scanner-button");

  const stopScanner = () => {
    if (scannerAnimation) {
      cancelAnimationFrame(scannerAnimation);
      scannerAnimation = null;
    }
    if (scannerStream) {
      scannerStream.getTracks().forEach((track) => track.stop());
      scannerStream = null;
    }
    if (scannerVideo) {
      scannerVideo.srcObject = null;
    }
  };

  const displayScanResult = (item) => {
    if (!scannerResult) {
      return;
    }
    if (!item) {
      scannerResult.innerHTML = "<p class=\"scanner-error\">Item not found.</p>";
      return;
    }
    scannerResult.innerHTML = `
      <div class="scanner-item">
        <h3>${item.label}</h3>
        <p><strong>Room:</strong> ${item.room}</p>
        <p><strong>Estimated weight:</strong> ${item.weight} lbs</p>
        ${item.notes ? `<p><strong>Notes:</strong> ${item.notes}</p>` : ""}
        <p class="scanner-id">Box ID: ${item.id}</p>
      </div>
    `;
  };

  const findItemById = (qrValue) => {
    for (const room of inventory.rooms) {
      for (const item of room.items) {
        if (item.id === qrValue || item.qrValue === qrValue) {
          return { ...item, room: room.name };
        }
      }
    }
    return null;
  };

  const scanFrame = () => {
    if (!scannerVideo || !scannerCanvas) {
      return;
    }
    const context = scannerCanvas.getContext("2d");
    if (!context || scannerVideo.readyState !== scannerVideo.HAVE_ENOUGH_DATA) {
      scannerAnimation = requestAnimationFrame(scanFrame);
      return;
    }
    scannerCanvas.width = scannerVideo.videoWidth;
    scannerCanvas.height = scannerVideo.videoHeight;
    context.drawImage(scannerVideo, 0, 0, scannerCanvas.width, scannerCanvas.height);
    const imageData = context.getImageData(
      0,
      0,
      scannerCanvas.width,
      scannerCanvas.height
    );
    const code = window.jsQR
      ? window.jsQR(imageData.data, imageData.width, imageData.height)
      : null;
    if (code?.data) {
      const match = findItemById(code.data);
      if (scannerStatus) {
        scannerStatus.textContent = match
          ? "Box found. Details below."
          : "Box scanned, but no match was found.";
      }
      displayScanResult(match);
      stopScanner();
      return;
    }
    scannerAnimation = requestAnimationFrame(scanFrame);
  };

  const startScanner = async () => {
    if (!scannerModal || !scannerVideo) {
      return;
    }
    scannerModal.hidden = false;
    if (scannerStatus) {
      scannerStatus.textContent = "Starting camera...";
    }
    if (scannerResult) {
      scannerResult.textContent = "";
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      if (scannerStatus) {
        scannerStatus.textContent =
          "Camera access is not available in this browser.";
      }
      return;
    }
    try {
      scannerStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      scannerVideo.srcObject = scannerStream;
      await scannerVideo.play();
      if (scannerStatus) {
        scannerStatus.textContent = "Point the camera at a QR label.";
      }
      scanFrame();
    } catch (error) {
      if (scannerStatus) {
        scannerStatus.textContent =
          "Unable to access the camera. Check permissions.";
      }
    }
  };

  if (scanButton) {
    scanButton.addEventListener("click", () => {
      if (!window.jsQR) {
        if (scannerStatus) {
          scannerStatus.textContent =
            "QR scanning library failed to load.";
        }
      }
      startScanner();
    });
  }

  if (closeScannerButton && scannerModal) {
    closeScannerButton.addEventListener("click", () => {
      scannerModal.hidden = true;
      stopScanner();
    });
  }

  if (scannerModal) {
    scannerModal.addEventListener("click", (event) => {
      if (event.target.closest("[data-action='close-scanner']")) {
        scannerModal.hidden = true;
        stopScanner();
      }
    });
  }

  syncInventoryState();
  renderRooms();
}
