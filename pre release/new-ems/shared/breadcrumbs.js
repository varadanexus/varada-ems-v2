export function renderBreadcrumbs(items = []) {
  const safeItems = items.filter(Boolean);
  if (!safeItems.length) return "";
  const html = safeItems.map((x, idx) => {
    const isLast = idx === safeItems.length - 1;
    if (isLast || !x.href) return `<span class="crumb current">${x.label}</span>`;
    return `<a class="crumb" href="${x.href}">${x.label}</a>`;
  }).join("<span class='crumb-sep'>/</span>");
  return `<nav class="breadcrumbs" aria-label="Breadcrumb">${html}</nav>`;
}
