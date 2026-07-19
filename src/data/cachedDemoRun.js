// cachedDemoRun.js — AUTO-GENERATED. DO NOT EDIT BY HAND.
//
// Frozen output of the full pipeline (Agent 1 + matching/priority + Agent 2 +
// per-client Agent 3 scripts) for each cached demo scenario, keyed by news id.
// This is the EXACT, fixed content the demo shows for these news items, so they
// are deterministic and never call the Claude API at showtime:
//
//   N006: 10 clients, 10 scripts, dislocation=true
//   N003: 3 clients, 3 scripts, dislocation=false
//
// Every other news id still runs the live pipeline. useDraft.js asserts at boot
// that each key below still exists in mockNews — a renamed id fails loudly there
// instead of silently falling back to the live API mid-demo.
//
// Regenerate with:  npm run regen:cache   (see scripts/regenerateDemoCache.mjs)
// Generated:        2026-07-17T09:28:25.099Z
//
// Verified at generation, per scenario: expected dislocation verdict, Agent 2
// is_valid=true, all scripts generated, 0 generic, typo guard applied.

export const cachedDemoRuns = {
  "N006": {
    "newsId": "N006",
    "generatedAt": "2026-07-17T09:28:25.094Z",
    "analysis": {
      "affected_tickers": [
        "DELTA",
        "KCE",
        "HANA",
        "PTT",
        "PTTEP",
        "KBANK",
        "BBL",
        "SCB",
        "KTB",
        "BDMS",
        "BH",
        "BCH",
        "CPN",
        "LH",
        "AP",
        "SPALI",
        "AOT",
        "BEM",
        "BTS"
      ],
      "affected_sectors": [
        "technology",
        "energy",
        "banking",
        "healthcare",
        "property",
        "transport"
      ],
      "sentiment": "negative",
      "dislocation_detected": true,
      "dislocation_description": "ในภาวะ risk-off จากนโยบายภาษีนำเข้า ทฤษฎีชี้ว่าทองคำและพันธบัตรสหรัฐควรปรับตัวขึ้นเนื่องจากนักลงทุนหนีเข้าสินทรัพย์ปลอดภัย แต่ในความเป็นจริง ทองคำกลับร่วงลง 2.3% และพันธบัตรสหรัฐถูกขายออกพร้อมกัน ซึ่งสวนทางกับที่ควรเป็นอย่างชัดเจน สัญญาณนี้บ่งชี้ว่าแรงขายไม่ได้มาจากการปรับพอร์ตเชิงกลยุทธ์ แต่เป็นการขายเพื่อเพิ่มสภาพคล่องฉุกเฉิน (forced liquidation / dash for cash) ซึ่งกดราคาทองคำต่ำกว่าพื้นฐาน ดิสโลเคชันนี้มีความน่าเชื่อถือสูงเนื่องจากสินทรัพย์ปลอดภัยสองประเภทเคลื่อนไหวสวนทางพร้อมกัน (breadth สูง) และขนาดการปรับตัวของทองคำ (-2.3%) มีนัยสำคัญ โอกาสที่เกิดขึ้นคือการสะสมทองคำในช่วงที่ราคาถูกกดโดยแรงขายเชิงเทคนิค ไม่ใช่การเปลี่ยนแปลงปัจจัยพื้นฐาน",
      "reasoning": "การขึ้นภาษีนำเข้าสร้างความกังวลต่อการค้าโลก กดดันกลุ่มส่งออก (DELTA, KCE, HANA) และกลุ่มพลังงานที่อิงราคาน้ำมัน (PTT, PTTEP) ขณะที่กลุ่ม Defensive อย่าง Healthcare (BDMS, BH, BCH) ควรทนทานได้ดีกว่า อย่างไรก็ตาม ดิสโลเคชันหลักอยู่ที่ทองคำและพันธบัตรสหรัฐที่ร่วงพร้อมกันในภาวะ risk-off สะท้อนแรงขายเพื่อสภาพคล่องมากกว่าการเปลี่ยนมุมมองพื้นฐาน"
    },
    "agent2Result": {
      "is_valid": true,
      "flagged_issues": [],
      "adjusted_reasoning": "การขึ้นภาษีนำเข้าสร้างความกังวลต่อการค้าโลก กดดันกลุ่มส่งออก (DELTA, KCE, HANA) และกลุ่มพลังงานที่อิงราคาน้ำมัน (PTT, PTTEP) ขณะที่กลุ่ม Defensive อย่าง Healthcare (BDMS, BH, BCH) ควรทนทานได้ดีกว่า อย่างไรก็ตาม ดิสโลเคชันหลักอยู่ที่ทองคำและพันธบัตรสหรัฐที่ร่วงพร้อมกันในภาวะ risk-off สะท้อนแรงขายเพื่อสภาพคล่องมากกว่าการเปลี่ยนมุมมองพื้นฐาน"
    },
    "affectedClients": [
      {
        "clientId": "C002",
        "name": "คุณวิภาดา ศรีสมบัติ",
        "riskProfile": "aggressive",
        "aum": 6200000,
        "holdings": [
          {
            "ticker": "DELTA",
            "name": "เดลต้า อีเลคโทรนิคส์",
            "sector": "technology",
            "weight": 0.4
          },
          {
            "ticker": "GULF",
            "name": "กัลฟ์ เอ็นเนอร์จี ดีเวลลอปเมนท์",
            "sector": "energy",
            "weight": 0.3
          },
          {
            "ticker": "KCE",
            "name": "เคซีอี อีเลคโทรนิคส์",
            "sector": "technology",
            "weight": 0.3
          }
        ],
        "matchedHoldings": [
          {
            "ticker": "DELTA",
            "name": "เดลต้า อีเลคโทรนิคส์",
            "sector": "technology",
            "weight": 0.4
          },
          {
            "ticker": "GULF",
            "name": "กัลฟ์ เอ็นเนอร์จี ดีเวลลอปเมนท์",
            "sector": "energy",
            "weight": 0.3
          },
          {
            "ticker": "KCE",
            "name": "เคซีอี อีเลคโทรนิคส์",
            "sector": "technology",
            "weight": 0.3
          }
        ],
        "priorityScore": 1
      },
      {
        "clientId": "C003",
        "name": "คุณธนพล เจริญรัตน์",
        "riskProfile": "moderate",
        "aum": 9200000,
        "holdings": [
          {
            "ticker": "PTT",
            "name": "ปตท.",
            "sector": "energy",
            "weight": 0.3
          },
          {
            "ticker": "SCB",
            "name": "เอสซีบี เอกซ์",
            "sector": "banking",
            "weight": 0.25
          },
          {
            "ticker": "CPN",
            "name": "เซ็นทรัลพัฒนา",
            "sector": "property",
            "weight": 0.25
          },
          {
            "ticker": "AOT",
            "name": "ท่าอากาศยานไทย",
            "sector": "transport",
            "weight": 0.2
          }
        ],
        "matchedHoldings": [
          {
            "ticker": "PTT",
            "name": "ปตท.",
            "sector": "energy",
            "weight": 0.3
          },
          {
            "ticker": "SCB",
            "name": "เอสซีบี เอกซ์",
            "sector": "banking",
            "weight": 0.25
          },
          {
            "ticker": "CPN",
            "name": "เซ็นทรัลพัฒนา",
            "sector": "property",
            "weight": 0.25
          },
          {
            "ticker": "AOT",
            "name": "ท่าอากาศยานไทย",
            "sector": "transport",
            "weight": 0.2
          }
        ],
        "priorityScore": 1
      },
      {
        "clientId": "C005",
        "name": "คุณอานนท์ พิพัฒน์กุล",
        "riskProfile": "aggressive",
        "aum": 8500000,
        "holdings": [
          {
            "ticker": "PTTEP",
            "name": "ปตท.สำรวจและผลิตปิโตรเลียม",
            "sector": "energy",
            "weight": 0.35
          },
          {
            "ticker": "EA",
            "name": "พลังงานบริสุทธิ์",
            "sector": "energy",
            "weight": 0.25
          },
          {
            "ticker": "DELTA",
            "name": "เดลต้า อีเลคโทรนิคส์",
            "sector": "technology",
            "weight": 0.2
          },
          {
            "ticker": "AMATA",
            "name": "อมตะ คอร์ปอเรชัน",
            "sector": "property",
            "weight": 0.2
          }
        ],
        "matchedHoldings": [
          {
            "ticker": "PTTEP",
            "name": "ปตท.สำรวจและผลิตปิโตรเลียม",
            "sector": "energy",
            "weight": 0.35
          },
          {
            "ticker": "EA",
            "name": "พลังงานบริสุทธิ์",
            "sector": "energy",
            "weight": 0.25
          },
          {
            "ticker": "DELTA",
            "name": "เดลต้า อีเลคโทรนิคส์",
            "sector": "technology",
            "weight": 0.2
          },
          {
            "ticker": "AMATA",
            "name": "อมตะ คอร์ปอเรชัน",
            "sector": "property",
            "weight": 0.2
          }
        ],
        "priorityScore": 1
      },
      {
        "clientId": "C008",
        "name": "คุณศิริพร ธนะสิริ",
        "riskProfile": "moderate",
        "aum": 5600000,
        "holdings": [
          {
            "ticker": "AOT",
            "name": "ท่าอากาศยานไทย",
            "sector": "transport",
            "weight": 0.3
          },
          {
            "ticker": "BTS",
            "name": "บีทีเอส กรุ๊ป โฮลดิ้งส์",
            "sector": "transport",
            "weight": 0.2
          },
          {
            "ticker": "BCH",
            "name": "บางกอก เชน ฮอสปิทอล",
            "sector": "healthcare",
            "weight": 0.25
          },
          {
            "ticker": "SCB",
            "name": "เอสซีบี เอกซ์",
            "sector": "banking",
            "weight": 0.25
          }
        ],
        "matchedHoldings": [
          {
            "ticker": "AOT",
            "name": "ท่าอากาศยานไทย",
            "sector": "transport",
            "weight": 0.3
          },
          {
            "ticker": "BTS",
            "name": "บีทีเอส กรุ๊ป โฮลดิ้งส์",
            "sector": "transport",
            "weight": 0.2
          },
          {
            "ticker": "BCH",
            "name": "บางกอก เชน ฮอสปิทอล",
            "sector": "healthcare",
            "weight": 0.25
          },
          {
            "ticker": "SCB",
            "name": "เอสซีบี เอกซ์",
            "sector": "banking",
            "weight": 0.25
          }
        ],
        "priorityScore": 1
      },
      {
        "clientId": "C010",
        "name": "คุณชัยวัฒน์ อุดมทรัพย์",
        "riskProfile": "moderate",
        "aum": 7300000,
        "holdings": [
          {
            "ticker": "KBANK",
            "name": "ธนาคารกสิกรไทย",
            "sector": "banking",
            "weight": 0.25
          },
          {
            "ticker": "BDMS",
            "name": "กรุงเทพดุสิตเวชการ",
            "sector": "healthcare",
            "weight": 0.25
          },
          {
            "ticker": "PTT",
            "name": "ปตท.",
            "sector": "energy",
            "weight": 0.25
          },
          {
            "ticker": "SPALI",
            "name": "ศุภาลัย",
            "sector": "property",
            "weight": 0.25
          }
        ],
        "matchedHoldings": [
          {
            "ticker": "KBANK",
            "name": "ธนาคารกสิกรไทย",
            "sector": "banking",
            "weight": 0.25
          },
          {
            "ticker": "BDMS",
            "name": "กรุงเทพดุสิตเวชการ",
            "sector": "healthcare",
            "weight": 0.25
          },
          {
            "ticker": "PTT",
            "name": "ปตท.",
            "sector": "energy",
            "weight": 0.25
          },
          {
            "ticker": "SPALI",
            "name": "ศุภาลัย",
            "sector": "property",
            "weight": 0.25
          }
        ],
        "priorityScore": 1
      },
      {
        "clientId": "C001",
        "name": "คุณสมชาย วงศ์สุวรรณ",
        "riskProfile": "conservative",
        "aum": 18500000,
        "holdings": [
          {
            "ticker": "KBANK",
            "name": "ธนาคารกสิกรไทย",
            "sector": "banking",
            "weight": 0.35
          },
          {
            "ticker": "BBL",
            "name": "ธนาคารกรุงเทพ",
            "sector": "banking",
            "weight": 0.25
          },
          {
            "ticker": "ADVANC",
            "name": "แอดวานซ์ อินโฟร์ เซอร์วิส",
            "sector": "telecom",
            "weight": 0.2
          },
          {
            "ticker": "BDMS",
            "name": "กรุงเทพดุสิตเวชการ",
            "sector": "healthcare",
            "weight": 0.2
          }
        ],
        "matchedHoldings": [
          {
            "ticker": "KBANK",
            "name": "ธนาคารกสิกรไทย",
            "sector": "banking",
            "weight": 0.35
          },
          {
            "ticker": "BBL",
            "name": "ธนาคารกรุงเทพ",
            "sector": "banking",
            "weight": 0.25
          },
          {
            "ticker": "BDMS",
            "name": "กรุงเทพดุสิตเวชการ",
            "sector": "healthcare",
            "weight": 0.2
          }
        ],
        "priorityScore": 0.9500000000000001
      },
      {
        "clientId": "C007",
        "name": "คุณกิตติศักดิ์ มั่นคง",
        "riskProfile": "conservative",
        "aum": 45000000,
        "holdings": [
          {
            "ticker": "BBL",
            "name": "ธนาคารกรุงเทพ",
            "sector": "banking",
            "weight": 0.3
          },
          {
            "ticker": "PTT",
            "name": "ปตท.",
            "sector": "energy",
            "weight": 0.25
          },
          {
            "ticker": "ADVANC",
            "name": "แอดวานซ์ อินโฟร์ เซอร์วิส",
            "sector": "telecom",
            "weight": 0.25
          },
          {
            "ticker": "CPN",
            "name": "เซ็นทรัลพัฒนา",
            "sector": "property",
            "weight": 0.2
          }
        ],
        "matchedHoldings": [
          {
            "ticker": "BBL",
            "name": "ธนาคารกรุงเทพ",
            "sector": "banking",
            "weight": 0.3
          },
          {
            "ticker": "PTT",
            "name": "ปตท.",
            "sector": "energy",
            "weight": 0.25
          },
          {
            "ticker": "CPN",
            "name": "เซ็นทรัลพัฒนา",
            "sector": "property",
            "weight": 0.2
          }
        ],
        "priorityScore": 0.9
      },
      {
        "clientId": "C006",
        "name": "คุณปิยะนุช โชติวัฒน์",
        "riskProfile": "moderate",
        "aum": 12400000,
        "holdings": [
          {
            "ticker": "TRUE",
            "name": "ทรู คอร์ปอเรชั่น",
            "sector": "telecom",
            "weight": 0.3
          },
          {
            "ticker": "BEM",
            "name": "ทางด่วนและรถไฟฟ้ากรุงเทพ",
            "sector": "transport",
            "weight": 0.25
          },
          {
            "ticker": "LH",
            "name": "แลนด์ แอนด์ เฮ้าส์",
            "sector": "property",
            "weight": 0.25
          },
          {
            "ticker": "KBANK",
            "name": "ธนาคารกสิกรไทย",
            "sector": "banking",
            "weight": 0.2
          }
        ],
        "matchedHoldings": [
          {
            "ticker": "BEM",
            "name": "ทางด่วนและรถไฟฟ้ากรุงเทพ",
            "sector": "transport",
            "weight": 0.25
          },
          {
            "ticker": "LH",
            "name": "แลนด์ แอนด์ เฮ้าส์",
            "sector": "property",
            "weight": 0.25
          },
          {
            "ticker": "KBANK",
            "name": "ธนาคารกสิกรไทย",
            "sector": "banking",
            "weight": 0.2
          }
        ],
        "priorityScore": 0.85
      },
      {
        "clientId": "C004",
        "name": "คุณนภัสสร ตันติวงศ์",
        "riskProfile": "conservative",
        "aum": 3800000,
        "holdings": [
          {
            "ticker": "BDMS",
            "name": "กรุงเทพดุสิตเวชการ",
            "sector": "healthcare",
            "weight": 0.3
          },
          {
            "ticker": "BH",
            "name": "โรงพยาบาลบำรุงราษฎร์",
            "sector": "healthcare",
            "weight": 0.25
          },
          {
            "ticker": "KTB",
            "name": "ธนาคารกรุงไทย",
            "sector": "banking",
            "weight": 0.25
          },
          {
            "ticker": "INTUCH",
            "name": "อินทัช โฮลดิ้งส์",
            "sector": "telecom",
            "weight": 0.2
          }
        ],
        "matchedHoldings": [
          {
            "ticker": "BDMS",
            "name": "กรุงเทพดุสิตเวชการ",
            "sector": "healthcare",
            "weight": 0.3
          },
          {
            "ticker": "BH",
            "name": "โรงพยาบาลบำรุงราษฎร์",
            "sector": "healthcare",
            "weight": 0.25
          },
          {
            "ticker": "KTB",
            "name": "ธนาคารกรุงไทย",
            "sector": "banking",
            "weight": 0.25
          }
        ],
        "priorityScore": 0.8
      },
      {
        "clientId": "C009",
        "name": "คุณเมธาวี รุ่งเรือง",
        "riskProfile": "aggressive",
        "aum": 2900000,
        "holdings": [
          {
            "ticker": "GULF",
            "name": "กัลฟ์ เอ็นเนอร์จี ดีเวลลอปเมนท์",
            "sector": "energy",
            "weight": 0.3
          },
          {
            "ticker": "HANA",
            "name": "ฮานา ไมโครอิเล็คโทรนิคส",
            "sector": "technology",
            "weight": 0.25
          },
          {
            "ticker": "AP",
            "name": "เอพี (ไทยแลนด์)",
            "sector": "property",
            "weight": 0.25
          },
          {
            "ticker": "TRUE",
            "name": "ทรู คอร์ปอเรชั่น",
            "sector": "telecom",
            "weight": 0.2
          }
        ],
        "matchedHoldings": [
          {
            "ticker": "GULF",
            "name": "กัลฟ์ เอ็นเนอร์จี ดีเวลลอปเมนท์",
            "sector": "energy",
            "weight": 0.3
          },
          {
            "ticker": "HANA",
            "name": "ฮานา ไมโครอิเล็คโทรนิคส",
            "sector": "technology",
            "weight": 0.25
          },
          {
            "ticker": "AP",
            "name": "เอพี (ไทยแลนด์)",
            "sector": "property",
            "weight": 0.25
          }
        ],
        "priorityScore": 0.8
      }
    ],
    "scripts": [
      {
        "clientId": "C002",
        "name": "คุณวิภาดา ศรีสมบัติ",
        "riskProfile": "aggressive",
        "ok": true,
        "script": "เรียนคุณวิภาดาครับ ข่าวภาษีนำเข้าสหรัฐกระแทกหุ้นส่งออกอย่าง DELTA และ KCE ในพอร์ตของคุณวิภาดาโดยตรง เพราะทั้งสองบริษัทพึ่งพารายได้จากการส่งออกชิ้นส่วนอิเล็กทรอนิกส์ที่ต้องเผชิญกำแพงภาษีสูงขึ้น ขณะที่ GULF ได้รับแรงกดดันจากการเทขายทั้งตลาดในภาวะ risk-off แม้จะไม่ได้ถูกกระทบจากภาษีโดยตรง จุดที่น่าสนใจคือทองคำกลับร่วงลง 2.3% พร้อมพันธบัตรสหรัฐ ทั้งที่ในภาวะ risk-off ควรปรับขึ้น สัญญาณนี้บ่งชี้ว่าเป็นแรงขายเพื่อเพิ่มสภาพคล่องฉุกเฉิน ไม่ใช่การเปลี่ยนปัจจัยพื้นฐาน หากคุณวิภาดาสนใจรายละเอียดเพิ่มเติม โทรคุยกันได้เลยครับ"
      },
      {
        "clientId": "C003",
        "name": "คุณธนพล เจริญรัตน์",
        "riskProfile": "moderate",
        "ok": true,
        "script": "เรียนคุณธนพลครับ ข่าวการขึ้นภาษีนำเข้าของสหรัฐทำให้ตลาดเข้าสู่ภาวะ risk-off และกดดัน PTT ที่คุณธนพลถืออยู่ เนื่องจากราคาน้ำมันโลกอ่อนตัวตามความกังวลเรื่องการค้าและอุปสงค์ที่ชะลอลง ขณะที่หุ้นอื่นในพอร์ตอย่าง SCB, CPN และ AOT ก็ได้รับแรงกดดันจากการเทขายในภาวะ risk-off เช่นกัน แม้จะไม่ได้ถูกกระทบจากภาษีโดยตรง จุดที่น่าสังเกตคือทองคำซึ่งควรเป็นสินทรัพย์ปลอดภัยกลับปรับลง 2.3% พร้อมกับพันธบัตรสหรัฐ สวนทางกับทฤษฎี ซึ่งอาจสะท้อนแรงขายเพื่อเพิ่มสภาพคล่องฉุกเฉินมากกว่าการเปลี่ยนแปลงปัจจัยพื้นฐาน หากคุณธนพลสนใจ เราพูดคุยรายละเอียดเพิ่มเติมกันได้ครับ"
      },
      {
        "clientId": "C005",
        "name": "คุณอานนท์ พิพัฒน์กุล",
        "riskProfile": "aggressive",
        "ok": true,
        "script": "เรียนคุณอานนท์ครับ ข่าวภาษีนำเข้าสหรัฐกระแทกหุ้นส่งออกอย่าง DELTA และกลุ่มพลังงานอย่าง PTTEP ในพอร์ตของคุณอานนท์โดยตรง เพราะ DELTA พึ่งพารายได้จากการค้าระหว่างประเทศและเผชิญกำแพงภาษีสูงขึ้น ขณะที่ PTTEP ได้รับแรงกดดันจากราคาน้ำมันที่ร่วงตามความกังวลเศรษฐกิจโลก แต่จุดที่น่าสนใจกว่าคือทองคำกลับปรับลง 2.3% พร้อมกับพันธบัตรสหรัฐในภาวะ risk-off ทั้งที่ทั้งสองควรเป็นสินทรัพย์ปลอดภัย สัญญาณนี้บ่งชี้ว่าเป็นแรงขายเพื่อเพิ่มสภาพคล่องฉุกเฉิน ไม่ใช่การเปลี่ยนปัจจัยพื้นฐาน ซึ่งอาจเป็นข้อมูลที่คุณอานนท์สนใจ หากอยากลงลึกโทรคุยกันได้เลยครับ"
      },
      {
        "clientId": "C008",
        "name": "คุณศิริพร ธนะสิริ",
        "riskProfile": "moderate",
        "ok": true,
        "script": "เรียนคุณศิริพรครับ ในภาวะ risk-off จากนโยบายภาษีนำเข้าสหรัฐ หุ้น AOT และ BTS ที่คุณศิริพรถืออยู่ได้รับแรงกดดันจากการเทขายทั้งตลาด แม้จะไม่ได้ถูกกระทบจากภาษีโดยตรง ขณะที่ BCH ในพอร์ตซึ่งเป็นกลุ่ม Defensive น่าจะทนทานได้ดีกว่าในภาวะนี้ จุดที่น่าสังเกตคือทองคำกลับปรับลง 2.3% และพันธบัตรสหรัฐถูกขายออกพร้อมกัน ทั้งที่ทั้งสองควรเป็นสินทรัพย์ปลอดภัยในภาวะ risk-off ซึ่งสะท้อนว่าแรงขายน่าจะมาจากการเพิ่มสภาพคล่องฉุกเฉินมากกว่าการเปลี่ยนมุมมองพื้นฐาน หากคุณศิริพรสนใจรายละเอียดเพิ่มเติม เราพูดคุยกันได้เลยครับ"
      },
      {
        "clientId": "C010",
        "name": "คุณชัยวัฒน์ อุดมทรัพย์",
        "riskProfile": "moderate",
        "ok": true,
        "script": "เรียนคุณชัยวัฒน์ครับ ข่าวการขึ้นภาษีนำเข้าของสหรัฐทำให้ตลาดเข้าสู่ภาวะ risk-off และหุ้น PTT ที่คุณชัยวัฒน์ถืออยู่ได้รับแรงกดดันเพิ่มเติมจากราคาน้ำมันที่อ่อนตัวตามความกังวลเรื่องการค้าโลก ขณะที่จุดที่น่าสังเกตคือทองคำกลับปรับลง 2.3% พร้อมกับพันธบัตรสหรัฐ ทั้งที่ทั้งสองควรเป็นสินทรัพย์ปลอดภัยในภาวะแบบนี้ ซึ่งอาจสะท้อนแรงขายเพื่อเพิ่มสภาพคล่องฉุกเฉินมากกว่าการเปลี่ยนแปลงปัจจัยพื้นฐาน หากคุณชัยวัฒน์สนใจ เราพูดคุยรายละเอียดเพิ่มเติมกันได้ครับ"
      },
      {
        "clientId": "C001",
        "name": "คุณสมชาย วงศ์สุวรรณ",
        "riskProfile": "conservative",
        "ok": true,
        "script": "เรียนคุณสมชายครับ อยากเรียนให้ทราบว่าในภาวะ risk-off จากข่าวภาษีนำเข้าของสหรัฐ หุ้น KBANK และ BBL ที่คุณสมชายถืออยู่ได้รับแรงกดดันจากการเทขายทั้งตลาด แม้จะไม่ได้ถูกกระทบจากภาษีโดยตรง ขณะที่ BDMS ในพอร์ตซึ่งอยู่ในกลุ่ม Defensive Healthcare น่าจะทนทานต่อแรงกดดันนี้ได้ดีกว่า สิ่งที่ผิดปกติและอยากเรียนให้ทราบเพิ่มเติมคือทองคำและพันธบัตรสหรัฐซึ่งควรปรับขึ้นในภาวะนี้กลับร่วงลงพร้อมกัน สะท้อนว่าแรงขายน่าจะเป็นการขายเพื่อเพิ่มสภาพคล่องฉุกเฉินมากกว่าการเปลี่ยนแปลงปัจจัยพื้นฐาน ซึ่งยังมีความไม่แน่นอนอยู่ หากคุณสมชายสนใจรับทราบรายละเอียดเพิ่มเติม ผมขอนัดคุยได้ตามความสะดวกเลยครับ"
      },
      {
        "clientId": "C007",
        "name": "คุณกิตติศักดิ์ มั่นคง",
        "riskProfile": "conservative",
        "ok": true,
        "script": "เรียนคุณกิตติศักดิ์ครับ อยากเรียนให้ทราบว่าในภาวะ risk-off จากนโยบายภาษีนำเข้าของสหรัฐ หุ้น PTT ที่คุณกิตติศักดิ์ถืออยู่มีความเคลื่อนไหวที่น่าติดตาม เนื่องจาก PTT เป็นกลุ่มพลังงานที่อิงราคาน้ำมันโลก ซึ่งได้รับแรงกดดันเพิ่มเติมจากความกังวลด้านการค้าโลกที่ชะลอความต้องการพลังงาน สิ่งที่ผิดปกติในครั้งนี้คือทองคำและพันธบัตรสหรัฐซึ่งควรปรับขึ้นในฐานะสินทรัพย์ปลอดภัยกลับร่วงลง 2.3% พร้อมกัน สะท้อนว่าแรงขายน่าจะมาจากการเพิ่มสภาพคล่องฉุกเฉินมากกว่าการเปลี่ยนแปลงปัจจัยพื้นฐาน ซึ่งยังมีความไม่แน่นอนอยู่ หากคุณกิตติศักดิ์สนใจรับทราบข้อมูลเพิ่มเติม ผมขอนัดคุยรายละเอียดได้ครับ"
      },
      {
        "clientId": "C006",
        "name": "คุณปิยะนุช โชติวัฒน์",
        "riskProfile": "moderate",
        "ok": true,
        "script": "เรียนคุณปิยะนุชครับ ในภาวะ risk-off จากนโยบายภาษีนำเข้าสหรัฐ หุ้นอย่าง KBANK ที่คุณปิยะนุชถืออยู่ได้รับแรงกดดันจากการเทขายทั้งตลาด เนื่องจากนักลงทุนลดความเสี่ยงในกลุ่มการเงินที่อ่อนไหวต่อภาวะเศรษฐกิจโลก จุดที่น่าสังเกตคือทองคำซึ่งควรเป็นสินทรัพย์ปลอดภัยกลับปรับลง 2.3% พร้อมกับพันธบัตรสหรัฐ สวนทางกับที่ทฤษฎีควรเป็น ซึ่งอาจสะท้อนแรงขายเพื่อเพิ่มสภาพคล่องฉุกเฉินมากกว่าการเปลี่ยนแปลงปัจจัยพื้นฐาน หากคุณปิยะนุชสนใจ เราพูดคุยรายละเอียดเพิ่มเติมกันได้ครับ"
      },
      {
        "clientId": "C004",
        "name": "คุณนภัสสร ตันติวงศ์",
        "riskProfile": "conservative",
        "ok": true,
        "script": "เรียนคุณนภัสสรครับ อยากเรียนให้ทราบว่าในภาวะ risk-off จากนโยบายภาษีนำเข้าของสหรัฐครั้งนี้ หุ้น BDMS และ BH ที่คุณนภัสสรถืออยู่อยู่ในกลุ่ม Defensive Healthcare ซึ่งโดยทั่วไปทนทานต่อแรงกดดันได้ดีกว่ากลุ่มส่งออก ส่วน KTB ได้รับแรงกดดันจากการเทขายทั้งตลาดในภาวะ risk-off แม้จะไม่ได้ถูกกระทบจากภาษีโดยตรง และจุดที่ผิดปกติคือทองคำซึ่งควรเป็นสินทรัพย์ปลอดภัยกลับปรับลง 2.3% พร้อมกับพันธบัตรสหรัฐ สะท้อนว่าแรงขายน่าจะมาจากการเพิ่มสภาพคล่องฉุกเฉินมากกว่าการเปลี่ยนแปลงปัจจัยพื้นฐาน ซึ่งยังมีความไม่แน่นอนอยู่ หากคุณนภัสสรสนใจ ผมขอเรียนให้ทราบไว้เป็นข้อมูลและนัดคุยรายละเอียดเพิ่มเติมได้ครับ"
      },
      {
        "clientId": "C009",
        "name": "คุณเมธาวี รุ่งเรือง",
        "riskProfile": "aggressive",
        "ok": true,
        "script": "เรียนคุณเมธาวีครับ ข่าวภาษีนำเข้าสหรัฐกระทบ HANA ในพอร์ตของคุณเมธาวีโดยตรง เพราะเป็นหุ้นส่งออกชิ้นส่วนอิเล็กทรอนิกส์ที่พึ่งพารายได้จากการค้าระหว่างประเทศ ขณะที่ GULF ก็เผชิญแรงกดดันจากภาวะ risk-off ที่ลากทั้งตลาดลง แต่จุดที่น่าสนใจกว่าคือทองคำร่วง 2.3% และพันธบัตรสหรัฐถูกขายออกพร้อมกัน ทั้งที่ทั้งสองควรปรับขึ้นในภาวะนี้ สัญญาณนี้บ่งชี้ว่าเป็น forced liquidation มากกว่าการเปลี่ยนพื้นฐาน ซึ่งอาจสะท้อนโอกาสที่น่าติดตาม หากคุณเมธาวีสนใจลงลึก โทรคุยกันได้เลยครับ"
      }
    ]
  },
  "N003": {
    "newsId": "N003",
    "generatedAt": "2026-07-17T09:27:46.572Z",
    "analysis": {
      "affected_tickers": [
        "DELTA",
        "KCE",
        "HANA"
      ],
      "affected_sectors": [
        "technology"
      ],
      "sentiment": "positive",
      "dislocation_detected": false,
      "dislocation_description": "",
      "reasoning": "ยอดส่งออกชิ้นส่วนอิเล็กทรอนิกส์ที่โต 18% YoY หนุนโดยดีมานด์ AI และ Data Center ส่งผลบวกโดยตรงต่อผู้ผลิตชิ้นส่วนอย่าง DELTA, KCE และ HANA ซึ่งมีคำสั่งซื้อล่วงหน้าเต็มกำลังการผลิต ราคาหุ้นที่ปรับขึ้น 3.5% สอดคล้องกับทิศทางที่ทฤษฎีคาดไว้ ไม่มี Dislocation เกิดขึ้น"
    },
    "agent2Result": {
      "is_valid": true,
      "flagged_issues": [],
      "adjusted_reasoning": "ยอดส่งออกชิ้นส่วนอิเล็กทรอนิกส์ที่โต 18% YoY หนุนโดยดีมานด์ AI และ Data Center ส่งผลบวกโดยตรงต่อผู้ผลิตชิ้นส่วนอย่าง DELTA, KCE และ HANA ซึ่งมีคำสั่งซื้อล่วงหน้าเต็มกำลังการผลิต ราคาหุ้นที่ปรับขึ้น 3.5% สอดคล้องกับทิศทางที่ทฤษฎีคาดไว้ ไม่มี Dislocation เกิดขึ้น"
    },
    "affectedClients": [
      {
        "clientId": "C002",
        "name": "คุณวิภาดา ศรีสมบัติ",
        "riskProfile": "aggressive",
        "aum": 6200000,
        "holdings": [
          {
            "ticker": "DELTA",
            "name": "เดลต้า อีเลคโทรนิคส์",
            "sector": "technology",
            "weight": 0.4
          },
          {
            "ticker": "GULF",
            "name": "กัลฟ์ เอ็นเนอร์จี ดีเวลลอปเมนท์",
            "sector": "energy",
            "weight": 0.3
          },
          {
            "ticker": "KCE",
            "name": "เคซีอี อีเลคโทรนิคส์",
            "sector": "technology",
            "weight": 0.3
          }
        ],
        "matchedHoldings": [
          {
            "ticker": "DELTA",
            "name": "เดลต้า อีเลคโทรนิคส์",
            "sector": "technology",
            "weight": 0.4
          },
          {
            "ticker": "KCE",
            "name": "เคซีอี อีเลคโทรนิคส์",
            "sector": "technology",
            "weight": 0.3
          }
        ],
        "priorityScore": 0.7
      },
      {
        "clientId": "C009",
        "name": "คุณเมธาวี รุ่งเรือง",
        "riskProfile": "aggressive",
        "aum": 2900000,
        "holdings": [
          {
            "ticker": "GULF",
            "name": "กัลฟ์ เอ็นเนอร์จี ดีเวลลอปเมนท์",
            "sector": "energy",
            "weight": 0.3
          },
          {
            "ticker": "HANA",
            "name": "ฮานา ไมโครอิเล็คโทรนิคส",
            "sector": "technology",
            "weight": 0.25
          },
          {
            "ticker": "AP",
            "name": "เอพี (ไทยแลนด์)",
            "sector": "property",
            "weight": 0.25
          },
          {
            "ticker": "TRUE",
            "name": "ทรู คอร์ปอเรชั่น",
            "sector": "telecom",
            "weight": 0.2
          }
        ],
        "matchedHoldings": [
          {
            "ticker": "HANA",
            "name": "ฮานา ไมโครอิเล็คโทรนิคส",
            "sector": "technology",
            "weight": 0.25
          }
        ],
        "priorityScore": 0.25
      },
      {
        "clientId": "C005",
        "name": "คุณอานนท์ พิพัฒน์กุล",
        "riskProfile": "aggressive",
        "aum": 8500000,
        "holdings": [
          {
            "ticker": "PTTEP",
            "name": "ปตท.สำรวจและผลิตปิโตรเลียม",
            "sector": "energy",
            "weight": 0.35
          },
          {
            "ticker": "EA",
            "name": "พลังงานบริสุทธิ์",
            "sector": "energy",
            "weight": 0.25
          },
          {
            "ticker": "DELTA",
            "name": "เดลต้า อีเลคโทรนิคส์",
            "sector": "technology",
            "weight": 0.2
          },
          {
            "ticker": "AMATA",
            "name": "อมตะ คอร์ปอเรชัน",
            "sector": "property",
            "weight": 0.2
          }
        ],
        "matchedHoldings": [
          {
            "ticker": "DELTA",
            "name": "เดลต้า อีเลคโทรนิคส์",
            "sector": "technology",
            "weight": 0.2
          }
        ],
        "priorityScore": 0.2
      }
    ],
    "scripts": [
      {
        "clientId": "C002",
        "name": "คุณวิภาดา ศรีสมบัติ",
        "riskProfile": "aggressive",
        "ok": true,
        "script": "เรียนคุณวิภาดาครับ ยอดส่งออกชิ้นส่วนอิเล็กทรอนิกส์ไทยโต 18% YoY หนุนโดยดีมานด์ AI และ Data Center ส่งผลบวกโดยตรงต่อ DELTA และ KCE ในพอร์ตของคุณวิภาดา เพราะทั้งสองบริษัทมีคำสั่งซื้อล่วงหน้าเต็มกำลังการผลิตและพึ่งพารายได้จากกลุ่มลูกค้าที่ขับเคลื่อนด้วยดีมานด์นี้โดยตรง ราคาหุ้นปรับขึ้นแล้ว 3.5% สอดคล้องกับทิศทางพื้นฐาน หากคุณวิภาดาอยากลงลึกรายละเอียดเพิ่มเติม โทรคุยกันได้เลยครับ"
      },
      {
        "clientId": "C009",
        "name": "คุณเมธาวี รุ่งเรือง",
        "riskProfile": "aggressive",
        "ok": true,
        "script": "เรียนคุณเมธาวีครับ ยอดส่งออกชิ้นส่วนอิเล็กทรอนิกส์ไทยเติบโต 18% YoY หนุนโดยดีมานด์ AI และ Data Center โดยตรง ซึ่งส่งผลบวกต่อ HANA ในพอร์ตของคุณเมธาวีเพราะบริษัทมีคำสั่งซื้อล่วงหน้าเต็มกำลังการผลิตจากกลุ่มลูกค้าในอุตสาหกรรมนี้ ราคาหุ้นปรับขึ้นแล้ว 3.5% สอดคล้องกับทิศทางพื้นฐาน และหากคุณเมธาวีอยากลงลึกรายละเอียดเพิ่มเติม โทรคุยกันได้เลยครับ"
      },
      {
        "clientId": "C005",
        "name": "คุณอานนท์ พิพัฒน์กุล",
        "riskProfile": "aggressive",
        "ok": true,
        "script": "เรียนคุณอานนท์ครับ ยอดส่งออกชิ้นส่วนอิเล็กทรอนิกส์ไทยเติบโต 18% YoY หนุนโดยดีมานด์ AI และ Data Center โดยตรง และ DELTA ที่คุณอานนท์ถืออยู่เป็นหนึ่งในผู้ผลิตที่มีคำสั่งซื้อล่วงหน้าเต็มกำลังการผลิต ซึ่งสอดคล้องกับราคาหุ้นที่ปรับขึ้น 3.5% ในช่วงที่ผ่านมา หากคุณอานนท์สนใจลงลึกในรายละเอียด โทรคุยกันได้เลยครับ"
      }
    ]
  }
};

export default cachedDemoRuns;
