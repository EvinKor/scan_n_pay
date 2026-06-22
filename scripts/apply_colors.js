const fs = require('fs');
const path = require('path');

const filesToUpdate = [
  'app/page.tsx',
  'app/login/page.tsx',
  'app/history/page.tsx',
  'app/scan/page.tsx',
  'app/room/[id]/page.tsx',
  'app/room/[id]/settings/page.tsx',
  'app/setting/page.tsx',
];

const replacements = [
  { from: /text-white/g, to: 'text-main' },
  { from: /text-zinc-300/g, to: 'text-main' },
  { from: /text-zinc-400/g, to: 'text-muted' },
  { from: /text-zinc-500/g, to: 'text-muted' },
  { from: /text-zinc-600/g, to: 'text-muted' },
  { from: /bg-zinc-900/g, to: 'bg-surface' },
  { from: /bg-zinc-800/g, to: 'bg-muted' },
  { from: /bg-zinc-700/g, to: 'bg-divider' },
  { from: /border-zinc-800/g, to: 'border-divider' },
  { from: /border-zinc-700/g, to: 'border-divider' },
  { from: /bg-\[\#0f0f0f\]/g, to: 'bg-background' },
  { from: /bg-\[\#121214\]/g, to: 'bg-background' },
  { from: /text-black/g, to: 'text-white' }, // Since brand color changed to Sage Green
  { from: /placeholder-zinc-500/g, to: 'placeholder-muted' },
  { from: /placeholder-zinc-600/g, to: 'placeholder-divider' },
  { from: /placeholder-zinc-700/g, to: 'placeholder-divider' },
];

for (const relPath of filesToUpdate) {
  const fullPath = path.join(__dirname, relPath);
  if (!fs.existsSync(fullPath)) continue;
  
  let content = fs.readFileSync(fullPath, 'utf8');
  for (const {from, to} of replacements) {
    content = content.replace(from, to);
  }
  fs.writeFileSync(fullPath, content, 'utf8');
  console.log(`Updated ${relPath}`);
}
