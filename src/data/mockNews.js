// mockNews.js — 5-6 pre-tested news items (demo never depends on live APIs)
// Each item embeds a marketOutcome field to enable dislocation detection:
// Agent 1 compares what theory says SHOULD happen vs. what the market DID.
// N006 is the Trump Tariff / Gold dislocation case — the demo money shot.
// N007 is the September 2026 Fed rate hike (real market data; see its comment).

export const mockNews = [
  {
    id: "N001",
    headline: "กนง. คงอัตราดอกเบี้ยนโยบายที่ 2.25% สวนทางตลาดที่คาดว่าจะลด",
    content:
      "คณะกรรมการนโยบายการเงิน (กนง.) มีมติคงอัตราดอกเบี้ยนโยบายไว้ที่ 2.25% " +
      "ต่อปี สวนทางกับที่นักวิเคราะห์ส่วนใหญ่คาดว่าจะปรับลด 0.25% เพื่อกระตุ้น " +
      "เศรษฐกิจ โดยระบุว่าต้องการรักษาขีดความสามารถในการดำเนินนโยบายในอนาคต " +
      "ท่ามกลางความไม่แน่นอนของเศรษฐกิจโลก กลุ่มธนาคารได้ประโยชน์จากส่วนต่าง " +
      "ดอกเบี้ยที่ยังสูง ขณะที่กลุ่มอสังหาฯ ที่พึ่งพาสินเชื่ออาจได้รับผลกระทบ",
    source: "ธนาคารแห่งประเทศไทย",
    publishedAt: "2026-07-08T14:30:00Z",
    marketOutcome:
      "หุ้นกลุ่มธนาคารปรับตัวขึ้น 1.8% ตามคาดจากส่วนต่างดอกเบี้ยที่ยังสูง " +
      "ขณะที่กลุ่มอสังหาริมทรัพย์ปรับตัวลง 1.2% เป็นไปตามทฤษฎีที่ต้นทุน " +
      "สินเชื่อยังสูง ตลาดตอบสนองสอดคล้องกับปัจจัยพื้นฐาน",
  },
  {
    id: "N002",
    headline: "ราคาน้ำมันดิบพุ่ง 5% หลังความตึงเครียดในตะวันออกกลางทวีความรุนแรง",
    content:
      "ราคาน้ำมันดิบ Brent ปรับตัวขึ้นกว่า 5% แตะระดับสูงสุดในรอบ 6 เดือน " +
      "หลังเกิดความตึงเครียดทางภูมิรัฐศาสตร์ในตะวันออกกลางที่อาจกระทบเส้นทาง " +
      "ขนส่งน้ำมันสำคัญ นักวิเคราะห์มองว่ากลุ่มพลังงานต้นน้ำจะได้ประโยชน์ " +
      "โดยตรงจากราคาน้ำมันที่สูงขึ้น ขณะที่กลุ่มขนส่งและสายการบินอาจเผชิญ " +
      "ต้นทุนเชื้อเพลิงที่เพิ่มขึ้น",
    source: "Reuters",
    publishedAt: "2026-07-09T08:15:00Z",
    marketOutcome:
      "หุ้นกลุ่มพลังงานต้นน้ำอย่าง PTTEP ปรับตัวขึ้น 4.2% ตามราคาน้ำมัน " +
      "ขณะที่ AOT และกลุ่มขนส่งปรับตัวลง 2.1% จากความกังวลต้นทุนเชื้อเพลิง " +
      "ตลาดตอบสนองสอดคล้องกับทิศทางที่ควรจะเป็น",
  },
  {
    id: "N003",
    headline: "ยอดส่งออกชิ้นส่วนอิเล็กทรอนิกส์ไทยโต 18% รับดีมานด์ AI ทั่วโลก",
    content:
      "กระทรวงพาณิชย์รายงานยอดส่งออกชิ้นส่วนอิเล็กทรอนิกส์ของไทยเติบโต 18% " +
      "เมื่อเทียบกับช่วงเดียวกันของปีก่อน โดยได้แรงหนุนจากความต้องการชิ้นส่วน " +
      "สำหรับศูนย์ข้อมูลและปัญญาประดิษฐ์ (AI) ที่เพิ่มขึ้นทั่วโลก ผู้ผลิต " +
      "ชิ้นส่วนอิเล็กทรอนิกส์รายใหญ่ของไทยได้รับคำสั่งซื้อล่วงหน้าเต็มกำลัง " +
      "การผลิตไปจนถึงสิ้นปี",
    source: "กระทรวงพาณิชย์",
    publishedAt: "2026-07-10T10:00:00Z",
    marketOutcome:
      "หุ้นกลุ่มเทคโนโลยี/อิเล็กทรอนิกส์อย่าง DELTA และ KCE ปรับตัวขึ้น 3.5% " +
      "ตอบรับข่าวเชิงบวก เป็นไปตามที่ตลาดคาดการณ์จากดีมานด์ AI ที่แข็งแกร่ง",
  },
  {
    id: "N004",
    headline: "รัฐบาลอนุมัติมาตรการกระตุ้นท่องเที่ยว คาดนักท่องเที่ยวทะลุ 40 ล้านคน",
    content:
      "คณะรัฐมนตรีอนุมัติมาตรการกระตุ้นการท่องเที่ยวชุดใหม่ รวมถึงการขยาย " +
      "ฟรีวีซ่าและการส่งเสริมการตลาดในต่างประเทศ โดยตั้งเป้าจำนวนนักท่องเที่ยว " +
      "ต่างชาติทะลุ 40 ล้านคนภายในปีนี้ ซึ่งจะเป็นประโยชน์ต่อกลุ่มสนามบิน " +
      "โรงพยาบาลที่รับผู้ป่วยต่างชาติ และกลุ่มค้าปลีกในทำเลท่องเที่ยว",
    source: "ทำเนียบรัฐบาล",
    publishedAt: "2026-07-11T16:45:00Z",
    marketOutcome:
      "หุ้น AOT ปรับตัวขึ้น 3.0% และกลุ่มโรงพยาบาลที่รับผู้ป่วยต่างชาติอย่าง " +
      "BH ขึ้น 2.4% ตอบรับข่าวบวก ขณะที่ CPN ในทำเลท่องเที่ยวขึ้น 1.5% " +
      "ตลาดตอบสนองสอดคล้องกับผลบวกที่คาดไว้",
  },
  {
    id: "N006",
    headline: "ทรัมป์ประกาศขึ้นภาษีนำเข้าทั่วโลก ตลาดการเงินผันผวนหนัก",
    content:
      "ประธานาธิบดีทรัมป์ประกาศขึ้นภาษีนำเข้าสินค้าจากทั่วโลกในอัตราสูง " +
      "สร้างความกังวลต่อการค้าโลกและห่วงโซ่อุปทาน นักลงทุนเข้าสู่ภาวะ " +
      "risk-off เทขายสินทรัพย์เสี่ยง โดยปกติในภาวะเช่นนี้เงินทุนควรไหลเข้า " +
      "สินทรัพย์ปลอดภัยอย่างทองคำและพันธบัตรสหรัฐ กลุ่มส่งออกและกลุ่มที่พึ่งพา " +
      "การค้าระหว่างประเทศคาดว่าจะได้รับผลกระทบมากที่สุด",
    source: "Reuters",
    publishedAt: "2026-07-07T09:00:00Z",
    marketOutcome:
      "ตลาดหุ้นทั่วโลกปรับตัวลงตามคาดในภาวะ risk-off แต่ที่ผิดปกติคือทองคำ " +
      "กลับปรับตัวลง 2.3% และพันธบัตรสหรัฐถูกขายออกเช่นกัน ทั้งที่ตามทฤษฎี " +
      "สินทรัพย์ปลอดภัยเหล่านี้ควรปรับตัวขึ้นในภาวะ risk-off การที่ทองคำร่วง " +
      "สวนทางกับที่ควรจะเป็น อาจสะท้อนแรงขายเพื่อเพิ่มสภาพคล่อง (margin call) " +
      "และอาจเป็นโอกาสสะสมทองคำที่ตลาดมองข้าม",
  },
  // N007 — Fed rate hike, September 16, 2026 (second cached scenario).
  // Headline/content: the FOMC decision itself (English, as issued).
  // marketOutcome: ONLY the team-supplied market data, figures exactly as given.
  //   - SET close Sep 17 = 1,583.34, +20.61 pts (+1.32%), turnover 62,452.42 MB
  //     (Krungthep Turakij). The implied Sep 16 close of 1,562.73 is DERIVED
  //     from that change, not separately sourced, so it is not stated below.
  //   - Most-active stocks are limited to tickers held in mockClients (all five
  //     listed were held).
  //   - Sector index changes (SETBANK, PROP, TRANS, ICT, ENERG, HELTH, ETRON) and
  //     BOT USD/THB reference rates were not available, so they are omitted. The
  //     only FX figure is the Sep 17 MORNING MARKET rate, labelled as such.
  //   - The analyst view is attributed as reported commentary.
  // It deliberately does not say whether a dislocation exists — Agent 1 decides.
  {
    id: "N007",
    headline:
      "Fed raises federal funds rate by 25 basis points to 3.75%-4.00%, first hike since July 2023",
    content:
      "The Federal Open Market Committee voted unanimously, 12-0, on September 16, 2026 " +
      "to raise the target range for the federal funds rate by 25 basis points, from " +
      "3.50%-3.75% to 3.75%-4.00%. It is the Fed's first rate increase since July 2023. " +
      "The committee's dot plot signaled another possible hike later in 2026. Markets " +
      "had largely priced in the move before the announcement.",
    source:
      "FOMC decision (Sep 16, 2026); ข้อมูลตลาด: กรุงเทพธุรกิจ (bangkokbiznews.com) รายงานภาวะตลาดปิด 17 ก.ย. 2026",
    publishedAt: "2026-09-16T18:00:00Z",
    marketOutcome:
      "ดัชนี SET วันที่ 17 ก.ย. ปิดที่ 1,583.34 จุด เพิ่มขึ้น 20.61 จุด (+1.32%) " +
      "มูลค่าการซื้อขาย 62,452.42 ล้านบาท หุ้นที่มีการซื้อขายมากที่สุด (most active) " +
      "ได้แก่ DELTA ปิดที่ 240.00 (+3.00%) PTTEP 151.00 (-1.63%) KTB 45.00 (+1.12%) " +
      "PTT 42.25 (+0.60%) และ BBL 193.00 (+0.52%) ค่าเงินบาทในตลาดช่วงเช้าวันที่ 17 ก.ย. " +
      "อ่อนค่าลงมาที่ 33.38-33.40 บาทต่อดอลลาร์สหรัฐ (อัตราตลาดช่วงเช้า ไม่ใช่อัตราอ้างอิง " +
      "ของ ธปท.) นักวิเคราะห์ระบุว่าการปรับขึ้นของตลาดมาจากแรงซื้อคืน หลังจากหุ้นได้ปรับตัวลง " +
      "เพื่อสะท้อนทิศทางดอกเบี้ยของเฟดไปก่อนหน้าแล้ว",
  },
];

export default mockNews;
