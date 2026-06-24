const fs = require('fs');
const p = 'app/room/[id]/page.tsx';
let c = fs.readFileSync(p, 'utf8');

const exactReplacements = [
  ['📋 Receipt Items', '<ClipboardList size={16} className="inline-block mr-1" /> Receipt Items'],
  ['➕ Added Later', '<Plus size={16} className="inline-block mr-1" /> Added Later'],
  ['<button onClick={() => setViewMode("settings")} className="w-8 h-8 flex items-center justify-center rounded-full bg-surface/80 backdrop-blur-md border border-divider text-main hover:bg-muted transition-colors">\n            ⚙️\n          </button>', '<button onClick={() => setViewMode("settings")} className="w-8 h-8 flex items-center justify-center rounded-full bg-surface/80 backdrop-blur-md border border-divider text-main hover:bg-muted transition-colors">\n            <Settings size={16} />\n          </button>'],
  ['{linkCopied ? "✅" : "🔗"}', '{linkCopied ? <Check size={16} className="inline-block text-green-500" /> : <Link2 size={16} className="inline-block" />}'],
  ['{session.splitMode === "even" ? "⚖️" : "🎯"}', '{session.splitMode === "even" ? <Scale size={16} /> : <Target size={16} />}'],
  ['<span className="ml-1 text-xs">💳</span>', '<span className="ml-1 text-xs"><CreditCard size={14} /></span>'],
  ['{friendLinkCopied === p.name ? "✅" : "🔗"}', '{friendLinkCopied === p.name ? <Check size={18} className="text-green-500" /> : <Link2 size={18} />}'],
  ['<span className="text-lg">🎯</span>', '<span className="text-lg"><Target size={18} /></span>'],
  ['<span>🧾</span> View Scanned Receipt', '<span className="flex items-center gap-2"><ReceiptText size={16} /> View Scanned Receipt</span>'],
  ['<span className="text-yellow-400 text-xs">⚠ Receipt says</span>', '<span className="text-yellow-400 text-xs flex items-center gap-1"><AlertTriangle size={12} /> Receipt says</span>'],
  ['✓ {p.paymentMethod === "cash" ? "Cash" : p.paymentMethod === "tng" ? "TNG" : p.paymentMethod === "other" ? "Other" : "paid"}', '<Check size={14} className="inline-block mr-1" /> {p.paymentMethod === "cash" ? "Cash" : p.paymentMethod === "tng" ? "TNG" : p.paymentMethod === "other" ? "Other" : "paid"}'],
  ['⚡ Unpaid Add-ons', '<Zap size={14} className="inline-block text-yellow-400 mr-1" /> Unpaid Add-ons'],
  ['📎 Proof', '<Paperclip size={14} className="inline-block mr-1" /> Proof'],
  ['<span className="text-[12px] leading-none mb-0.5">✕</span>', '<X size={12} />'],
  ['<p className="text-brand font-semibold">🎉 Everyone has paid!</p>', '<p className="text-brand font-semibold flex items-center justify-center gap-2"><PartyPopper size={18} /> Everyone has paid!</p>'],
  ['<p className="text-[#015ABF] font-bold text-lg">Receipt Settled 🏁</p>', '<p className="text-[#015ABF] font-bold text-lg flex items-center justify-center gap-2">Receipt Settled <Flag size={18} /></p>'],
  ['<span className="text-brand text-xs font-semibold uppercase tracking-wide">✅ Paid</span>', '<span className="text-brand text-xs font-semibold uppercase tracking-wide flex items-center gap-1"><Check size={14} /> Paid</span>'],
  ['via {myParticipant.paymentMethod === "cash" ? "💵 Cash" : myParticipant.paymentMethod === "tng" ? "💚 TNG" : "💳 Other"}', 'via {myParticipant.paymentMethod === "cash" ? <><Banknote size={14} className="inline-block mr-1" /> Cash</> : myParticipant.paymentMethod === "tng" ? <><Heart size={14} fill="currentColor" className="inline-block text-brand mr-1" /> TNG</> : <><CreditCard size={14} className="inline-block mr-1" /> Other</>}'],
  ['<span className="text-yellow-400 text-xs font-semibold uppercase tracking-wide">⚡ Add-ons (unpaid)</span>', '<span className="text-yellow-400 text-xs font-semibold uppercase tracking-wide flex items-center gap-1"><Zap size={14} /> Add-ons (unpaid)</span>'],
  ['<p className="text-brand font-semibold">✓ You\'re all paid up!</p>', '<p className="text-brand font-semibold flex items-center gap-1"><Check size={16} /> You\'re all paid up!</p>'],
  ['via {myParticipant.paymentMethod === "cash" ? "💵 Cash" : myParticipant.paymentMethod === "tng" ? "💚 Touch \'n Go" : "💳 Other"}', 'via {myParticipant.paymentMethod === "cash" ? <><Banknote size={14} className="inline-block mr-1" /> Cash</> : myParticipant.paymentMethod === "tng" ? <><Heart size={14} fill="currentColor" className="inline-block text-brand mr-1" /> Touch \'n Go</> : <><CreditCard size={14} className="inline-block mr-1" /> Other</>}'],
  ['<span className="text-2xl">💚</span>', '<span className="text-subtle"><Heart size={24} fill="currentColor" className="text-brand" /></span>'],
  ['<span className="text-2xl">💵</span>', '<span className="text-subtle"><Banknote size={24} /></span>'],
  ['<span className="text-2xl">💳</span>', '<span className="text-subtle"><CreditCard size={24} /></span>'],
  ['Paying via {paymentMethod === "tng" ? "💚 Touch \'n Go" : paymentMethod === "cash" ? "💵 Cash" : "💳 Other"}', 'Paying via {paymentMethod === "tng" ? <><Heart size={16} fill="currentColor" className="inline-block text-brand mr-1" /> Touch \'n Go</> : paymentMethod === "cash" ? <><Banknote size={16} className="inline-block mr-1" /> Cash</> : <><CreditCard size={16} className="inline-block mr-1" /> Other</>}'],
  ['<span className="text-lg">📥</span>', '<span className="text-subtle"><Download size={18} /></span>'],
  ['<span className="text-xl">💚</span>', '<span className="text-subtle"><Heart size={20} fill="currentColor" className="text-brand" /></span>'],
  ['📋 Copy Phone Number', '<Copy size={16} className="inline-block mr-1" /> Copy Phone Number'],
  ['<button onClick={() => setShowQR(false)} className="absolute top-4 right-4 text-subtle hover:text-main">✕</button>', '<button onClick={() => setShowQR(false)} className="absolute top-4 right-4 text-subtle hover:text-main"><X size={20} /></button>'],
  ['📷 Attach proof photo', '<Camera size={16} className="inline-block mr-1" /> Attach proof photo'],
  ['✓ Confirm Payment', '<Check size={16} className="inline-block mr-1" /> Confirm Payment'],
  ['<button onClick={() => setShowProofViewer(false)} className="absolute top-4 right-4 text-white hover:text-gray-300 z-10">✕</button>', '<button onClick={() => setShowProofViewer(false)} className="absolute top-4 right-4 text-white hover:text-gray-300 z-10"><X size={24} /></button>'],
  ['<button onClick={() => setShowItemAssignment(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-muted text-subtle hover:text-main transition-colors">✕</button>', '<button onClick={() => setShowItemAssignment(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-muted text-subtle hover:text-main transition-colors"><X size={16} /></button>'],
  ['<button onClick={() => setShowShareQR(false)} className="text-subtle hover:text-main">✕</button>', '<button onClick={() => setShowShareQR(false)} className="text-subtle hover:text-main"><X size={20} /></button>']
];

for (const [search, replace] of exactReplacements) {
  if (c.includes(search)) {
    c = c.replace(search, replace);
  } else {
    console.log("Could not find:", search);
  }
}

const imports = 'import { ArrowLeft, Scale, Target, Check, Link2, CreditCard, Banknote, Heart, AlertTriangle, Zap, Paperclip, PartyPopper, Flag, Download, Camera, ClipboardList, ReceiptText, Settings, Plus, X, Copy } from "lucide-react";';
c = c.replace('import { ArrowLeft } from "lucide-react";', imports);

fs.writeFileSync(p, c);
