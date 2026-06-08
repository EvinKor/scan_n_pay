const ANIMAL_ICONS = [
  "🦊", "🐼", "🦦", "🦝", "🐧", "🐨", "🦥", "🦔", "🐹", "🐰", "🦆",
  "🐱", "🐶", "🦜", "🐬", "🦭", "🦉", "🦎", "🦩", "🦙", "🦌", "🦫", 
  "🦡", "🦞", "🦀", "🐡", "🐠", "🦄", "🐉", "🦖", "🦕", "🐢", "🐊",
  "🐸", "🐷", "🐮", "🦁", "🐯", "🐻", "🐝", "🦋", "🐌", "🐙", "🦑"
];

export function getAnimalIcon(name: string): string {
  if (!name) return "👤";
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % ANIMAL_ICONS.length;
  return ANIMAL_ICONS[index];
}
