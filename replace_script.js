const fs = require('fs');
const p = 'app/room/[id]/page.tsx';
let c = fs.readFileSync(p, 'utf8');

const reps = [
  ['"⚖️"', '<Scale size={16} className="inline-block" />'],
  ['"🎯"', '<Target size={16} className="inline-block" />'],
  ['⚖️', '<Scale size={16} className="inline-block mr-1" />'],
  ['🎯', '<Target size={16} className="inline-block mr-1" />'],
  ['"✅"', '<Check size={16} className="inline-block text-green-500" />'],
  ['"🔗"', '<Link2 size={16} className="inline-block" />'],
  ['✅', '<Check size={16} className="inline-block text-green-500 mr-1" />'],
  ['💳', '<CreditCard size={16} className="inline-block mr-1" />'],
  ['💵', '<Banknote size={16} className="inline-block mr-1" />'],
  ['💚', '<Heart size={16} fill="currentColor" className="inline-block text-brand mr-1" />'],
  ['⚠', '<AlertTriangle size={14} className="inline-block mr-1 text-yellow-400" />'],
  ['⚡', '<Zap size={14} className="inline-block text-yellow-400 mr-1" />'],
  ['📎', '<Paperclip size={14} className="inline-block mr-1" />'],
  ['🎉', '<PartyPopper size={18} className="inline-block text-brand mr-1" />'],
  ['🏁', '<Flag size={18} className="inline-block text-brand ml-1" />'],
  ['📥', '<Download size={18} className="inline-block mr-1" />'],
  ['📷', '<Camera size={16} className="inline-block mr-1" />'],
  ['📋', '<ClipboardList size={16} className="inline-block mr-1" />'],
  ['🧾', '<ReceiptText size={16} className="inline-block mr-1" />'],
  ['⚙️', '<Settings size={16} className="inline-block mr-1" />']
];

reps.forEach(([find, replace]) => {
  c = c.split(find).join(replace);
});

// Update imports
if (!c.includes('Scale')) {
  c = c.replace(
    'import { ArrowLeft } from "lucide-react";',
    'import { ArrowLeft, Scale, Target, Check, Link2, CreditCard, Banknote, Heart, AlertTriangle, Zap, Paperclip, PartyPopper, Flag, Download, Camera, ClipboardList, ReceiptText, Settings } from "lucide-react";'
  );
}

fs.writeFileSync(p, c);
console.log('done room page');

// Settings page
const s = 'app/room/[id]/settings/page.tsx';
let sc = fs.readFileSync(s, 'utf8');
sc = sc.split('⚖️').join('<Scale size={16} className="inline-block mr-1" />');
sc = sc.split('🎯').join('<Target size={16} className="inline-block mr-1" />');
sc = sc.replace(
  'import { ArrowLeft } from "lucide-react";',
  'import { ArrowLeft, Scale, Target } from "lucide-react";'
);
fs.writeFileSync(s, sc);
console.log('done settings page');
