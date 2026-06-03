const ADJECTIVES = [
  "Brave", "Chill", "Sneaky", "Hungry", "Speedy", "Grumpy", "Happy",
  "Sleepy", "Fluffy", "Mighty", "Cheeky", "Dizzy", "Jolly", "Lucky",
  "Peppy", "Sassy", "Witty", "Zany", "Bold", "Calm", "Daring",
  "Eager", "Fancy", "Gentle", "Humble", "Icy", "Jazzy", "Keen",
  "Lively", "Mellow", "Noble", "Plucky", "Quirky", "Rowdy", "Spicy",
  "Tiny", "Vivid", "Wacky", "Bouncy", "Cozy", "Dandy", "Funky",
  "Giddy", "Hasty", "Jiffy", "Lanky", "Nippy", "Perky", "Snappy",
  "Zippy",
];

const ANIMALS = [
  "Otter", "Panda", "Capybara", "Raccoon", "Fox", "Penguin", "Koala",
  "Sloth", "Quokka", "Hedgehog", "Hamster", "Bunny", "Duckling",
  "Kitten", "Puppy", "Parrot", "Toucan", "Dolphin", "Seal", "Owl",
  "Gecko", "Chameleon", "Axolotl", "Flamingo", "Alpaca", "Llama",
  "Corgi", "Shiba", "Moose", "Beaver", "Badger", "Ferret", "Meerkat",
  "Pangolin", "Walrus", "Narwhal", "Puffin", "Robin", "Sparrow",
  "Chinchilla", "Lemur", "Tapir", "Ocelot", "Lynx", "Mantis",
  "Starfish", "Jellyfish", "Crab", "Lobster", "Turtle",
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Generate a random animal name like "Brave Otter" or "Chill Panda".
 * Optionally pass existing names to avoid collisions.
 */
export function generateAnimalName(existingNames: string[] = []): string {
  const existing = new Set(existingNames.map((n) => n.toLowerCase()));
  let attempts = 0;

  while (attempts < 100) {
    const name = `${pickRandom(ADJECTIVES)} ${pickRandom(ANIMALS)}`;
    if (!existing.has(name.toLowerCase())) {
      return name;
    }
    attempts++;
  }

  // Fallback with a random suffix if all combos are taken (extremely unlikely)
  const suffix = Math.floor(Math.random() * 999);
  return `${pickRandom(ADJECTIVES)} ${pickRandom(ANIMALS)} ${suffix}`;
}
