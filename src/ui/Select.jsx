import React, { useEffect, useId, useMemo, useRef, useState } from "react";

// Drop-in replacement for a native <select>: same props and <option>/<optgroup> children,
// rendered as a Gridiron-style button with a searchable, grouped popover list.
function collect(children) {
  const items = [];
  React.Children.forEach(children, (c) => {
    if (!c) return;
    if (c.type === "optgroup") {
      React.Children.forEach(c.props.children, (o) => o && items.push({ value: String(o.props.value ?? text(o.props.children)), label: text(o.props.children), group: c.props.label, disabled: o.props.disabled }));
    } else if (c.type === "option") items.push({ value: String(c.props.value ?? text(c.props.children)), label: text(c.props.children), disabled: c.props.disabled });
    else if (Array.isArray(c)) items.push(...collect(c));
  });
  return items;
}
const text = (n) => (n == null ? "" : Array.isArray(n) ? n.map(text).join("") : typeof n === "object" ? text(n.props?.children) : String(n));

export default function Select({ value, onChange, children, disabled, className = "", style, placeholder, "aria-label": ariaLabel, title, id, searchable }) {
  const items = useMemo(() => collect(children), [children]);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(-1);
  const ref = useRef(null), inputRef = useRef(null), listRef = useRef(null);
  const uid = useId();
  const current = items.find((i) => i.value === String(value ?? ""));
  const canSearch = searchable ?? items.length > 8;
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? items.filter((i) => i.label.toLowerCase().includes(needle) || (i.group || "").toLowerCase().includes(needle)) : items;
  }, [items, q]);
  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("touchstart", close);
    setTimeout(() => inputRef.current?.focus(), 0);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("touchstart", close); };
  }, [open]);
  useEffect(() => { if (!open) { setQ(""); setCursor(-1); } }, [open]);
  const pick = (item) => {
    if (item.disabled) return;
    setOpen(false);
    onChange?.({ target: { value: item.value, name: id } });
  };
  const onKey = (e) => {
    if (e.key === "Escape") { setOpen(false); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(shown.length - 1, c + 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(0, c - 1)); }
    if (e.key === "Enter") { e.preventDefault(); if (cursor >= 0 && shown[cursor]) pick(shown[cursor]); else if (!open) setOpen(true); }
  };
  useEffect(() => { listRef.current?.querySelector(".gg-opt.cur")?.scrollIntoView({ block: "nearest" }); }, [cursor]);
  let lastGroup = null;
  return (
    <div ref={ref} className={`gg-select${open ? " open" : ""}${disabled ? " disabled" : ""} ${className}`} style={style}>
      <button type="button" id={id} className="gg-select-btn" disabled={disabled} aria-haspopup="listbox" aria-expanded={open} aria-label={ariaLabel} title={title || current?.label} onClick={() => setOpen(!open)} onKeyDown={onKey}>
        <span className="gg-select-val">{current ? current.label : placeholder || "—"}</span>
        <span className="gg-select-caret">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="gg-select-pop" role="presentation">
          {canSearch && <input ref={inputRef} className="gg-select-search" placeholder="Search…" value={q} onChange={(e) => { setQ(e.target.value); setCursor(0); }} onKeyDown={onKey} aria-label="Search options" />}
          <div className="gg-select-list" role="listbox" id={`${uid}-list`} ref={listRef} aria-label={ariaLabel}>
            {shown.map((item, i) => {
              const head = item.group && item.group !== lastGroup ? <div className="gg-opt-group" key={`g${item.group}${i}`}>{item.group}</div> : null;
              lastGroup = item.group || lastGroup;
              return (
                <React.Fragment key={item.value + i}>
                  {head}
                  <div role="option" aria-selected={item.value === String(value ?? "")} className={`gg-opt${item.value === String(value ?? "") ? " sel" : ""}${i === cursor ? " cur" : ""}${item.disabled ? " off" : ""}`} onMouseEnter={() => setCursor(i)} onClick={() => pick(item)}>
                    <span className="gg-opt-check">{item.value === String(value ?? "") ? "✓" : ""}</span>{item.label}
                  </div>
                </React.Fragment>
              );
            })}
            {!shown.length && <div className="gg-opt off">No matches</div>}
          </div>
        </div>
      )}
    </div>
  );
}
