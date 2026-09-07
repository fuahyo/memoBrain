function renderMarkdown(source) {
  const text = String(source ?? "").replace(/\r\n/g, "\n");
  if (!text.trim()) {
    return `<p class="muted">Nothing to preview yet.</p>`;
  }

  const fences = [];
  let work = text.replace(/```([^\n`]*)\n([\s\S]*?)```/g, (_, _lang, code) => {
    const token = `@@FENCE${fences.length}@@`;
    fences.push(`<pre><code>${escapeHtml(code.replace(/\n$/, ""))}</code></pre>`);
    return `\n\n${token}\n\n`;
  });

  const blocks = work.split(/\n{2,}/);
  const html = blocks
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return "";

      const fenceMatch = trimmed.match(/^@@FENCE(\d+)@@$/);
      if (fenceMatch) return fences[Number(fenceMatch[1])] ?? "";

      if (/^#{1,3}\s/.test(trimmed)) {
        const match = trimmed.match(/^(#{1,3})\s+(.+)$/);
        if (match) {
          const level = match[1].length;
          return `<h${level}>${inlineMarkdown(match[2])}</h${level}>`;
        }
      }

      if (/^>\s?/m.test(trimmed) && trimmed.split("\n").every((line) => /^>/.test(line) || !line.trim())) {
        const quote = trimmed
          .split("\n")
          .map((line) => line.replace(/^>\s?/, ""))
          .join("\n");
        return `<blockquote>${inlineMarkdown(quote)}</blockquote>`;
      }

      if (/^([-*+]|\d+\.)\s/.test(trimmed)) {
        const lines = trimmed.split("\n");
        const ordered = /^\d+\.\s/.test(lines[0]);
        const tag = ordered ? "ol" : "ul";
        const items = lines
          .filter((line) => line.trim())
          .map((line) => `<li>${inlineMarkdown(line.replace(/^([-*+]|\d+\.)\s+/, ""))}</li>`)
          .join("");
        return `<${tag}>${items}</${tag}>`;
      }

      if (/^\|.+\|$/m.test(trimmed) && trimmed.includes("|")) {
        const rows = trimmed
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line.startsWith("|") && line.endsWith("|"));
        if (rows.length >= 2) {
          const parseRow = (row) =>
            row
              .slice(1, -1)
              .split("|")
              .map((cell) => cell.trim());
          const isSep = (row) => /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(row);
          const header = parseRow(rows[0]);
          const bodyRows = rows.slice(1).filter((row) => !isSep(row)).map(parseRow);
          const thead = `<tr>${header.map((cell) => `<th>${inlineMarkdown(cell)}</th>`).join("")}</tr>`;
          const tbody = bodyRows
            .map((cells) => `<tr>${cells.map((cell) => `<td>${inlineMarkdown(cell)}</td>`).join("")}</tr>`)
            .join("");
          return `<table><thead>${thead}</thead><tbody>${tbody}</tbody></table>`;
        }
      }

      return `<p>${inlineMarkdown(trimmed.replace(/\n/g, "<br>"))}</p>`;
    })
    .filter(Boolean)
    .join("\n");

  return html || `<p class="muted">Nothing to preview yet.</p>`;
}

function inlineMarkdown(value) {
  let text = escapeHtml(value);

  text = text.replace(/\[\[([^\]]+)\]\]/g, (_, target) => {
    const label = String(target).split("|").pop().trim();
    return `<a class="wiki-link" href="#">${label}</a>`;
  });

  text = text.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, (_, label, href) => {
    return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  });

  text = text.replace(/`([^`]+)`/g, (_, code) => `<code>${code}</code>`);
  text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
  text = text.replace(/~~([^~]+)~~/g, "<del>$1</del>");

  return text;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
