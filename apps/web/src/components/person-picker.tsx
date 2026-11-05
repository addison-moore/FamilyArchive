"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";

import { inputClass } from "@/components/form";
import type { PersonChoice } from "@/lib/people";

const DEBOUNCE_MS = 150;
/** The search route ignores any more than this, and a longer URL can trip a reverse proxy. */
const MAX_EXCLUDED_IN_URL = 100;
const PANEL_MIN_WIDTH = 320;
const PANEL_MAX_HEIGHT = 320;
/** With less room than this below the box, the panel opens above it if there's more there. */
const PANEL_FLIP_BELOW = 160;
const PANEL_GAP = 4;
const VIEWPORT_MARGIN = 8;

/** Lifespans stay in the label because two people can share a name. */
function choiceLabel(person: PersonChoice): string {
  return person.lifespan ? `${person.fullName} (${person.lifespan})` : person.fullName;
}

/**
 * Fixed rather than absolute: the media stage is `overflow-hidden`, which would clip
 * the list in the face panel, and a narrow filter column at phone width would
 * otherwise push it off the side of the page.
 */
function panelPlacement(input: DOMRect): CSSProperties {
  const { clientWidth, clientHeight } = document.documentElement;
  const visual = window.visualViewport;
  // An on-screen keyboard shrinks the visual viewport but not the layout one.
  const visibleBottom = visual
    ? Math.min(visual.offsetTop + visual.height, clientHeight)
    : clientHeight;
  const width = Math.min(Math.max(input.width, PANEL_MIN_WIDTH), clientWidth - 2 * VIEWPORT_MARGIN);
  const below = visibleBottom - input.bottom - PANEL_GAP - VIEWPORT_MARGIN;
  const above = input.top - PANEL_GAP - VIEWPORT_MARGIN;
  const flip = below < PANEL_FLIP_BELOW && above > below;
  return {
    left: Math.max(VIEWPORT_MARGIN, Math.min(input.left, clientWidth - width - VIEWPORT_MARGIN)),
    width,
    maxHeight: Math.min(flip ? above : below, PANEL_MAX_HEIGHT),
    ...(flip
      ? { bottom: clientHeight - input.top + PANEL_GAP }
      : { top: input.bottom + PANEL_GAP }),
  };
}

/**
 * Choose someone from an archive of any size by typing part of their name. Only the
 * people asked for are ever sent to the browser.
 *
 * Works in GET and server-action forms alike: the chosen id is submitted under `name`,
 * and the text box has no name of its own. Follows the WAI-ARIA editable combobox with
 * list autocomplete pattern: focus stays in the box and `aria-activedescendant` marks
 * the highlighted option.
 *
 * Nothing is chosen without an explicit pick, because the result links a person to
 * something. Tabbing away chooses nobody, and a name that was typed but never chosen
 * blocks the form rather than being guessed at or dropped, which a hidden input alone
 * can't do.
 */
