// A new one is picked at random on every mount — which, in practice, means every page refresh.
// Kept short, specific to building/fixing/shipping things rather than generic "hustle" platitudes.
export const TECH_QUOTES: { line: string; by: string }[] = [
  { line: 'Simplicity is prerequisite for reliability.', by: 'Edsger Dijkstra' },
  { line: 'Make it work, make it right, make it fast.', by: 'Kent Beck' },
  { line: 'The best code is no code at all.', by: 'Jeff Atwood' },
  { line: 'Measure twice, cut once.', by: 'Old proverb' },
  { line: 'A good plan violently executed now is better than a perfect plan next week.', by: 'George S. Patton' },
  { line: 'Quality is not an act, it is a habit.', by: 'Aristotle' },
  { line: 'The only way to go fast is to go well.', by: 'Robert C. Martin' },
  { line: 'First, solve the problem. Then, write the code.', by: 'John Johnson' },
  { line: 'Every great machine was once a pile of parts someone put together correctly.', by: 'Unknown' },
  { line: 'Small, steady fixes beat heroic rewrites.', by: 'Unknown' },
  { line: 'A bug found today is a kiosk that works tomorrow.', by: 'Unknown' },
  { line: 'Done is better than perfect, but broken is worse than late.', by: 'Unknown' },
  { line: 'The best time to fix it was before it shipped. The next best time is now.', by: 'Unknown' },
  { line: 'Good engineers write code. Great ones remove it.', by: 'Unknown' },
  { line: 'Trust, but verify.', by: 'Russian proverb' },
];

export const pickQuote = () => TECH_QUOTES[Math.floor(Math.random() * TECH_QUOTES.length)];
