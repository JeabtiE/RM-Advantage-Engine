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

> "หุ้น AOT ของคุณได้รับแรงกดดันจากการเทขายทั้งตลาดในภาวะ risk-off แม้จะไม่ได้ถูกกระทบจากภาษีโดยตรง"

Indirect and honest beats generic every time. There is always a specific holding to name —
name it. Never retreat to "may be relevant to your portfolio" because the link is second-order.

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

Scenario: Trump announces global import tariffs. Theory says gold should rise as a
safe haven in a risk-off move, but gold actually **fell 2.3%** alongside equities and
US treasuries — an unusual dislocation. Use these as few-shot examples in prompts.

Note how each example **names the client's own holding and its mechanism** (§3) before
delivering the dislocation — the ticker is bolded here for emphasis only.

### conservative (holds DELTA — direct exporter link)
> "เรียนคุณสมชายครับ ข่าวการขึ้นภาษีนำเข้าของสหรัฐกดดันหุ้นกลุ่มส่งออกโดยตรง รวมถึง **DELTA** ที่คุณสมชายถืออยู่ เพราะกำแพงภาษีเพิ่มต้นทุนการค้าและกระทบคำสั่งซื้อจากต่างประเทศ ที่ผิดปกติคือทองคำซึ่งควรเป็นสินทรัพย์ปลอดภัยกลับปรับลง 2.3% สวนทางกับที่ควรจะเป็น ซึ่งยังมีความไม่แน่นอนอยู่ หากคุณสมชายสนใจ ผมขอเรียนให้ทราบไว้เป็นข้อมูลและนัดคุยรายละเอียดเพิ่มเติมได้ครับ"

### moderate (holds KCE — direct exporter link)
> "เรียนคุณวิภาครับ ข่าวการขึ้นภาษีนำเข้าของสหรัฐกระทบหุ้นส่งออกอย่าง **KCE** ที่คุณวิภาถืออยู่ เพราะรายได้หลักมาจากการส่งออกชิ้นส่วนที่ต้องเผชิญกำแพงภาษีสูงขึ้น จุดที่น่าสนใจคือทองคำกลับปรับลง 2.3% พร้อมตลาดหุ้น ทั้งที่ตามทฤษฎีควรเป็นสินทรัพย์ปลอดภัยที่ปรับขึ้น ซึ่งเป็นภาพที่ไม่ค่อยเกิดขึ้น หากคุณวิภาสนใจ เราพูดคุยรายละเอียดเพิ่มเติมกันได้ครับ"

### aggressive (holds DELTA — direct exporter link)
> "เรียนคุณธนากรครับ ข่าวภาษีนำเข้าสหรัฐกระแทกหุ้นส่งออกอย่าง **DELTA** ในพอร์ตของคุณธนากรโดยตรง เพราะเป็นกลุ่มที่พึ่งพารายได้จากการค้าระหว่างประเทศมากที่สุด แต่จุดที่ตลาดส่วนใหญ่มองข้ามคือทองคำปรับลง 2.3% ทั้งที่ในภาวะ risk-off ควรปรับขึ้น อาจสะท้อนแรงขายเพื่อเพิ่มสภาพคล่องมากกว่าการเปลี่ยนพื้นฐาน ผมมองว่าเป็นข้อมูลที่คุณธนากรน่าจะสนใจ หากอยากลงลึกโทรคุยกันได้เลยครับ"

### moderate, indirect link (holds AOT — swept up in risk-off, not directly tariffed)
> "เรียนคุณศิริพรครับ ข่าวขึ้นภาษีนำเข้าสหรัฐทำให้ตลาดเข้าสู่ภาวะ risk-off และหุ้น **AOT** ที่คุณศิริพรถืออยู่ได้รับแรงกดดันจากการเทขายทั้งตลาด แม้จะไม่ได้ถูกกระทบจากภาษีโดยตรง จุดที่น่าสนใจคือทองคำกลับปรับลง 2.3% ทั้งที่ควรเป็นสินทรัพย์ปลอดภัย ซึ่งอาจสะท้อนแรงขายเพื่อเพิ่มสภาพคล่อง หากคุณศิริพรสนใจ เราพูดคุยรายละเอียดเพิ่มเติมกันได้ครับ"

Note across all four: each **names a specific holding and its mechanism** (including the
indirect AOT case), same dislocation fact (gold fell 2.3% against expectation), tone
escalates from cautious to direct, but **none** say buy/sell or "ควร…". Each ends with an
invitation to talk, not an instruction to act.
