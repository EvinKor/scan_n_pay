const fs = require('fs');

let c = fs.readFileSync('app/setting/page.tsx', 'utf8');

// Remove next-themes import
c = c.replace(/import { useTheme } from "next-themes";\r?\n/g, '');

// Remove useTheme hook
c = c.replace(/\s*const { theme, setTheme } = useTheme\(\);\r?\n/g, '\n');

// Remove the Theme toggle UI block
c = c.replace(/\{\s*mounted && \([\s\S]*?\}\s*\)\s*\}/, '');

// Also remove mounted state logic
c = c.replace(/\s*const \[mounted, setMounted\] = useState\(false\);\r?\n/g, '\n');
c = c.replace(/\s*setMounted\(true\);\r?\n/g, '\n');

fs.writeFileSync('app/setting/page.tsx', c, 'utf8');
console.log('Removed theme toggle');
