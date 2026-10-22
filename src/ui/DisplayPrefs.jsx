// Theme (Dark / Light / Auto) and Display size (Auto / Laptop / Desktop): small segmented
// pickers used in Settings and the phone's More sheet. Both are saved per device.
import React, { useState } from "react";
import { THEMES, getTheme, applyTheme } from "./theme.js";
import { DISPLAYS, getDisplay, applyDisplay } from "./display.js";

export function Segmented({ label, options, value, onPick }) {
  return (
    <div className="rk-seg" role="radiogroup" aria-label={label}>
      {options.map(([k, l]) => (
        <button key={k} type="button" role="radio" aria-checked={value === k} className={value === k ? "on" : ""} onClick={() => onPick(k)}>{l}</button>
      ))}
    </div>
  );
}

export function ThemePicker() {
  const [theme, setTheme] = useState(getTheme);
  return <Segmented label="Theme" options={THEMES} value={theme} onPick={(t) => setTheme(applyTheme(t))} />;
}

export function DisplayPicker() {
  const [d, setD] = useState(getDisplay);
  return <Segmented label="Display size" options={DISPLAYS} value={d} onPick={(k) => setD(applyDisplay(k))} />;
}
