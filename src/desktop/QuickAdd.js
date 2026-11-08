import React, { useMemo, useState } from "react";

import { useInventory } from "../context/InventoryContext";
import {
  MAX_QUANTITY,
  QUANTITY_UNITS,
  countText,
  getRoomCategories,
  getRoomMeta,
  normalizeName,
} from "../utils/constants";
import { Icon } from "./parts";

// Type a name and press Enter: the fastest way in, and the reason to have a
// keyboard. The rest of the form shows once there's a name to go with it.
export default function QuickAdd({ room, nameRef, onMore }) {
  const { items, addItem } = useInventory();
  const roomMeta = getRoomMeta(room);
  const [name, setName] = useState("");
  const [chosen, setChosen] = useState(null); // the last category picked here
  const [insisted, setInsisted] = useState(false); // picked with this name typed
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState(QUANTITY_UNITS[0]);

  const typed = normalizeName(name);
  const sameName = useMemo(
    () =>
      typed
        ? items.filter((item) => item.room === room && normalizeName(item.name) === typed)
        : [],
    [items, room, typed]
  );
  const count = Math.min(MAX_QUANTITY, Math.max(0, Math.floor(Number(quantity)))) || 0;
  // A name it already knows goes to where that item is, unless told otherwise.
  // The same name can be in two categories, so the picked one comes first.
  const picked = chosen || "Other";
  const target = insisted
    ? picked
    : (sameName.find((item) => item.category === picked) || sameName[0])?.category ||
      picked;
  const match = sameName.find((item) => item.category === target) || null;

  const submit = (event) => {
    event.preventDefault();
    const clean = name.trim();
    if (!clean) {
      return;
    }
    addItem(
      {
        name: clean,
        room,
        category: target,
        quantity: quantity === "" ? 1 : count,
        unit: match ? match.unit : unit,
        openedPercent: null,
        recurring: false,
      },
      { announce: true }
    );
    setName("");
    setInsisted(false);
    setQuantity("1");
    nameRef.current?.focus();
  };

  return (
    <form className="dk-add" onSubmit={submit}>
      <span className="dk-add-mark">
        <Icon name="plus" size={18} />
      </span>
      <input
        ref={nameRef}
        className="dk-add-name"
        aria-label="Item name"
        placeholder={`Add to ${roomMeta.label.toLowerCase()}…`}
        value={name}
        onChange={(event) => setName(event.target.value)}
        autoComplete="off"
        enterKeyHint="done"
      />
      {typed ? (
        <div className="dk-add-more">
          {match ? (
            <span className="dk-add-hint">
              You have {countText(match.quantity, match.unit)}
            </span>
          ) : null}
          <select
            className="dk-field"
            aria-label="Category"
            value={target}
            onChange={(event) => {
              setChosen(event.target.value);
              setInsisted(true);
            }}
          >
            {getRoomCategories(room).map((c) => (
              <option key={c.label} value={c.label}>
                {c.label}
              </option>
            ))}
          </select>
          <input
            className="dk-field dk-qty"
            aria-label="How many"
            type="number"
            min="0"
            inputMode="numeric"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
          />
          <select
            className="dk-field"
            aria-label="Unit"
            value={match ? match.unit : unit}
            disabled={!!match}
            onChange={(event) => setUnit(event.target.value)}
          >
            {[...new Set([...QUANTITY_UNITS, match ? match.unit : unit])].map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
          <button type="submit" className="dk-add-go">
            {match ? "Top up" : "Add"}
          </button>
          <button
            type="button"
            className="dk-add-details"
            title="Add a photo, an expiry date, a note"
            onClick={() => onMore({ room, category: target, name: name.trim() })}
          >
            More…
          </button>
        </div>
      ) : null}
    </form>
  );
}
