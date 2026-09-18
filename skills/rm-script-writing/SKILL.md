---
name: rm-script-writing
description: Reference for writing RM client-call scripts that stay informational (never investment advice) under Thai IC/IP license law. Includes language patterns, tone-by-risk-profile rules, structure, and few-shot examples.
---

# RM Script Writing

Reference for Agent 3 (Script Generator) and any prompt that produces client-facing
call scripts. Scripts convert an **approved** insight into something an RM can say on
the phone. This document defines the line the scripts must never cross.

## 1. Core Rule — Informational Only, Never Advice

Scripts provide **information for the client to consider** (ให้ข้อมูลประกอบการตัดสินใจ).
They must **never** give an investment recommendation (คำแนะนำการลงทุน).

**Why this is non-negotiable:** Under Thai SEC rules, giving investment
recommendations requires an IC (Investment Consultant) or IP license. Our tool has no
license and neither does the RM-facing output pipeline by default. A script that tells
a client to buy/sell/increase/reduce a position is regulated investment advice. A script
that surfaces a fact and invites a conversation is not. **We stay on the information
side of that line — always.**

The Four Eyes approval gate does not change this. Approval confirms the *insight* is
sound; it does not license *advice*. Even an approved, fact-checked insight must be
phrased as information when it reaches the client.

## 2. Language Patterns

The distinction is directive vs. informational. Directive language commands an action;
informational language presents a fact and leaves the decision with the client.

| GOOD (informational) | BAD (directive advice) |
|---|---|
| "ราคาทองคำมีความเคลื่อนไหวที่น่าสนใจ" | "คุณควรซื้อทองคำตอนนี้" |
| "นี่อาจเป็นข้อมูลที่คุณสนใจพิจารณา" | "แนะนำให้เพิ่มสัดส่วนทองคำในพอร์ต" |

**Banned constructions** (these are advice, regardless of hedging):
- ควรซื้อ / ควรขาย / ควรถือ
- แนะนำให้… / ผมแนะนำว่า…
- ควรเพิ่มสัดส่วน / ควรลดสัดส่วน
- น่าจะซื้อตอนนี้ / จังหวะดีที่จะเข้า

**Safe constructions** (these present information):
- …มีความเคลื่อนไหวที่น่าสนใจ
- หุ้น [TICKER] ในพอร์ตของคุณ…เพราะ… (name the holding **and** the mechanism — see §3)
- อยากเรียนให้ทราบว่า…
- หากสนใจ เราสามารถพูดคุยรายละเอียดเพิ่มเติมได้

Rule of thumb: if the sentence tells the client what to **do**, rewrite it to tell the
client what **happened**.

> ⚠️ A bare "ข้อมูลนี้อาจเกี่ยวข้องกับพอร์ตของคุณ" (this may be relevant to your
> portfolio), with no ticker and no mechanism, is **compliant but useless** — it is
> banned for a different reason than directive language. See §3 (Personalization).

## 3. Personalization — Name the Holding and the Mechanism

**This is a hard requirement, not a nice-to-have.** It is the reason the call has value.

An RM who calls to say "this news may be relevant to your portfolio" has added nothing
the client couldn't get by reading the news themselves. That is the exact failure mode
this product exists to eliminate. The RM's value is *specific insight about THIS client's
specific holdings* — so every script must earn it.

Every script **must**:

1. **Name at least one specific ticker** from the client's matched holdings (the actual
   symbol, e.g. `DELTA`, `AOT`, `KBANK`).
2. **State the mechanism** connecting the news/dislocation to *that* holding — why this
   particular position is affected, in one clause.

**Banned — an automatic failure**, regardless of how compliant the wording is: a generic
relevance claim with no ticker and no mechanism (e.g. "ข้อมูลนี้อาจเกี่ยวข้องกับพอร์ตของคุณ"
standing alone). Compliant ≠ useful. This is failure, not a soft miss.