export function PersonPicker({
  treeId,
  name,
  label,
  ariaLabel,
  placeholder = "Type a name…",
  required = false,
  initial = null,
  excludeIds = [],
  disabled = false,
  autoFocus = false,
  onChange,
  className = "",
}: {
  treeId: string;
  /** Form field that receives the chosen person's id. Omit if only `onChange` is used. */
  name?: string;
  /** Visible label. Pass `ariaLabel` instead when the surroundings already say what this is. */
  label?: string;
  ariaLabel?: string;
  placeholder?: string;
  required?: boolean;
  /** Who is chosen when the page loads. The form's reset event comes back to this. */
  initial?: PersonChoice | null;
  /** People who can't be chosen here, such as the person whose profile this is. */
  excludeIds?: string[];
  disabled?: boolean;
  autoFocus?: boolean;
  /** Called on every change of choice, including back to nobody. */
  onChange?: (person: PersonChoice | null) => void;
  className?: string;
}) {
  const id = useId();
  const listId = `${id}-list`;
  const optionId = (index: number) => `${listId}-${index}`;
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const [selected, setSelected] = useState(initial);
  const [text, setText] = useState(initial ? choiceLabel(initial) : "");
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<PersonChoice[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [activeIndex, setActiveIndex] = useState(-1);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({});

  // Reopening with someone chosen browses from the start; their label isn't a search.
  const query = selected ? "" : text.trim();
  const excludeKey = excludeIds.slice(0, MAX_EXCLUDED_IN_URL).join(",");
  const listVisible = open && options.length > 0;
  const unresolved = !selected && text !== "";

  const openList = () => {
    if (open || disabled) return;
    setStatus("loading");
    setOpen(true);
  };

  const closeList = () => {
    setOpen(false);
    setOptions([]);
    setHasMore(false);
    setStatus("idle");
    setActiveIndex(-1);
  };

  const choose = (person: PersonChoice) => {
    setSelected(person);
    setText(choiceLabel(person));
    closeList();
    onChange?.(person);
  };

  const clear = () => {
    setText("");
    if (selected) {
      setSelected(null);
      onChange?.(null);
    }
    closeList();
  };

  const onType = (value: string) => {
    // Editing a chosen person's label leaves their name to search on, not half a
    // lifespan. A leading space is dropped so that blank text always means nobody.
    const next =
      selected && value.startsWith(`${selected.fullName} (`)
        ? selected.fullName
        : value.trimStart();
    setText(next);
    if (selected) {
      setSelected(null);
      onChange?.(null);
    }
    // The highlight goes straight away, not when results arrive: otherwise typing "Ros",
    // seeing Rosa, then a fast "e" and Enter would choose Rosa.
    if (!open || next.trim() !== query) {
      setActiveIndex(-1);
      setStatus("loading");
    }
    setOpen(true);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // Enter and the arrows belong to the input method while it composes a name.
    if (event.nativeEvent.isComposing) return;
    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp": {
        event.preventDefault();
        if (event.altKey) {
          if (event.key === "ArrowDown") openList();
          else closeList();
        } else if (!open) {
          openList();
        } else if (options.length > 0) {
          const step = event.key === "ArrowDown" ? 1 : -1;
          const from = activeIndex === -1 && step === -1 ? 0 : activeIndex;
          const next = (from + step + options.length) % options.length;
          setActiveIndex(next);
          document.getElementById(optionId(next))?.scrollIntoView({ block: "nearest" });
        }
        break;
      }
      case "Enter": {
        if (!open) break;
        const active = status === "loading" ? undefined : options[activeIndex];
        if (active) {
          event.preventDefault();
          choose(active);
        } else if (status === "loading" || unresolved) {
          // Results are on their way, or there's nothing to choose yet: stay here.
          event.preventDefault();
        } else {
          // Browsing with nothing highlighted: submit as usual.
          closeList();
        }
        break;
      }
      case "Escape": {
        if (open) {
          // Stop here so an enclosing dropdown or full-screen view stays as it is.
          event.preventDefault();
          event.stopPropagation();
          closeList();
        } else if (text) {
          event.preventDefault();
          clear();
        }
        break;
      }
    }
  };

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = setTimeout(
      async () => {
        const params = new URLSearchParams();
        if (query) params.set("q", query);
        for (const excluded of excludeKey ? excludeKey.split(",") : []) {
          params.append("exclude", excluded);
        }
        try {
          const response = await fetch(`/api/trees/${treeId}/people/search?${params}`, {
            signal: controller.signal,
          });
          if (!response.ok) throw new Error(`Person search answered ${response.status}`);
          const body = (await response.json()) as { people: PersonChoice[]; hasMore: boolean };
          if (controller.signal.aborted) return;
          setOptions(body.people);
          setHasMore(body.hasMore);
          // A search highlights its best match so Enter takes it; browsing starts unhighlighted.
          setActiveIndex(query && body.people.length > 0 ? 0 : -1);
          setStatus("idle");
        } catch {
          if (controller.signal.aborted) return;
          setOptions([]);
          setHasMore(false);
          setActiveIndex(-1);
          setStatus("error");
        }
      },
      query ? DEBOUNCE_MS : 0,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, query, excludeKey, treeId]);

  useLayoutEffect(() => {
    if (!open) return;
    const place = (event?: Event) => {
      // Scrolling the list itself doesn't move the box it hangs from.
      if (event?.target instanceof Node && panelRef.current?.contains(event.target)) return;
      if (inputRef.current) setPanelStyle(panelPlacement(inputRef.current.getBoundingClientRect()));
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    window.visualViewport?.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      window.visualViewport?.removeEventListener("resize", place);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    // Touch browsers don't always blur the box on a tap elsewhere.
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && rootRef.current?.contains(event.target)) return;
      closeList();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    inputRef.current?.setCustomValidity(unresolved ? "Choose a person from the list." : "");
  }, [unresolved]);

  // React resets a form after its server action succeeds, which a controlled box won't
  // follow by itself: "+ Tag someone" would keep offering the person just tagged.
  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form) return;
    const onReset = () => {
      setSelected(initial);
      setText(initial ? choiceLabel(initial) : "");
      closeList();
    };
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, [initial]);

  let note: string | null = null;
  if (status === "error") note = "Couldn't load people. Check your connection and try again.";
  else if (status === "loading" && options.length === 0) note = "Searching…";
  else if (status === "idle" && options.length === 0) {
    note = query ? `No one matches “${query}”.` : "No people to choose from.";
  } else if (hasMore) note = `Showing the first ${options.length}. Keep typing to narrow it down.`;

  let announcement = "";
  if (!open) announcement = selected ? `${choiceLabel(selected)} chosen.` : "";
  else if (status === "error" || (status === "idle" && options.length === 0))
    announcement = note ?? "";
  else if (status === "idle") {
    announcement = hasMore
      ? `First ${options.length} people shown. Keep typing to narrow it down.`
      : options.length === 1
        ? "1 person found."
        : `${options.length} people found.`;
  }

  return (
    <div ref={rootRef} className={className}>
      {/* Not inside a wrapping label: every open option would join the box's accessible
          name, and a click on one would count as a click on the box. */}
      {label && (
        <label htmlFor={id} className="mb-1 block text-sm font-medium">
          {label}
        </label>
      )}
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          aria-label={label ? undefined : ariaLabel}
          aria-autocomplete="list"
          aria-expanded={listVisible}
          aria-controls={listVisible ? listId : undefined}
          aria-activedescendant={
            listVisible && activeIndex >= 0 ? optionId(activeIndex) : undefined
          }
          // Always stated: left out, browsers report the native validity, and a screen reader
          // would call the box invalid before anything is typed and at each keystroke after.
          aria-invalid={unresolved && !open}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          autoFocus={autoFocus}
          required={required}
          disabled={disabled}
          placeholder={placeholder}
          value={text}
          // A narrow box can cut the lifespan off, which is what tells namesakes apart.
          title={selected ? text : undefined}
          onChange={(event) => onType(event.target.value)}
          onClick={(event) => {
            // Typing replaces whoever is chosen, without having to delete them first.
            if (selected) event.currentTarget.select();
            openList();
          }}
          onKeyDown={onKeyDown}
          onInvalid={(event) => {
            // A name typed but never chosen: offer its matches rather than a browser bubble
            // saying to choose from a list that isn't showing.
            if (!unresolved) return;
            event.preventDefault();
            event.currentTarget.focus();
            openList();
          }}
          onBlur={closeList}
          className={`${inputClass} truncate pr-8 aria-invalid:border-danger ${
            text ? "" : "input-chevron"
          }`}
        />
        {text && !disabled && (
          <button
            type="button"
            // Reachable by screen reader, but out of the tab order: Escape clears from the box.
            tabIndex={-1}
            aria-label="Clear"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              clear();
              inputRef.current?.focus();
            }}
            className="absolute inset-y-0 right-0 flex w-8 items-center justify-center rounded-r-md text-archive-700 hover:text-archive-900"
          >
            ×
          </button>
        )}
      </div>
      {name && <input type="hidden" name={name} value={selected?.id ?? ""} />}
      <span role="status" className="sr-only">
        {announcement}
      </span>
      {open && (
        <div
          ref={panelRef}
          style={panelStyle}
          // Keeps focus in the box, so a click reaches the option before blur closes the list.
          onMouseDown={(event) => event.preventDefault()}
          // Above any other open panel (z-20), such as "+ Tag someone" over the face panel's
          // list, and below the sticky header (z-30).
          className="fixed z-25 flex flex-col rounded-md border border-archive-100 bg-surface p-1 shadow-lg"
        >
          {options.length > 0 && (
            <ul
              // A new search starts at the top of its results.
              key={query}
              id={listId}
              role="listbox"
              aria-label="People"
              className="min-h-0 flex-1 overflow-y-auto"
            >
              {options.map((person, index) => (
                <li
                  key={person.id}
                  id={optionId(index)}
                  role="option"
                  aria-selected={index === activeIndex}
                  onMouseMove={() => setActiveIndex(index)}
                  onClick={() => choose(person)}
                  // The outline is the keyboard's cursor: a tint alone is too faint to follow,
                  // and forced-colors mode drops backgrounds altogether.
                  className={`cursor-pointer rounded px-3 py-2 text-sm ${
                    index === activeIndex
                      ? "bg-archive-100 outline-2 -outline-offset-2 outline-accent-600"
                      : ""
                  }`}
                >
                  {person.fullName}
                  {person.lifespan && (
                    <span className="text-archive-700"> ({person.lifespan})</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {note && <p className="px-3 py-2 text-xs text-archive-700">{note}</p>}
        </div>
      )}
    </div>
  );
}
