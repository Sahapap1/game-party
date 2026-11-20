const SUITS = [
  { key: 'spades', symbol: '♠', color: 'black', label: 'โพดำ' },
  { key: 'hearts', symbol: '♥', color: 'red', label: 'โพแดง' },
  { key: 'diamonds', symbol: '♦', color: 'red', label: 'ข้าวหลามตัด' },
  { key: 'clubs', symbol: '♣', color: 'black', label: 'ดอกจิก' },
]

const RANKS = [
  { label: 'A', value: 1 }, { label: '2', value: 2 }, { label: '3', value: 3 },
  { label: '4', value: 4 }, { label: '5', value: 5 }, { label: '6', value: 6 },
  { label: '7', value: 7 }, { label: '8', value: 8 }, { label: '9', value: 9 },
  { label: '10', value: 10 }, { label: 'J', value: 11 }, { label: 'Q', value: 12 },
  { label: 'K', value: 13 },
]

export function createDeck() {
  return SUITS.flatMap((suit) => RANKS.map((rank) => ({
    id: `${suit.key}-${rank.label}`,
    suit: suit.key,
    symbol: suit.symbol,
    color: suit.color,
    suitLabel: suit.label,
    rank: rank.label,
    value: rank.value,
  })))
}

export function shuffle(items) {
  const cards = [...items]
  for (let index = cards.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[cards[index], cards[swapIndex]] = [cards[swapIndex], cards[index]]
  }
  return cards
}
