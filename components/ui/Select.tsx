"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";

/**
 * Styled replacement for <select>: a button that opens a listbox popover.
 * Follows the WAI-ARIA "select-only combobox" pattern: arrow keys, Home/End,
 * Enter/Space, Escape, Tab and type-to-jump all work, and screen readers hear
 * the active option. The popover is portalled to <body> with position: fixed,
 * so no card (overflow, transforms from reveal animations) can clip or cover
 * it, and it flips above the trigger near the screen edge.
 */

export type SelectOption<Value extends string | number> = {
  value: Value;
  label: string;
  /** Short helper line shown under the label in the list. */
  hint?: string;
};

type SelectProps<Value extends string | number> = {
  value: Value;
  options: SelectOption<Value>[];
  onChange: (value: Value) => void;
  /** Accessible name, since the trigger only shows the current value. */
  label: string;
  /** "inline" sits inside a sentence ("all of these are true"). */
  variant?: "field" | "inline";
};

const POPOVER_GAP = 6;
const POPOVER_MAX_HEIGHT = 344;

export function Select<Value extends string | number>({ value, options, onChange, label, variant = "field" }: SelectProps<Value>) {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState<{
    top: number;
    left: number;
    minWidth: number;
    placement: "below" | "above";
  } | null>(null);
  const typeahead = useRef({ text: "", timer: 0 });

  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const selected = options[selectedIndex];

  const openList = () => {
    setActiveIndex(selectedIndex);
    setOpen(true);
  };

  const close = (focusTrigger = true) => {
    setOpen(false);
    if (focusTrigger) triggerRef.current?.focus();
  };

  const choose = (index: number) => {
    const option = options[index];
    if (option && option.value !== value) onChange(option.value);
    close();
  };

  // Place the popover under the trigger, or above it when there is no room.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const listHeight = Math.min(listRef.current?.scrollHeight ?? POPOVER_MAX_HEIGHT, POPOVER_MAX_HEIGHT);
      const roomBelow = window.innerHeight - rect.bottom;
      const placement = roomBelow < listHeight + POPOVER_GAP + 8 && rect.top > roomBelow ? "above" : "below";
      // Keep an 8px gutter from both screen edges, using the list's real width.
      const listWidth = Math.max(listRef.current?.offsetWidth ?? 0, rect.width);
      setPosition({
        top: placement === "below" ? rect.bottom + POPOVER_GAP : rect.top - POPOVER_GAP - listHeight,
        left: Math.max(8, Math.min(rect.left, window.innerWidth - listWidth - 8)),
        minWidth: rect.width,
        placement,
      });
    };
    place();
    window.addEventListener("resize", place);
    // Capture phase catches scrolling inside any container, not just the page.
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  // Close when clicking anywhere outside the trigger and the list.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !listRef.current?.contains(target)) close(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // Keep the active option visible while moving with the keyboard.
  useEffect(() => {
    if (open) listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  const jumpToTyped = (key: string) => {
    window.clearTimeout(typeahead.current.timer);
    typeahead.current.text += key.toLowerCase();
    typeahead.current.timer = window.setTimeout(() => (typeahead.current.text = ""), 600);
    const match = options.findIndex((option) => option.label.toLowerCase().startsWith(typeahead.current.text));
    if (match >= 0) setActiveIndex(match);
    return match;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const last = options.length - 1;
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
        event.preventDefault();
        openList();
      } else if (event.key.length === 1 && /\S/.test(event.key)) {
        // Like a native select: typing while closed changes the value directly.
        const match = jumpToTyped(event.key);
        if (match >= 0 && options[match].value !== value) onChange(options[match].value);
      }
      return;
    }
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActiveIndex((index) => Math.min(index + 1, last));
        break;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex((index) => Math.max(index - 1, 0));
        break;
      case "Home":
        event.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        event.preventDefault();
        setActiveIndex(last);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        choose(activeIndex);
        break;
      case "Escape":
        event.preventDefault();
        close();
        break;
      case "Tab":
        close(false);
        break;
      default:
        if (event.key.length === 1 && /\S/.test(event.key)) jumpToTyped(event.key);
    }
  };

  const listId = `${id}-list`;
  const optionId = (index: number) => `${id}-option-${index}`;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        className={`select select--${variant}`}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? optionId(activeIndex) : undefined}
        data-open={open || undefined}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onKeyDown}
      >
        <span className="select__value">{selected?.label}</span>
        <i className="ph ph-caret-down select__caret" aria-hidden="true" />
      </button>

      {open &&
        createPortal(
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label={label}
            className="select__list"
            data-placement={position?.placement ?? "below"}
            style={{
              top: position?.top ?? -9999,
              left: position?.left ?? -9999,
              minWidth: position?.minWidth,
              maxHeight: POPOVER_MAX_HEIGHT,
              visibility: position ? "visible" : "hidden",
            }}
          >
            {options.map((option, index) => {
              const isSelected = index === selectedIndex;
              return (
                <li
                  key={String(option.value)}
                  id={optionId(index)}
                  role="option"
                  aria-selected={isSelected}
                  data-index={index}
                  data-active={index === activeIndex || undefined}
                  className="select__option"
                  onPointerMove={() => setActiveIndex(index)}
                  // Keep focus on the trigger so keyboard and screen readers stay in sync.
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(index)}
                >
                  <span className="select__text">
                    <span className="select__label">{option.label}</span>
                    {option.hint && <span className="select__hint">{option.hint}</span>}
                  </span>
                  <i className={`ph ph-check select__check${isSelected ? " is-visible" : ""}`} aria-hidden="true" />
                </li>
              );
            })}
          </ul>,
          document.body,
        )}
    </>
  );
}
