"""
Cobalt — Debate Engine (Phase 3)
==================================
Streams convincing Bull / Bear / Neutral arguments word-by-word,
simulating LangGraph + Claude streaming behaviour.

To swap in a real LLM (Claude, GPT-4, Gemini):
  Replace `_stream_argument()` with an actual streaming API call.
  The WebSocket protocol (chunk by chunk, done flag) is already correct.
"""

import asyncio
import random
from typing import AsyncIterator

# ── Per-ticker argument templates ──────────────────────────────────────────────
# Each role has 2 variants so repeat debates feel slightly different.

ARGUMENTS: dict[str, dict[str, list[str]]] = {
    "AAPL": {
        "bull": [
            "Apple's Services segment is now a $100B+ annual revenue machine growing at 16% YoY. The installed base of 2.2 billion active devices creates a flywheel that competitors simply cannot replicate. Vision Pro is a slow burn today — but so was the first iPhone. Gross margins at 46% are the highest in Apple's history. Institutions are net buyers for the 11th consecutive quarter. Price target: $230.",
            "Tim Cook's AI strategy is the most underappreciated narrative in tech. Apple Intelligence ships on-device, meaning no cloud cost per query — a structural margin advantage over every cloud-AI peer. iPhone 17 super-cycle looks real: upgrade rates from the 14-series are tracking 28% above the 12-to-13 cycle. Free cash flow of $110B annually funds buybacks equivalent to 3.5% of float per year. Accumulate.",
        ],
        "bear": [
            "At 29× earnings Apple is priced for perfection in a decelerating growth environment. China revenue — 20% of the total — is under siege from Huawei's Mate 60 comeback. The DOJ antitrust case against the App Store threatens the highest-margin revenue line Apple has. Vision Pro sold fewer than 500k units in H1; the $3,499 price point is a de facto market-size cap. Risk/reward is unfavourable here.",
            "Services growth is slowing: 16% is down from 27% two years ago. The Google search default payment — $18–20B annually — is existentially at risk from the DOJ ruling. Without it, EPS falls roughly $1.20, and that's before legal costs. Meanwhile NVDA, MSFT, and META are all growing faster and trading at comparable multiples. There are simply better places to allocate capital in 2025.",
        ],
        "neutral": [
            "Apple is the canonical quality compounder — but that quality is fully priced. The bull case rests on Services acceleration and an AI-driven iPhone super-cycle; the bear case on multiple compression and China. Both are plausible. Technically, the stock is in a well-defined $170–$200 range. A break above $200 on strong Vision Pro data or a favourable DOJ outcome is the catalyst to watch. Hold with a tight stop at $175.",
            "The debate resolves around two binary events: DOJ/antitrust outcome and China macro. Neither is forecastable with confidence. On pure fundamentals, Apple deserves a 24–26× multiple, implying 10–15% downside from here on a normalisation. On momentum, institutional ownership and buybacks provide a floor. Net: equal-weight until catalysts clarify.",
        ],
    },
    "MSFT": {
        "bull": [
            "Microsoft is the clearest AI monetisation story in the S&P 500. Copilot is embedded across 365, Azure, GitHub, Teams — every seat becomes an AI seat. Azure grew 31% last quarter and the trajectory is accelerating as Copilot attach rates rise. Operating leverage is exceptional: margins expanded 300bps YoY even with heavy Capex. At current growth rates, MSFT reaches $4T market cap by 2026. Strong buy.",
            "The OpenAI partnership gives Microsoft exclusive cloud rights — Azure is the only place you can run GPT-4 at scale commercially. That lock-in extends to enterprise customers who have already standardised on Microsoft 365. GitHub Copilot now has 1.8M paid subscribers growing 35% QoQ. Azure AI revenue alone is on a $10B+ annualised run rate. The multiple is justified and then some.",
        ],
        "bear": [
            "Microsoft's Capex has exploded to $60B annualised — the market is treating this as investment but there is real execution risk. Data center build-outs take 18–24 months; if AI demand softens before supply comes online, write-downs follow. The Activision integration is not delivering the promised gaming synergies. And at 35× earnings, any EPS miss will be punished severely. Trim on strength.",
            "Azure's 31% growth sounds impressive until you compare it to AWS's re-acceleration to 17% on a much larger base. The market has already awarded MSFT a significant AI premium — the question is whether execution justifies it. Copilot churn in the SMB segment is running hotter than enterprise. A normalised multiple of 28× puts fair value closer to $380. Neutral-to-negative.",
        ],
        "neutral": [
            "MSFT is a premium business deserving a premium multiple. The debate is about degree. Bulls are right that the AI monetisation story is real and durable. Bears are right that 35× earnings leaves no margin for execution error. The safest view: hold existing positions, do not chase above $450, look to add on any 10%+ correction. The long-term thesis is intact.",
            "Azure growth and Copilot attach are the two metrics to watch. Both are trending positively. But the stock needs a catalyst — either a beat-and-raise quarter or evidence of Copilot churn declining — to break above $460. Without that, the range $410–$460 holds. Risk is to the downside if Capex guidance increases again.",
        ],
    },
    "TSLA": {
        "bull": [
            "Tesla's energy business is the hidden gem the market hasn't priced. Megapack deployments are growing at 150% YoY with better margins than cars. FSD v13 is genuinely impressive — 99.7% task completion rate in beta. The Robotaxi launch in Austin is a real catalyst for 2025. At current volumes, Tesla Energy alone could be worth $200B. The bear narrative is stale.",
            "Cybertruck ramp is ahead of schedule and ASPs are holding. Model Y remains the world's best-selling vehicle. Supercharger network adoption by Ford, GM, and Rivian is a high-margin annuity stream. The FSD subscription business, currently at $300M ARR, could reach $3B within 3 years if autonomy approvals expand. Musk's political capital is a risk, but the fundamentals support a $300 target.",
        ],
        "bear": [
            "Tesla's automotive gross margin ex-credits has fallen from 28% to 13% in 18 months. The price war Elon started is eating the business. Model 3 and Y are aging without credible successors. The affordable $25k model keeps getting delayed. Meanwhile BYD is outselling Tesla in China and closing in globally. The Robotaxi story is vaporware until it ships at scale. Fair value: $120.",
            "The CEO risk is not adequately priced. Musk's political entanglements are driving brand boycotts in Europe — Tesla's largest market outside the US. Deliveries fell 9% in Q1 2025 YoY. The energy segment is real but not enough to offset automotive deceleration. At 80× forward earnings with decelerating growth, Tesla is still priced for perfection. Significantly underweight.",
        ],
        "neutral": [
            "Tesla is simultaneously one of the most overvalued and most misunderstood stocks in the market. The bear case on margins is correct near-term. The bull case on FSD and Energy is correct long-term. The stock will remain volatile — range $180–$280 — until FSD achieves regulatory approval in a major jurisdiction. Trade the range rather than making a directional call.",
            "Robotaxi is either a $500 stock catalyst or a multi-year delay. Neither outcome is certain. Energy is a genuine positive surprise. Automotive margin pressure is a genuine concern. The net is a hold — not because nothing is happening but because the positive and negative catalysts roughly cancel. Revisit when Austin Robotaxi data is available.",
        ],
    },
}

