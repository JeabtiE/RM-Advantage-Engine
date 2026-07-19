// mockClients.js — 10 Thai clients with realistic SET holdings
// Shape: { clientId, name, riskProfile, aum, holdings: [{ ticker, name, sector, weight }] }
//
// Weights within a client sum to 1.0 so priorityScore (% of portfolio
// affected) computed by matching.js is directly meaningful. Holdings span
// the seven sectors the matching engine keys on: banking, energy,
// technology, property, healthcare, telecom, transport.
//
// `aum` is total portfolio value in THB. It drives the Key Account term in
// priorityScore (see the client-prioritization skill): aum >= 10M earns a flat
// +0.15 boost. Values are spread so the threshold's effect is OBSERVABLE, not
// merely present — three clients clear the bar, and C003 sits deliberately just
// under it so the cliff shows up under test rather than hiding in the demo.

export const mockClients = [
  {
    clientId: "C001",
    name: "คุณสมชาย วงศ์สุวรรณ",
    riskProfile: "conservative",
    aum: 18_500_000, // Key Account
    holdings: [
      { ticker: "KBANK", name: "ธนาคารกสิกรไทย", sector: "banking", weight: 0.35 },
      { ticker: "BBL", name: "ธนาคารกรุงเทพ", sector: "banking", weight: 0.25 },
      { ticker: "ADVANC", name: "แอดวานซ์ อินโฟร์ เซอร์วิส", sector: "telecom", weight: 0.20 },
      { ticker: "BDMS", name: "กรุงเทพดุสิตเวชการ", sector: "healthcare", weight: 0.20 },
    ],
  },
  {
    clientId: "C002",
    name: "คุณวิภาดา ศรีสมบัติ",
    riskProfile: "aggressive",
    aum: 6_200_000,
    holdings: [
      { ticker: "DELTA", name: "เดลต้า อีเลคโทรนิคส์", sector: "technology", weight: 0.40 },
      { ticker: "GULF", name: "กัลฟ์ เอ็นเนอร์จี ดีเวลลอปเมนท์", sector: "energy", weight: 0.30 },
      { ticker: "KCE", name: "เคซีอี อีเลคโทรนิคส์", sector: "technology", weight: 0.30 },
    ],
  },
  {
    clientId: "C003",
    name: "คุณธนพล เจริญรัตน์",
    riskProfile: "moderate",
    // Deliberate near-miss: 800k under the 10M bar. Exercises the cliff the
    // skill doc calls out — same tier in spirit as C006, different in code.
    aum: 9_200_000,
    holdings: [
      { ticker: "PTT", name: "ปตท.", sector: "energy", weight: 0.30 },
      { ticker: "SCB", name: "เอสซีบี เอกซ์", sector: "banking", weight: 0.25 },
      { ticker: "CPN", name: "เซ็นทรัลพัฒนา", sector: "property", weight: 0.25 },
      { ticker: "AOT", name: "ท่าอากาศยานไทย", sector: "transport", weight: 0.20 },
    ],
  },
  {
    clientId: "C004",
    name: "คุณนภัสสร ตันติวงศ์",
    riskProfile: "conservative",
    aum: 3_800_000,
    holdings: [
      { ticker: "BDMS", name: "กรุงเทพดุสิตเวชการ", sector: "healthcare", weight: 0.30 },
      { ticker: "BH", name: "โรงพยาบาลบำรุงราษฎร์", sector: "healthcare", weight: 0.25 },
      { ticker: "KTB", name: "ธนาคารกรุงไทย", sector: "banking", weight: 0.25 },
      { ticker: "INTUCH", name: "อินทัช โฮลดิ้งส์", sector: "telecom", weight: 0.20 },
    ],
  },
  {
    clientId: "C005",
    name: "คุณอานนท์ พิพัฒน์กุล",
    riskProfile: "aggressive",
    aum: 8_500_000,
    holdings: [
      { ticker: "PTTEP", name: "ปตท.สำรวจและผลิตปิโตรเลียม", sector: "energy", weight: 0.35 },
      { ticker: "EA", name: "พลังงานบริสุทธิ์", sector: "energy", weight: 0.25 },
      { ticker: "DELTA", name: "เดลต้า อีเลคโทรนิคส์", sector: "technology", weight: 0.20 },
      { ticker: "AMATA", name: "อมตะ คอร์ปอเรชัน", sector: "property", weight: 0.20 },
    ],
  },
  {
    clientId: "C006",
    name: "คุณปิยะนุช โชติวัฒน์",
    riskProfile: "moderate",
    // Key Account with the LOWEST banking exposure in the book (KBANK 0.20).
    // This is the pair that makes the boost visible: on banking news C006
    // leapfrogs the 0.25 cluster it would otherwise sit below.
    aum: 12_400_000, // Key Account
    holdings: [
      { ticker: "TRUE", name: "ทรู คอร์ปอเรชั่น", sector: "telecom", weight: 0.30 },
      { ticker: "BEM", name: "ทางด่วนและรถไฟฟ้ากรุงเทพ", sector: "transport", weight: 0.25 },
      { ticker: "LH", name: "แลนด์ แอนด์ เฮ้าส์", sector: "property", weight: 0.25 },
      { ticker: "KBANK", name: "ธนาคารกสิกรไทย", sector: "banking", weight: 0.20 },
    ],
  },
  {
    clientId: "C007",
    name: "คุณกิตติศักดิ์ มั่นคง",
    riskProfile: "conservative",
    aum: 45_000_000, // Key Account — largest in the book
    holdings: [
      { ticker: "BBL", name: "ธนาคารกรุงเทพ", sector: "banking", weight: 0.30 },
      { ticker: "PTT", name: "ปตท.", sector: "energy", weight: 0.25 },
      { ticker: "ADVANC", name: "แอดวานซ์ อินโฟร์ เซอร์วิส", sector: "telecom", weight: 0.25 },
      { ticker: "CPN", name: "เซ็นทรัลพัฒนา", sector: "property", weight: 0.20 },
    ],
  },
  {
    clientId: "C008",
    name: "คุณศิริพร ธนะสิริ",
    riskProfile: "moderate",
    aum: 5_600_000,
    holdings: [
      { ticker: "AOT", name: "ท่าอากาศยานไทย", sector: "transport", weight: 0.30 },
      { ticker: "BTS", name: "บีทีเอส กรุ๊ป โฮลดิ้งส์", sector: "transport", weight: 0.20 },
      { ticker: "BCH", name: "บางกอก เชน ฮอสปิทอล", sector: "healthcare", weight: 0.25 },
      { ticker: "SCB", name: "เอสซีบี เอกซ์", sector: "banking", weight: 0.25 },
    ],
  },
  {
    clientId: "C009",
    name: "คุณเมธาวี รุ่งเรือง",
    riskProfile: "aggressive",
    aum: 2_900_000, // smallest in the book
    holdings: [
      { ticker: "GULF", name: "กัลฟ์ เอ็นเนอร์จี ดีเวลลอปเมนท์", sector: "energy", weight: 0.30 },
      { ticker: "HANA", name: "ฮานา ไมโครอิเล็คโทรนิคส", sector: "technology", weight: 0.25 },
      { ticker: "AP", name: "เอพี (ไทยแลนด์)", sector: "property", weight: 0.25 },
      { ticker: "TRUE", name: "ทรู คอร์ปอเรชั่น", sector: "telecom", weight: 0.20 },
    ],
  },
  {
    clientId: "C010",
    name: "คุณชัยวัฒน์ อุดมทรัพย์",
    riskProfile: "moderate",
    aum: 7_300_000,
    holdings: [
      { ticker: "KBANK", name: "ธนาคารกสิกรไทย", sector: "banking", weight: 0.25 },
      { ticker: "BDMS", name: "กรุงเทพดุสิตเวชการ", sector: "healthcare", weight: 0.25 },
      { ticker: "PTT", name: "ปตท.", sector: "energy", weight: 0.25 },
      { ticker: "SPALI", name: "ศุภาลัย", sector: "property", weight: 0.25 },
    ],
  },
];

// Unique sector list across the whole book — used to build the holdings
// summary passed to Agent 1 and to validate matching output.
export function getAllSectors() {
  const sectors = new Set();
  for (const client of mockClients) {
    for (const holding of client.holdings) {
      sectors.add(holding.sector);
    }
  }
  return [...sectors];
}

// Unique ticker list across the whole book.
export function getAllTickers() {
  const tickers = new Set();
  for (const client of mockClients) {
    for (const holding of client.holdings) {
      tickers.add(holding.ticker);
    }
  }
  return [...tickers];
}

export default mockClients;
