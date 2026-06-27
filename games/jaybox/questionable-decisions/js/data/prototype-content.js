const playerSeeds = [
  { id: "jay", name: "Jay", score: 300, ready: true, color: "#2ee6d6", streak: 1 },
  { id: "leo", name: "Leo", score: 100, ready: true, color: "#f7c548", streak: 0 },
  { id: "rose", name: "Rosanna", score: 200, ready: false, color: "#e845b5", streak: 0 },
  { id: "mike", name: "Mike", score: 0, ready: true, color: "#ff9f1c", streak: 0 }
];

const themeSeeds = [
  { id: "internet", name: "Internet Brain", desc: "Memes, bad takes, viral lore, and cursed timelines.", votes: 2 },
  { id: "games", name: "Video Games", desc: "Console wars, boss fights, launch disasters, and deep cuts.", votes: 1 },
  { id: "weird", name: "Weird Science", desc: "Space, animals, lab accidents, and facts that sound fake.", votes: 1 },
  { id: "food", name: "Food Court", desc: "Snacks, chain restaurants, kitchen crimes, and flavor debates.", votes: 0 },
  { id: "movies", name: "Movies & TV", desc: "Quotes, actors, finales, and things everyone misremembers.", votes: 0 },
  { id: "nostalgia", name: "2000s Panic", desc: "Old internet, toys, music videos, and mall-era damage.", votes: 0 }
];

const questionSeeds = [
  {
    id: "q1",
    category: "Screen Time",
    points: 200,
    prompt: "Which streaming service released Stranger Things?",
    choices: ["Hulu", "Netflix", "Prime Video", "Peacock"],
    answer: "Netflix"
  },
  {
    id: "q2",
    category: "Bad Ideas",
    points: 300,
    prompt: "What app popularized short looping six-second videos?",
    choices: ["Vine", "Tumblr", "Periscope", "Meerkat"],
    answer: "Vine"
  }
];

const penaltySeeds = [
  { id: "cabinet", name: "Cabinet Says", icon: "CS", desc: "Read the command. Obey only when the cabinet says." },
  { id: "pattern", name: "Pattern Panic", icon: "PP", desc: "Repeat the flashing sequence before your brain leaks out." },
  { id: "bomb", name: "Bomb Diffuser", icon: "BD", desc: "Decode shifting controls before the timer gets dramatic." },
  { id: "stack", name: "Stack Overflow", icon: "SO", desc: "Sort falling junk into the right bins as the stage floods." }
];

const categories = ["Bad Ideas", "Screen Time", "Fake Facts", "Snack Court"];
const reactions = ["Cooked", "Skill Issue", "No Pressure", "Respect", "Folded", "Brain Offline"];

function cloneRecords(records) {
  return records.map((record) => ({ ...record }));
}

function cloneQuestions() {
  return questionSeeds.map((question) => ({
    ...question,
    choices: [...question.choices]
  }));
}

export function createPrototypeContent() {
  return {
    players: cloneRecords(playerSeeds),
    themes: cloneRecords(themeSeeds),
    categories: [...categories],
    questions: cloneQuestions(),
    penalties: cloneRecords(penaltySeeds),
    reactions: [...reactions]
  };
}
