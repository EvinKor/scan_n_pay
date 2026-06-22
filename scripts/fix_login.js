const fs = require('fs');

let c = fs.readFileSync('app/login/page.tsx', 'utf8');
c = c.replace(/bg-white text-black/g, 'bg-surface border border-divider text-main');
c = c.replace(/bg-white text-white/g, 'bg-surface border border-divider text-main');
c = c.replace(/hover:bg-gray-100/g, 'hover:bg-muted');
c = c.replace(/text-white/g, 'text-main');
c = c.replace(/text-zinc-[0-9]+/g, 'text-subtle');
c = c.replace(/border-zinc-[0-9]+/g, 'border-divider');
c = c.replace(/bg-zinc-900/g, 'bg-surface');
c = c.replace(/shadow-\[[^\]]+\]/g, 'shadow-md shadow-brand/20');

const logoRegex = /<div className="inline-flex[^>]*>\s*<span className="text-3xl">🧾<\/span>\s*<\/div>\s*<h1[^>]*>\s*[^<]*\s*<\/h1>/g;
const logoRep = `
        <div className="w-full max-w-[240px] mx-auto mb-4">
          <img src="/app_icon.png" alt="Split Lah Logo" className="w-full h-auto drop-shadow-md rounded-xl" />
        </div>
`;
c = c.replace(logoRegex, logoRep.trim());

// And change the button to text-white for the brand button
c = c.replace(/bg-brand text-main/g, 'bg-brand text-white');

fs.writeFileSync('app/login/page.tsx', c, 'utf8');
console.log('Fixed login page');
