const fs = require('fs');

const files = [
  'app/page.tsx',
  'app/login/page.tsx',
  'app/join/page.tsx',
  'app/join/[code]/page.tsx',
  'app/create/page.tsx'
];

const replacement = `
        <div className="w-full max-w-[240px] mx-auto mb-4">
          <img src="/app_icon.png" alt="Split Lah Logo" className="w-full h-auto drop-shadow-md rounded-xl" />
        </div>
`;

for (let file of files) {
  let c = fs.readFileSync(file, 'utf8');
  
  // This regex matches the old logo wrapper and the h1 title following it
  // Example: <div className="..."><span>🧾</span></div><h1>...</h1>
  const regex = /<div className="inline-flex[^>]*>\s*<span className="text-3xl">🧾<\/span>\s*<\/div>\s*<h1[^>]*>\s*[^<]*\s*<\/h1>/g;
  
  c = c.replace(regex, replacement.trim());
  fs.writeFileSync(file, c, 'utf8');
  console.log('Fixed ' + file);
}
