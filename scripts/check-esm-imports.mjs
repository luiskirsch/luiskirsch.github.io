import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "js");

async function listJsFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map(entry => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? listJsFiles(full) : (entry.isFile() && entry.name.endsWith(".js") ? [full] : []);
  }));
  return nested.flat();
}

function exportedNames(source) {
  const names = new Set();
  for (const match of source.matchAll(/\bexport\s+(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/g)) {
    names.add(match[1]);
  }
  for (const match of source.matchAll(/\bexport\s*\{([^}]+)\}/g)) {
    const list = match[1].replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const specifier of list.split(",")) {
      const parts = specifier.trim().split(/\s+as\s+/);
      if (parts[0]) names.add((parts[1] || parts[0]).trim());
    }
  }
  return names;
}

const files = await listJsFiles(root);
const sourceByFile = new Map(await Promise.all(files.map(async file => [file, await readFile(file, "utf8")])));
const exportsByFile = new Map([...sourceByFile].map(([file, source]) => [file, exportedNames(source)]));
const errors = [];

for (const [importer, source] of sourceByFile) {
  const pattern = /\bimport\s*\{([^}]+)\}\s*from\s*["'](\.{1,2}\/[^"']+)["']/g;
  for (const match of source.matchAll(pattern)) {
    const resolved = path.resolve(path.dirname(importer), match[2]);
    const target = path.extname(resolved) ? resolved : `${resolved}.js`;
    const exported = exportsByFile.get(target);
    if (!exported) {
      errors.push(`${path.relative(root, importer)} importa arquivo inexistente: ${match[2]}`);
      continue;
    }
    for (const raw of match[1].split(",")) {
      const imported = raw.trim().split(/\s+as\s+/)[0];
      if (imported && !exported.has(imported)) {
        errors.push(`${path.relative(root, importer)} importa ${imported}, ausente em ${path.relative(root, target)}`);
      }
    }
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`ESM imports OK (${files.length} arquivos verificados).`);
}
