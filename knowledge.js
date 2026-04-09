const fs = require('fs');
const path = require('path');

/**
 * Load per-client knowledge base from knowledge.md
 * Falls back to empty string if file doesn't exist.
 */
function loadKnowledge() {
  const filePath = path.join(__dirname, 'knowledge.md');
  if (!fs.existsSync(filePath)) return '';
  return fs.readFileSync(filePath, 'utf-8').trim();
}

/**
 * Load product/service catalog from catalog.json
 * Returns formatted string for injection into Claude prompt.
 */
function loadCatalog() {
  const filePath = path.join(__dirname, 'catalog.json');
  if (!fs.existsSync(filePath)) return '';

  try {
    const catalog = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    if (!Array.isArray(catalog) || catalog.length === 0) return '';

    const lines = catalog.map((item) => {
      const parts = [`- **${item.name}**`];
      if (item.price)       parts.push(`€${item.price}`);
      if (item.description) parts.push(`— ${item.description}`);
      if (item.available !== undefined) parts.push(item.available ? '(verfügbar)' : '(nicht verfügbar)');
      return parts.join(' ');
    });

    return `## Produkte & Dienstleistungen\n\n${lines.join('\n')}`;
  } catch (err) {
    console.warn('[knowledge] Failed to parse catalog.json:', err.message);
    return '';
  }
}

/**
 * Build the full system prompt context block from knowledge + catalog.
 * Returns empty string if nothing is configured.
 */
function buildContext() {
  const knowledge = loadKnowledge();
  const catalog   = loadCatalog();
  const parts = [knowledge, catalog].filter(Boolean);
  if (!parts.length) return '';
  return `\n\n---\n\n${parts.join('\n\n')}`;
}

module.exports = { loadKnowledge, loadCatalog, buildContext };
