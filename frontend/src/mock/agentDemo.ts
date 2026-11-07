/**
 * What the browser agent "does" in demo mode: the live steps it shows
 * and the result it returns. Prices are illustrative demo values.
 */
import type { AgentResult, AgentStep } from '../types'

export const agentScripts: Record<string, { steps: AgentStep[]; result: AgentResult }> = {
  groceries: {
    steps: [
      { kind: 'search', text: 'Building Alex’s usual basket from their grocery receipts' },
      { kind: 'visit', text: 'Pricing the basket at Tesco', url: 'tesco.com/groceries' },
      { kind: 'visit', text: 'Pricing the basket at Aldi', url: 'aldi.co.uk' },
      { kind: 'visit', text: 'Pricing the basket at Lidl', url: 'lidl.co.uk' },
      { kind: 'search', text: 'Finding stores within 15 min of Marchmont' },
      { kind: 'compare', text: 'Comparing 18 items across 3 shops' },
      { kind: 'done', text: 'Found 2 cheaper options' },
    ],
    result: {
      opportunity_id: 'groceries',
      headline: 'Same weekly basket, £6.10 cheaper at Aldi',
      current: { name: 'Tesco Express (current)', price: 45.2 },
      alternatives: [
        { name: 'Aldi, Nicolson St', price: 39.1, note: '12 min walk · own-brand swaps', url: 'aldi.co.uk' },
        { name: 'Lidl, Cameron Toll', price: 40.2, note: 'Bus 24 · Lidl Plus offers', url: 'lidl.co.uk' },
      ],
      monthly_saving: 24,
    },
  },
  takeaway: {
    steps: [
      { kind: 'search', text: 'Looking at Alex’s 8 takeaway orders this month' },
      { kind: 'search', text: 'Searching budget meal-prep recipes (< £2 per portion)' },
      { kind: 'visit', text: 'Reading recipes', url: 'bbcgoodfood.com' },
      { kind: 'visit', text: 'Checking student deals', url: 'deliveroo.co.uk' },
      { kind: 'compare', text: 'Matching recipes to the dishes Alex orders most' },
      { kind: 'done', text: 'Built a 3-meal swap plan' },
    ],
    result: {
      opportunity_id: 'takeaway',
      headline: 'Swap 4 takeaways a month for ~£1.80 portions',
      current: { name: 'Average takeaway', price: 19.93 },
      alternatives: [
        { name: 'Chicken katsu curry (batch of 4)', price: 7.2, note: 'Replaces your Friday Deliveroo curry' },
        { name: 'Peri-peri chicken wraps (batch of 4)', price: 6.4, note: 'Replaces Nando’s' },
        { name: 'Veggie chilli (batch of 6)', price: 5.9, note: 'Freezes well' },
      ],
      monthly_saving: 70,
    },
  },
  streaming: {
    steps: [
      { kind: 'search', text: 'Found 2 video streaming services on Alex’s statement' },
      { kind: 'visit', text: 'Checking Netflix plans', url: 'netflix.com/gb' },
      { kind: 'visit', text: 'Checking Disney+ plans', url: 'disneyplus.com/en-gb' },
      { kind: 'search', text: 'Looking for student and bundle deals' },
      { kind: 'compare', text: 'Comparing monthly cost of each combination' },
      { kind: 'done', text: 'Found 2 cheaper setups' },
    ],
    result: {
      opportunity_id: 'streaming',
      headline: 'Keep one service and rotate the other',
      current: { name: 'Netflix + Disney+ (current)', price: 20.98 },
      alternatives: [
        { name: 'Netflix only, Disney+ when needed', price: 10.99, note: 'Re-subscribe for a month when a show drops', url: 'disneyplus.com/en-gb' },
        { name: 'Both on the ad plans', price: 10.98, note: 'Netflix with adverts + Disney+ with ads', url: 'netflix.com/gb' },
      ],
      monthly_saving: 10,
    },
  },
}