### Indirect links still get named
Sometimes a holding is caught in a broad move rather than hit head-on — an airport or
bank stock swept up in a market-wide risk-off selloff, not a directly tariffed exporter.
That is **still** a nameable, explainable connection. Name the ticker and state the
indirect mechanism honestly:

> "หุ้น AOT ของคุณอาจได้รับแรงกดดันจากการเทขายทั้งตลาดในภาวะ risk-off แม้จะไม่ได้ถูกกระทบจากภาษีโดยตรง"

Indirect and honest beats generic every time. There is always a specific holding to name —
name it. Never retreat to "may be relevant to your portfolio" because the link is second-order.

### Direction per holding — mixed exposure
Live matched holdings carry a `direction` (`positive` / `negative` / `neutral`), taken
from Agent 1's per-sector `sector_impacts` (see the dislocation-analysis skill §7). The
Agent 3 prompt lists it next to each holding (`KBANK (…) — direction: positive`); cached
demo runs predate the field and omit it.

- Describe each holding in the direction it is tagged — never call a `negative` holding a
  beneficiary, or vice versa.
- When a client holds **both** positive and negative holdings, mention both sides briefly,
  within the same sentence limit:
  > "หุ้น KBANK ในพอร์ตมีแนวโน้มได้แรงหนุนจากดอกเบี้ยที่สูงขึ้น ขณะที่ LH อาจถูกกดดันจากต้นทุนสินเชื่อ"
- Presenting both sides is information, not a rebalancing suggestion — never tell the client
  to shift from one to the other.

### Sector mechanism per holding
Each sector in Agent 1's `sector_impacts` carries a `reason` — one short, fact-checked Thai
sentence giving the mechanism (e.g. "ดอกเบี้ยที่สูงขึ้นเพิ่มต้นทุนสินเชื่อที่อยู่อาศัย" for property).
The Agent 3 prompt appends it to each matched holding as `— sector mechanism: …`, looked up by
the holding's sector. Use it as the §3 mechanism for that holding, in plain words; do not add
figures, events or company facts beyond it and the approved insight. Holdings without one
(cached runs, or a sector with no stated reason) fall back to the approved reasoning as before.

## 4. Tone by Risk Profile

Tone changes the framing, not the informational stance. Every profile stays
non-directive; the difference is how much caution and hedging surrounds the fact.

- **conservative** — cautious framing. Mention downside and uncertainty explicitly.
  Emphasize that this is information to be aware of, not a reason to act. Reassuring,
  low-pressure.
- **moderate** — balanced framing. Present the fact and its two-sided nature plainly.
  Neither alarmed nor pushy.
- **aggressive** — direct framing. Get to the point quickly and name the opportunity
  angle. Still **never** directive — "this is an interesting dislocation worth looking
  at" is fine; "you should buy" is not.

## 5. Structure

Every script:
1. **Max 3 sentences.**
2. **Lead with the relevant fact** — the dislocation or the news, stated plainly.
3. **End with an open invitation to discuss**, not a call to action. The close invites
   a conversation ("หากสนใจ เราคุยรายละเอียดกันได้") rather than prompting a trade
   ("โทรกลับมาเพื่อสั่งซื้อ").

The client should finish the script knowing something they didn't know, and feeling
invited — not instructed — to talk further.

## 6. Few-Shot Example Scripts — Tariff/Gold Dislocation Case

Scenario: Trump announces global import tariffs. **Reported:** global equities fell in a
risk-off move with broad selling, gold **fell 2.3%** and US treasuries sold off —
although theory says gold should rise as a safe haven. **No individual stock's move is
reported.**

These are the exact scripts in the Agent 3 prompt (`AGENT3_FEW_SHOT_EXAMPLES` in
`api/claude-agent.js`; a test keeps this section in sync). Each follows the
facts-vs-mechanisms rule: the reported figure (gold −2.3%) is stated plainly, while the
effect on the client's own stock is a mechanism and is hedged (มีแนวโน้ม / อาจ).

