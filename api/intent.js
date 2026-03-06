export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'OpenAI API key not configured' });

  const { intent } = req.body || {};
  if (!intent || typeof intent !== 'string' || intent.trim().length < 3) {
    return res.status(400).json({ error: 'Please provide a meaningful description (at least 3 characters)' });
  }

  const systemPrompt = `You are a funding mechanism advisor for the Gitcoin ecosystem. Given a user's plain-English description of their funding goals, extract parameters and recommend mechanism stacks.

Return ONLY valid JSON with this exact structure:
{
  "sliders": {
    "budget": <1-5>,
    "communitySize": <1-5>,
    "decisionStyle": <1-5>,
    "timing": <1-5>,
    "complexity": <1-5>
  },
  "interpretation": "<1-2 sentence summary of what you understood>",
  "boosts": ["<stack-id-1>", "<stack-id-2>"],
  "reasoning": {
    "<stack-id>": "<why this stack fits>"
  }
}

Slider scales:
- budget: 1=$1K, 2=$100K, 3=$1M, 4=$10M, 5=$100M+
- communitySize: 1=<50, 2=50-500, 3=500-5K, 4=5K-50K, 5=50K+
- decisionStyle: 1=Technocratic, 2=Lean Expert, 3=Balanced, 4=Lean Democratic, 5=Democratic
- timing: 1=Proactive, 2=Lean Proactive, 3=Balanced, 4=Lean Retroactive, 5=Retroactive
- complexity: 1=Simple, 2=Lean Simple, 3=Medium, 4=Complex, 5=Full Stack

Available stack IDs (use these exact strings in boosts):
- community-discovery: QF + Milestones + Streaming
- retroactive-impact: Impact Attestations + Retro Funding + Hypercerts
- protocol-sustainability: Self-Curated Registries + Percent-for-PG + Streaming
- dao-treasury: Direct Grants + Conviction Voting + Milestones
- grassroots-mutual-aid: Gift Circles + Community Currencies + Mutual Aid
- expert-allocation: RFPs + Direct Grants + Hypercerts
- continuous-funding: Augmented Bonding Curve + Streaming + AutoPGF
- legitimacy-builder: QF + Retro Funding + Impact Attestations
- innovation-scouting: Bounties + Prop House + Retro Funding
- ecosystem-growth: Coalitional Funding + QF + Milestones
- simple-proven: Direct Grants + Milestones
- defi-native: Bonding Curve + Crowdstaking + Donation Mining
- impact-marketplace: Hypercerts + Deep Funding + Retro Funding
- guild-model: Guilds + Domain Allocation + Coordinape
- pop-up-funding: Ephemeral DAOs + Commitment Pooling + Bounties

Pick 2-3 boosts maximum. Be concise in reasoning (1 sentence each).`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: intent.trim().slice(0, 1000) }
        ],
        temperature: 0.3,
        max_tokens: 500,
        response_format: { type: 'json_object' }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('OpenAI error:', response.status, errText);
      return res.status(502).json({ error: 'AI service error. Please try again.' });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return res.status(502).json({ error: 'Empty AI response' });

    const parsed = JSON.parse(content);

    // Validate and clamp sliders
    const sliders = {};
    for (const key of ['budget', 'communitySize', 'decisionStyle', 'timing', 'complexity']) {
      sliders[key] = Math.max(1, Math.min(5, Math.round(parsed.sliders?.[key] || 3)));
    }

    return res.status(200).json({
      sliders,
      interpretation: parsed.interpretation || '',
      boosts: Array.isArray(parsed.boosts) ? parsed.boosts : [],
      reasoning: parsed.reasoning || {}
    });
  } catch (err) {
    console.error('Intent API error:', err);
    return res.status(500).json({ error: 'Failed to process intent. Please try again.' });
  }
}
