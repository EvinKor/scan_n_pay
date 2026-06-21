import { getAnimalIconIndex } from "@/lib/animals";

const ANIMAL_NAMES = [
  "Bacon", "Dreaming_sloth", "Happy_capybara", "Meh", "Monke", 
  "Redish", "Scared_hamster", "Sleepy_koala", "Sneaky_racoon", "What", 
  "ahhh", "fidgety_rabbit", "har", "judging_cat", "judging_duck", 
  "nutty", "proud_penguin", "shorty", "sly", "smug_llama"
];

export function AnimalAvatar({ name, customIcon, className = "w-6 h-6" }: { name: string, customIcon?: string, className?: string }) {
  if (customIcon && isNaN(Number(customIcon))) {
    return <span className={`flex items-center justify-center text-xl ${className}`}>{customIcon}</span>;
  }
  
  const index = customIcon && !isNaN(Number(customIcon)) ? Number(customIcon) : getAnimalIconIndex(name);
  const animalFileName = ANIMAL_NAMES[index] || "Bacon";
  const row = Math.floor(index / 5);
  const col = index % 5;
  
  return (
    <div className={`inline-flex items-center justify-center flex-shrink-0 overflow-hidden ${className}`}>
      <img 
        src={`/Animals/${animalFileName}.png`} 
        alt={animalFileName}
        className="w-full h-full object-contain drop-shadow-sm"
        onError={(e) => {
           e.currentTarget.style.display = 'none';
           if (e.currentTarget.nextElementSibling) {
             e.currentTarget.nextElementSibling.classList.remove('hidden');
           }
        }}
      />
      <div 
        className="w-full h-full bg-no-repeat bg-center hidden"
        style={{
          backgroundImage: 'url(/animal_picture.png)',
          backgroundSize: '500% 400%',
          backgroundPosition: `${col * 25}% ${row * 33.3333}%`,
          transform: 'scale(1.25)',
        }}
      />
    </div>
  );
}