### conservative (holds DELTA — direct exporter link)
> "เรียนคุณสมชายครับ สหรัฐประกาศขึ้นภาษีนำเข้าทั่วโลกและตลาดหุ้นทั่วโลกปรับตัวลง ซึ่งอาจกดดันหุ้นส่งออกอย่าง DELTA ที่คุณสมชายถืออยู่ เพราะกำแพงภาษีมีแนวโน้มเพิ่มต้นทุนการค้าและกระทบคำสั่งซื้อจากต่างประเทศ ที่ผิดปกติคือทองคำซึ่งควรเป็นสินทรัพย์ปลอดภัยกลับปรับลง 2.3% ซึ่งยังมีความไม่แน่นอนอยู่ หากคุณสมชายสนใจ ผมขอเรียนให้ทราบไว้เป็นข้อมูลและนัดคุยรายละเอียดเพิ่มเติมได้ครับ"

### moderate (holds KCE — direct exporter link)
> "เรียนคุณวิภาครับ สหรัฐประกาศขึ้นภาษีนำเข้า ซึ่งมีแนวโน้มกระทบหุ้นส่งออกอย่าง KCE ที่คุณวิภาถืออยู่ เพราะรายได้หลักมาจากการส่งออกชิ้นส่วนที่อาจเผชิญกำแพงภาษีสูงขึ้น จุดที่น่าสนใจคือทองคำปรับลง 2.3% พร้อมตลาดหุ้น ทั้งที่ตามทฤษฎีควรเป็นสินทรัพย์ปลอดภัยที่ปรับขึ้น ซึ่งเป็นภาพที่ไม่ค่อยเกิดขึ้น หากคุณวิภาสนใจ เราพูดคุยรายละเอียดเพิ่มเติมกันได้ครับ"

### aggressive (holds DELTA — direct exporter link)
> "เรียนคุณธนากรครับ สหรัฐประกาศขึ้นภาษีนำเข้าทั่วโลก ซึ่งมีแนวโน้มกดดันหุ้นส่งออกอย่าง DELTA ในพอร์ตของคุณธนากรมากเป็นพิเศษ เพราะพึ่งพารายได้จากการค้าระหว่างประเทศสูง แต่จุดที่ตลาดส่วนใหญ่มองข้ามคือทองคำปรับลง 2.3% ทั้งที่ในภาวะ risk-off ควรปรับขึ้น ซึ่งอาจสะท้อนแรงขายเพื่อเพิ่มสภาพคล่องมากกว่าการเปลี่ยนแปลงพื้นฐาน ผมมองว่าเป็นข้อมูลที่คุณธนากรน่าจะสนใจ หากอยากลงลึกโทรคุยกันได้เลยครับ"

### moderate, indirect link (holds AOT — swept up in risk-off, not directly tariffed)
> "เรียนคุณศิริพรครับ ข่าวขึ้นภาษีนำเข้าสหรัฐทำให้ตลาดเข้าสู่ภาวะ risk-off และมีแรงเทขายทั่วตลาด ซึ่งอาจกดดันหุ้น AOT ที่คุณศิริพรถืออยู่ด้วย แม้จะไม่ได้ถูกกระทบจากภาษีโดยตรง จุดที่น่าสนใจคือทองคำกลับปรับลง 2.3% ทั้งที่ควรเป็นสินทรัพย์ปลอดภัย ซึ่งอาจสะท้อนแรงขายเพื่อเพิ่มสภาพคล่อง หากคุณศิริพรสนใจ เราพูดคุยรายละเอียดเพิ่มเติมกันได้ครับ"

Note across all four: each **names a specific holding and its mechanism** (including the
indirect AOT case), hedges that mechanism, states the same reported dislocation fact
(gold fell 2.3% against expectation), tone escalates from cautious to direct, **none**
say buy/sell or "ควร…", and each stays well under the 600-character cap. Each ends with
an invitation to talk, not an instruction to act.
