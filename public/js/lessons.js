// Vendo Academy: plain-language lessons on online advertising.
// Each lesson: { id, title, minutes, body (HTML), widget?, quiz: [{ q, options, answer, why }] }
export const LESSONS = [
  {
    id: 'basics',
    title: 'How online ads work',
    minutes: 5,
    body: `
<p>Online advertising is an <strong>auction</strong> that runs billions of times a day. Every time someone opens Instagram, searches Google or scrolls TikTok, the platform has a few ad slots to fill. Every advertiser who wants to reach that person competes for them in a split second.</p>
<h2>Who wins the auction?</h2>
<p>Not just the highest bidder. Platforms want users to keep coming back, so they reward ads people are likely to find useful:</p>
<div class="callout"><strong>Ad rank ≈ your bid × how likely the person is to respond × ad quality</strong></div>
<p>A great ad with a modest bid often beats a boring ad with a big bid, and it pays <em>less</em> per result. So <strong>the quality of your ad is your biggest money-saver.</strong></p>
<h2>What you pay for</h2>
<table><tr><th>Model</th><th>You pay…</th><th>Typical use</th></tr>
<tr><td><strong>CPM</strong></td><td>per 1,000 impressions (views)</td><td>Awareness, reach</td></tr>
<tr><td><strong>CPC</strong></td><td>per click</td><td>Website traffic, Google Search</td></tr>
<tr><td><strong>CPA / oCPM</strong></td><td>per impression, but the platform targets people likely to take your action</td><td>Leads, sales</td></tr></table>
<h2>The marketing funnel</h2>
<p>People rarely buy the first time they see an ad. They move through stages, and each stage needs a different goal:</p>
<div class="funnel">
  <div style="width:100%;background:#6366f1">Awareness: they discover you exist</div>
  <div style="width:82%;background:#8b5cf6">Consideration: they visit, watch, engage</div>
  <div style="width:62%;background:#d946ef">Conversion: they sign up or buy</div>
  <div style="width:44%;background:#ec4899">Loyalty: they come back and recommend you</div>
</div>
<div class="callout tip">If you're new and have a small budget, start near the bottom of the funnel: people searching for what you sell (Google Search) or visitors who already know you.</div>`,
    quiz: [
      { q: 'Two advertisers bid the same. Whose ad usually wins?', options: ['The one who signed up first', 'The one whose ad people are more likely to respond to', 'Random'], answer: 1, why: 'Platforms weigh predicted response and quality, not just bids.' },
      { q: 'CPM means you pay…', options: ['per click', 'per 1,000 impressions', 'per purchase'], answer: 1, why: 'M is the Roman numeral for 1,000 ("cost per mille").' },
    ],
  },
  {
    id: 'goals',
    title: 'Pick the right goal',
    minutes: 4,
    body: `
<p>The goal (platforms call it the <strong>objective</strong>) is the most important choice you make. It tells the platform's machine learning <em>who</em> to show your ad to.</p>
<table><tr><th>Goal</th><th>The platform finds people who…</th><th>Measure success by</th></tr>
<tr><td>Awareness</td><td>will see and remember your ad, as cheaply as possible</td><td>Reach, CPM</td></tr>
<tr><td>Traffic</td><td>tend to click links</td><td>Clicks, CPC, landing page views</td></tr>
<tr><td>Engagement</td><td>like, comment, share, watch videos</td><td>Engagements, cost per engagement</td></tr>
<tr><td>Leads</td><td>fill in forms and sign up</td><td>Leads, cost per lead (CPL)</td></tr>
<tr><td>Sales</td><td>buy things online</td><td>Purchases, cost per acquisition (CPA), ROAS</td></tr></table>
<div class="callout why">If you choose "Traffic" but actually want sales, the platform will happily bring you lots of cheap clicks from people who click everything and rarely buy. <strong>Choose the goal that matches what you really want.</strong></div>
<h2>Conversion goals need tracking</h2>
<p>For Leads and Sales the platform must <em>see</em> conversions happen on your website. That means installing a small tracking code: the Meta Pixel, Google tag, TikTok Pixel, LinkedIn Insight Tag or Pinterest Tag. Without it, Vendo falls back to optimising for clicks and tells you so.</p>`,
    quiz: [
      { q: 'You sell handmade candles online and want orders. Best goal?', options: ['Engagement', 'Sales (with a pixel installed)', 'Awareness'], answer: 1, why: 'Match the goal to the outcome you want, and give the platform conversion data.' },
      { q: 'Why can a "Traffic" campaign bring visitors who never buy?', options: ['Because the algorithm finds people who like clicking, not buying', 'Because traffic ads are broken', 'Because of ad blockers'], answer: 0, why: 'The algorithm optimises for exactly what you ask for.' },
    ],
  },
  {
    id: 'platforms',
    title: 'Choosing platforms',
    minutes: 5,
    body: `
<p>Each platform reaches people in a different mindset. Pick based on <strong>where your customers are</strong> and <strong>what they're doing there</strong>.</p>
<table><tr><th>Platform</th><th>Mindset</th><th>Best for</th><th>Avg CPC*</th><th>Creative</th></tr>
<tr><td>Google Search</td><td>"I need this now"</td><td>Services, local business, high-intent products</td><td>$1–$6</td><td>Text ads + keywords</td></tr>
<tr><td>Meta (FB/IG)</td><td>Scrolling, socialising</td><td>Almost any consumer business, local, e-commerce</td><td>$0.5–$2</td><td>Image, video, carousel</td></tr>
<tr><td>TikTok</td><td>Entertainment</td><td>Under 35s, products that demo well</td><td>$0.3–$1.5</td><td>Vertical native-style video</td></tr>
<tr><td>LinkedIn</td><td>Professional</td><td>B2B, recruiting, high-value services</td><td>$4–$10</td><td>Image + professional copy</td></tr>
<tr><td>Pinterest</td><td>Planning &amp; inspiration</td><td>Home, fashion, food, beauty, weddings, DIY</td><td>$0.5–$1.5</td><td>Vertical images</td></tr></table>
<p class="hint">*Very rough cross-industry ranges. Legal, insurance and finance keywords can cost $20–$50+ per click.</p>
<div class="callout tip">With under ~$30/day, master <strong>one</strong> platform first. Spreading $10 across five platforms means none of them gets enough data to learn.</div>`,
    quiz: [
      { q: 'You are a plumber in one city. Which platform catches people with an urgent need?', options: ['Pinterest', 'Google Search', 'TikTok'], answer: 1, why: 'Google Search reaches people actively looking for "plumber near me".' },
      { q: 'You sell accounting software to CFOs. Which platform targets by job title?', options: ['LinkedIn', 'Pinterest', 'TikTok'], answer: 0, why: 'LinkedIn targets by job title, seniority, company and industry.' },
    ],
  },
  {
    id: 'budget',
    title: 'Budgets & bidding',
    minutes: 6,
    widget: 'budget',
    body: `
<p>You control spending with a <strong>daily budget</strong> (average spend per day) or a <strong>lifetime budget</strong> (total for the campaign). Vendo uses daily budgets because they're easiest to reason about.</p>
<h2>How much should I spend?</h2>
<p>Work backwards from what a customer is worth to you:</p>
<ol>
  <li>How much profit does one customer bring? (e.g. $60)</li>
  <li>How much can you afford to pay to get one? (e.g. $30, your <strong>target CPA</strong>)</li>
  <li>Platforms need about <strong>50 conversions a week</strong> to optimise well → budget ≈ 50 × CPA ÷ 7 per day.</li>
</ol>
<p>Can't afford that? Start with a traffic goal or a single platform, and treat the first weeks as paid learning.</p>
<h2>The learning phase</h2>
<p>For the first days the algorithm experiments to find who responds. Results are unstable and often more expensive. <strong>Don't panic and don't edit constantly</strong>: every big change (budget ±30%+, new audience, new creative) restarts learning.</p>
<h2>Bidding</h2>
<p>Vendo uses <strong>automatic bidding</strong> ("lowest cost", "Maximize clicks"): the platform bids for you in each auction to get the most results within your budget. Manual bids are for experts who know their numbers.</p>
<div class="callout why">Platforms may spend more than your daily budget on good days and less on others (Google up to 2×), but they average out over the week or month.</div>`,
    quiz: [
      { q: 'Your campaign launched yesterday and the cost per click looks high. What should you do?', options: ['Change audience and creative immediately', 'Wait a few days for the learning phase', 'Double the budget'], answer: 1, why: 'Early results are noisy; edits restart learning.' },
      { q: 'Target CPA of $20 and the algorithm wants ~50 conversions per week. Ideal daily budget?', options: ['≈ $20', '≈ $140', '≈ $1,000'], answer: 1, why: '50 × $20 ÷ 7 ≈ $143 per day.' },
    ],
  },
  {
    id: 'audience',
    title: 'Targeting the right people',
    minutes: 5,
    body: `
<p>Targeting tells the platform <em>where to start looking</em>. Modern algorithms are very good at finding buyers inside broad audiences, so over-narrowing usually <strong>raises</strong> costs.</p>
<h2>Targeting options</h2>
<table><tr><th>Type</th><th>What it is</th><th>Where</th></tr>
<tr><td>Location</td><td>Countries, regions, cities, radius around your shop</td><td>All</td></tr>
<tr><td>Demographics</td><td>Age, gender, language</td><td>All (some restricted for special ad categories)</td></tr>
<tr><td>Keywords</td><td>What people search for</td><td>Google, Pinterest</td></tr>
<tr><td>Interests &amp; behaviour</td><td>Topics people engage with</td><td>Meta, TikTok, Pinterest</td></tr>
<tr><td>Professional</td><td>Job title, industry, company size</td><td>LinkedIn</td></tr>
<tr><td>Retargeting</td><td>People who visited your site or engaged before</td><td>All (needs pixel/tag)</td></tr>
<tr><td>Lookalikes</td><td>New people similar to your customers</td><td>Meta, TikTok, LinkedIn, Pinterest</td></tr></table>
<h2>Google keyword match types</h2>
<table><tr><th>Match</th><th>Keyword</th><th>Can show for</th></tr>
<tr><td>Broad</td><td>running shoes</td><td>"marathon training tips" (related meaning)</td></tr>
<tr><td>Phrase (Vendo default)</td><td>"running shoes"</td><td>"best running shoes for women"</td></tr>
<tr><td>Exact</td><td>[running shoes]</td><td>"running shoes", "shoes for running"</td></tr></table>
<div class="callout tip">Write keywords the way <em>customers</em> talk, not the way you describe your product internally. Add 5–20 closely related keywords per campaign.</div>`,
    quiz: [
      { q: 'Why can a very narrow audience cost more?', options: ['Fewer people to compete for, so prices rise and the algorithm has less room to find buyers', 'Platforms charge a fee for narrow targeting', 'It doesn\'t'], answer: 0, why: 'Less supply, more competition, less room for optimisation.' },
      { q: 'With phrase match "yoga mats", which search can show your ad?', options: ['"cheap yoga mats online"', '"pilates classes"', '"yoga retreat bali"'], answer: 0, why: 'Phrase match requires the meaning of your phrase to be in the search.' },
    ],
  },
  {
    id: 'creative',
    title: 'Ads people actually stop for',
    minutes: 6,
    body: `
<p>Creative (your image, video and words) is the biggest factor in ad performance, often bigger than targeting and budget combined.</p>
<h2>A simple copy formula</h2>
<ol>
  <li><strong>Hook:</strong> call out the person or the problem. <em>"Back pain from working at a desk?"</em></li>
  <li><strong>Benefit:</strong> what changes for them. <em>"Our chair supports you for 8 hours."</em></li>
  <li><strong>Proof:</strong> why believe you. <em>"4.8★ from 2,000 reviews."</em></li>
  <li><strong>Call to action:</strong> what to do next. <em>"Try it free for 30 days."</em></li>
</ol>
<h2>Formats &amp; sizes</h2>
<table><tr><th>Platform</th><th>Recommended media</th><th>Text limits (Vendo checks these)</th></tr>
<tr><td>Meta</td><td>1080×1080 (1:1) or 1080×1350 (4:5) image or video</td><td>Primary text: 125 chars before "See more"; headline ~40</td></tr>
<tr><td>Google Search</td><td>Text only</td><td>3–15 headlines × 30 chars; 2–4 descriptions × 90 chars</td></tr>
<tr><td>TikTok</td><td>Vertical 9:16 video, 5–60 s, sound on</td><td>Ad text 12–100 chars</td></tr>
<tr><td>LinkedIn</td><td>1200×627 or 1080×1080 image</td><td>Intro 150 chars visible (600 max); headline 70</td></tr>
<tr><td>Pinterest</td><td>1000×1500 (2:3) vertical image</td><td>Title 100; description 500</td></tr></table>
<div class="callout tip">On video platforms the first <strong>3 seconds</strong> decide everything. Start with movement, a face or the result, never a slow logo intro.</div>
<div class="callout why">Make 2–3 different versions of your ad. Platforms automatically shift budget to the winner, and you learn what your audience likes.</div>`,
    quiz: [
      { q: 'What is the best way to start a TikTok ad?', options: ['A 5-second animated logo', 'Show the result or problem immediately', 'Black screen with music'], answer: 1, why: 'Hook in the first 3 seconds or people scroll past.' },
      { q: 'Max length of a Google responsive search ad headline?', options: ['30 characters', '90 characters', '125 characters'], answer: 0, why: 'Headlines: 30 chars; descriptions: 90 chars.' },
    ],
  },
  {
    id: 'tracking',
    title: 'Tracking & conversions',
    minutes: 5,
    widget: 'utm',
    body: `
<p>Without tracking you're flying blind: you know what you spent, but not what you got back.</p>
<h2>Pixels and tags</h2>
<p>A pixel (Meta, TikTok), tag (Google, LinkedIn Insight Tag, Pinterest Tag) is a snippet on your website that reports actions like "Lead" or "Purchase" back to the ad platform. This lets the platform:</p>
<ul><li>count conversions and calculate cost per result and ROAS,</li><li><strong>optimise delivery</strong> toward people who convert,</li><li>build retargeting and lookalike audiences.</li></ul>
<p>Most website builders (Shopify, WordPress/WooCommerce, Wix, Squarespace) have one-click integrations for these. Server-side options (Meta Conversions API, TikTok Events API) make tracking more reliable as browsers block cookies.</p>
<h2>UTM parameters</h2>
<p>UTMs are tags you add to your link so tools like Google Analytics know which ad sent each visitor. Try the builder below.</p>
<div class="callout why">Privacy laws (GDPR in the EU/UK, CCPA in California and others) require consent before tracking in many regions. Use a cookie banner / consent tool and mention advertising in your privacy policy.</div>`,
    quiz: [
      { q: 'What does a Meta Pixel let Meta do?', options: ['See conversions on your site and optimise for them', 'Make your website faster', 'Block competitors'], answer: 0, why: 'Pixels report conversions back to the platform.' },
      { q: 'What is utm_source usually set to?', options: ['The platform, e.g. "facebook"', 'Your password', 'The product price'], answer: 0, why: 'utm_source = where the traffic came from.' },
    ],
  },
  {
    id: 'metrics',
    title: 'Reading your results',
    minutes: 6,
    widget: 'roas',
    body: `
<p>Vendo shows these metrics on every campaign and explains what they mean for you.</p>
<table><tr><th>Metric</th><th>Formula</th><th>What it tells you</th></tr>
<tr><td>Impressions</td><td>number of times shown</td><td>Visibility</td></tr>
<tr><td>Reach</td><td>unique people</td><td>How many different people saw it</td></tr>
<tr><td>Frequency</td><td>impressions ÷ reach</td><td>Above ~4 means ad fatigue is likely</td></tr>
<tr><td>CTR</td><td>clicks ÷ impressions</td><td>Is the ad interesting? (Meta ~1%, Google Search ~4–6%)</td></tr>
<tr><td>CPC</td><td>spend ÷ clicks</td><td>Cost of a visitor</td></tr>
<tr><td>CPM</td><td>spend ÷ impressions × 1000</td><td>Cost of attention; driven by competition</td></tr>
<tr><td>Conversion rate</td><td>conversions ÷ clicks</td><td>Is the landing page convincing?</td></tr>
<tr><td>CPA</td><td>spend ÷ conversions</td><td>Cost of a lead/customer: the number that matters</td></tr>
<tr><td>ROAS</td><td>revenue ÷ spend</td><td>3× = $3 revenue per $1 of ads</td></tr></table>
<h2>Diagnosing problems</h2>
<table><tr><th>Symptom</th><th>Likely cause</th><th>Try</th></tr>
<tr><td>Low CTR</td><td>Ad not grabbing attention or wrong audience</td><td>New image/video, sharper hook</td></tr>
<tr><td>Good CTR, few conversions</td><td>Landing page problem</td><td>Faster page, match the ad's promise, shorter form</td></tr>
<tr><td>High CPM</td><td>Narrow audience or competitive season (e.g. Black Friday)</td><td>Broaden audience</td></tr>
<tr><td>Not spending</td><td>In review, audience too small, bid cap</td><td>Wait 24h, broaden, remove caps</td></tr></table>`,
    quiz: [
      { q: '10,000 impressions and 150 clicks. CTR?', options: ['0.15%', '1.5%', '15%'], answer: 1, why: '150 ÷ 10,000 = 1.5%.' },
      { q: 'High CTR but almost no sales. Where do you look first?', options: ['The landing page', 'The ad image', 'The platform choice'], answer: 0, why: 'People are interested enough to click. Something on the page stops them.' },
    ],
  },
  {
    id: 'testing',
    title: 'Testing & scaling',
    minutes: 4,
    body: `
<h2>A/B testing</h2>
<p>Change <strong>one thing at a time</strong> (image, headline or audience) so you know what made the difference. Give each version enough data (ideally 1,000+ impressions and some conversions) before deciding.</p>
<h2>When to scale</h2>
<ul>
  <li>Your CPA is below target for at least 3–7 days.</li>
  <li>Increase budget gradually: <strong>~20–30% every few days</strong>. Big jumps can restart the learning phase.</li>
  <li>Duplicate winners to new audiences or platforms.</li>
</ul>
<h2>When to stop</h2>
<ul>
  <li>You spent 2–3× your target CPA with zero conversions.</li>
  <li>Frequency is high and CTR keeps falling (creative fatigue): refresh the creative instead of raising the budget.</li>
</ul>
<div class="callout tip">Keep a simple log: date, what you changed, why. In a month it will be your most valuable marketing document.</div>`,
    quiz: [
      { q: 'You changed the image AND the audience and results improved. What did you learn?', options: ['The image works better', 'The audience works better', 'Not sure which change helped'], answer: 2, why: 'Change one variable at a time.' },
      { q: 'A campaign is profitable. How should you increase the budget?', options: ['10× overnight', 'About 20–30% every few days', 'Never touch it'], answer: 1, why: 'Gradual increases avoid resetting learning.' },
    ],
  },
  {
    id: 'policies',
    title: 'Ad policies & doing it right',
    minutes: 4,
    body: `
<p>Every ad is reviewed (automatically and sometimes by humans) before it runs, usually within 24 hours. Rejected? Read the reason, fix it and resubmit; repeated violations can get accounts restricted.</p>
<h2>Commonly rejected</h2>
<ul>
  <li>Misleading claims ("lose 10 kg in a week", fake buttons, fake scarcity)</li>
  <li>Personal attributes: "<em>Are you</em> depressed / in debt / overweight?"</li>
  <li>Before/after images for health or weight loss</li>
  <li>Restricted products: alcohol, gambling, supplements, financial products, dating (often allowed with restrictions and certification)</li>
  <li>Landing pages that don't work, don't match the ad or have no privacy policy</li>
</ul>
<h2>Special ad categories</h2>
<p>Ads for <strong>housing, employment, credit/financial services</strong> and <strong>social issues, elections or politics</strong> have extra rules: limited targeting (no age/gender/postcode targeting on Meta), identity verification and "paid for by" disclaimers. Vendo does not currently launch campaigns in these categories, so use the platform's own tools for them.</p>
<div class="callout why">Honest ads aren't only about compliance. They also perform better over time because they attract customers who stay.</div>`,
    quiz: [
      { q: 'Which ad text is likely to be rejected?', options: ['"Are you struggling with debt?"', '"Simple budgeting app, free for 30 days"', '"Plan your monthly budget in 5 minutes"'], answer: 0, why: 'Asserting personal attributes ("Are you…") violates most platform policies.' },
    ],
  },
];
