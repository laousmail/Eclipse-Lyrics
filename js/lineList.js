/** In-place line list rendering by line id. */

import { formatMs, lineMainText, lineFr, lineEn, isLyric } from "./sync.js";

/**
 * Update #line-list rows in place (create/update/remove by data-id).
 */
export function renderLineListInPlace(listEl, { lines, selectedIndex, tapIndex, onSelect }) {
  if (!listEl) return;

  const wanted = new Set(lines.map((l) => l.id));
  [...listEl.children].forEach((child) => {
    if (!wanted.has(child.dataset.id)) child.remove();
  });

  lines.forEach((line, i) => {
    let li = [...listEl.querySelectorAll(".line-item")].find((el) => el.dataset.id === line.id);
    const isNew = !li;
    if (isNew) {
      li = document.createElement("li");
      li.className = "line-item";
      li.setAttribute("role", "option");
      li.dataset.id = line.id;
      li.innerHTML = `
        <span class="time"></span>
        <span class="text">
          <p class="text-main"></p>
          <p class="text-tr"></p>
        </span>`;
      li.addEventListener("click", () => onSelect?.(i, true));
    }

    li.dataset.index = String(i);
    li.classList.toggle("untimed", isLyric(line) && line.startMs == null);
    li.classList.toggle("is-section", line.type === "section");
    li.classList.toggle("selected", i === selectedIndex);
    li.classList.toggle("next-tap", i === tapIndex && tapIndex < lines.length);
    if (i === selectedIndex) li.setAttribute("aria-selected", "true");
    else li.removeAttribute("aria-selected");

    const timeEl = li.querySelector(".time");
    const mainEl = li.querySelector(".text-main");
    const trEl = li.querySelector(".text-tr");
    if (line.type === "section") {
      timeEl.textContent = "§";
      mainEl.textContent = line.label || "";
      trEl.textContent = "";
    } else {
      timeEl.textContent = line.startMs != null ? formatMs(line.startMs) : "—:—";
      mainEl.textContent = lineMainText(line);
      const trParts = [lineFr(line), lineEn(line)].filter(Boolean);
      trEl.textContent = trParts.join(" · ");
    }

    // Rebind click with current index
    li.onclick = () => onSelect?.(i, true);

    if (isNew) {
      // Insert at correct position
      const ref = listEl.children[i];
      if (ref) listEl.insertBefore(li, ref);
      else listEl.appendChild(li);
    } else {
      // Ensure order
      const ref = listEl.children[i];
      if (ref !== li) {
        if (ref) listEl.insertBefore(li, ref);
        else listEl.appendChild(li);
      }
    }
  });
}
