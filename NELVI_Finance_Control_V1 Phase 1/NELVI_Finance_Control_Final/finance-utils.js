/* Shared finance helpers. Monetary calculations use integer paise internally. */
(function (root) {
  "use strict";
  const toPaise = (amount) => {
    const value = Number(amount);
    if (!Number.isFinite(value)) return 0;
    return Math.round(value * 100);
  };
  const fromPaise = (paise) => paise / 100;
  const sumRupees = (items, predicate = () => true) => {
    let totalPaise = 0;
    for (const item of items || []) {
      if (!predicate(item)) continue;
      totalPaise += toPaise(item && item.amount);
    }
    return fromPaise(totalPaise);
  };
  const formatRupees = (amount) => new Intl.NumberFormat("en-IN", {
    style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(Number.isFinite(Number(amount)) ? Number(amount) : 0);
  const percentage = (part, total, digits = 1) => {
    const p = Number(part), t = Number(total);
    if (!Number.isFinite(p) || !Number.isFinite(t) || t <= 0) return 0;
    return Number((p / t * 100).toFixed(digits));
  };
  const topCategoriesWithOther = (entries, limit = 5) => {
    const sorted = (entries || []).map((entry) => ({ category: String(entry.category || "Uncategorized"), paise: toPaise(entry.amount) }))
      .filter((entry) => entry.paise > 0).sort((a, b) => b.paise - a.paise);
    const totalPaise = sorted.reduce((sum, entry) => sum + entry.paise, 0);
    const visible = sorted.slice(0, Math.max(1, Math.floor(limit))).map((entry) => ({ category: entry.category, amount: fromPaise(entry.paise) }));
    const rest = sorted.slice(Math.max(1, Math.floor(limit)));
    const restPaise = rest.reduce((sum, entry) => sum + entry.paise, 0);
    if (restPaise > 0) {
      const count = rest.length;
      visible.push({ category: `Other (${count} ${count === 1 ? "category" : "categories"})`, amount: fromPaise(restPaise) });
    }
    return { items: visible, total: fromPaise(totalPaise), categoryCount: sorted.length };
  };
  const monthKey = (value) => {
    const text = String(value ?? "").trim();
    const iso = text.match(/^(\d{4}-\d{2})/);
    if (iso) return iso[1];
    const date = new Date(text);
    if (Number.isNaN(date.getTime())) return "";
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  };
  const safeSpreadsheetText = (value) => {
    const text = String(value ?? "");
    return /^[\s]*[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  };
  const toCSVCell = (value) => `"${safeSpreadsheetText(value).replace(/"/g, '""')}"`;
  const sortNewest = (items) => (items || []).map((value, index) => {
    const candidate = value.createdAt || value.created_at || value.updatedAt || value.updated_at || value.date || value.txn_date;
    const parsed = new Date(candidate || "").getTime();
    const fallback = new Date(`${String(value.date || value.txn_date || "").slice(0, 10)}T00:00:00`).getTime();
    return { value, index, time: Number.isFinite(parsed) ? parsed : (Number.isFinite(fallback) ? fallback : 0) };
  }).sort((a, b) => b.time - a.time || b.index - a.index).map((x) => x.value);
  const api = Object.freeze({ toPaise, fromPaise, sumRupees, formatRupees, percentage, topCategoriesWithOther, monthKey, safeSpreadsheetText, toCSVCell, sortNewest });
  root.NelviFinance = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