# Fallback for tickers not in the template dict
_FALLBACK: dict[str, list[str]] = {
    "bull": [
        "Strong institutional buying and improving fundamentals suggest upside ahead. The sector tailwinds are favourable, management execution has been consistent, and the valuation is compelling relative to peers. The risk/reward skews bullish at current levels.",
        "Momentum indicators are aligned positively. Revenue growth is accelerating and margins are expanding sequentially. The balance sheet is clean with significant buyback capacity. This is a high-conviction long.",
    ],
    "bear": [
        "Valuation has run ahead of fundamentals. The stock is trading at a premium to historical multiples without a clear catalyst to justify re-rating. Margin pressure from competition and input costs is underappreciated by the consensus. Downside risk is meaningful from current levels.",
        "Macro headwinds — rising rates and consumer pressure — disproportionately affect this sector. Insider selling has accelerated over the past two quarters. The consensus EPS estimate looks 15% too high. Trim on any further strength.",
    ],
    "neutral": [
        "Both the bull and bear cases have merit. The stock's near-term direction will be driven by the next earnings report. Until then, the range is well-defined and the risk/reward is balanced. Hold existing positions; do not add or reduce at current prices.",
        "The market is fairly pricing the known risks and opportunities. A decisive break above resistance or a macro shock would tilt the balance. Monitor key metrics and revisit the position after the next catalyst.",
    ],
}


def _get_argument(ticker: str, role: str) -> str:
    """Get a random argument for the given ticker and role."""
    library = ARGUMENTS.get(ticker.upper(), _FALLBACK)
    variants = library.get(role, _FALLBACK[role])
    return random.choice(variants)


async def stream_debate(
    ticker: str,
    ws_send,                  # callable: async (dict) -> None
    word_delay: float = 0.045,
) -> None:
    """
    Stream all three agent arguments concurrently, word by word.
    Each word is sent as a separate WebSocket message.

    Protocol:
      → {"type": "debate_start", "ticker": "AAPL"}
      → {"type": "debate_chunk", "agent": "bull",    "chunk": "Strong"}
      → {"type": "debate_chunk", "agent": "bear",    "chunk": "P/E"}
      ... (interleaved)
      → {"type": "debate_done",  "ticker": "AAPL"}

    To plug in a real LLM, replace `_word_stream()` with a streaming API call.
    """

    await ws_send({"type": "debate_start", "ticker": ticker})

    async def _word_stream(role: str, jitter: float):
        """Stream one agent's argument word by word."""
        text = _get_argument(ticker, role)
        words = text.split()
        await asyncio.sleep(jitter)  # stagger agent starts slightly
        for word in words:
            await ws_send({
                "type":  "debate_chunk",
                "agent": role,
                "chunk": word + " ",
            })
            # Slight randomness makes it feel like real LLM streaming
            await asyncio.sleep(word_delay + random.uniform(-0.01, 0.02))

    # Run all three agents concurrently (simulates parallel LLM calls)
    await asyncio.gather(
        _word_stream("bull",    jitter=0.0),
        _word_stream("bear",    jitter=0.2),
        _word_stream("neutral", jitter=0.4),
    )

    await ws_send({"type": "debate_done", "ticker": ticker})
