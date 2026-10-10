export interface FinanceQuote {
  line: string;
  by: string;
}

/** Money/discipline-themed quotes for the Finance portal's greeting banner — one drawn per page load,
 * same mechanic as the Technical portal's quotes.ts. */
const FINANCE_QUOTES: FinanceQuote[] = [
  { line: 'Beware of little expenses; a small leak will sink a great ship.', by: 'Benjamin Franklin' },
  { line: 'Do not save what is left after spending, but spend what is left after saving.', by: 'Warren Buffett' },
  { line: 'The art is not in making money, but in keeping it.', by: 'Proverb' },
  { line: 'Revenue is vanity, profit is sanity, cash is king.', by: 'Business proverb' },
  { line: 'A budget is telling your money where to go instead of wondering where it went.', by: 'John C. Maxwell' },
  { line: 'In the business world, the rearview mirror is always clearer than the windshield.', by: 'Warren Buffett' },
  { line: 'Every rupee tracked is a decision made with eyes open.', by: 'MIMO Finance' },
  { line: 'Risk comes from not knowing what you are doing.', by: 'Warren Buffett' },
  { line: 'Numbers don’t lie, but they need someone to listen.', by: 'MIMO Finance' },
  { line: 'A small daily discipline in the books prevents a large monthly surprise.', by: 'MIMO Finance' },
  { line: 'Take care of the pennies and the pounds will take care of themselves.', by: 'Proverb' },
  { line: 'Growth paid for by discipline is the only growth that lasts.', by: 'MIMO Finance' },
];

export const pickQuote = (): FinanceQuote => FINANCE_QUOTES[Math.floor(Math.random() * FINANCE_QUOTES.length)];
