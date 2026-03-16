'use strict';
const axios  = require('axios');
const logger = require('../config/logger');
const { InvestmentStock, InvestPortfolio, AiRecommendation } = require('../../../database/schemas');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// ── 50 pre-seeded stocks ───────────────────────────────────────────────────────
const SEED_STOCKS = [
  // LARGE CAP
  { symbol: 'RELIANCE',    name: 'Reliance Industries',       sector: 'Energy',          capCategory: 'LARGE', peRatio: 28, pbRatio: 2.5,  dividendYieldPct: 0.4, roePct: 9,  rocePct: 11, debtToEquity: 0.4, revenueGrowth3yr: 12, profitGrowth3yr: 8,  promoterHoldingPct: 50.3, fiiHoldingPct: 24, diiHoldingPct: 12, companyThesis: 'Conglomerate pivoting to Jio, Retail & Green Energy', futureGoals: '5G dominance, New Energy 100GW by 2030' },
  { symbol: 'TCS',         name: 'Tata Consultancy Services', sector: 'IT',              capCategory: 'LARGE', peRatio: 28, pbRatio: 12,   dividendYieldPct: 1.4, roePct: 45, rocePct: 58, debtToEquity: 0.0, revenueGrowth3yr: 14, profitGrowth3yr: 13, promoterHoldingPct: 72.4, fiiHoldingPct: 13, diiHoldingPct: 9,  companyThesis: 'Global IT leader with strong BFSI exposure', futureGoals: 'AI & cloud adoption driving margin expansion' },
  { symbol: 'HDFCBANK',    name: 'HDFC Bank',                 sector: 'Banking',         capCategory: 'LARGE', peRatio: 16, pbRatio: 2.0,  dividendYieldPct: 1.1, roePct: 16, rocePct: 19, debtToEquity: 7.0, revenueGrowth3yr: 18, profitGrowth3yr: 20, promoterHoldingPct: 0.0,  fiiHoldingPct: 48, diiHoldingPct: 19, companyThesis: 'India\'s largest private bank post HDFC merger', futureGoals: 'HDFC merger synergies & NIM recovery' },
  { symbol: 'INFY',        name: 'Infosys',                   sector: 'IT',              capCategory: 'LARGE', peRatio: 24, pbRatio: 7.5,  dividendYieldPct: 2.0, roePct: 30, rocePct: 37, debtToEquity: 0.0, revenueGrowth3yr: 16, profitGrowth3yr: 12, promoterHoldingPct: 14.9, fiiHoldingPct: 34, diiHoldingPct: 18, companyThesis: 'Cobalt AI platform driving digital transformation deals', futureGoals: 'Generative AI revenue growth, margin recovery to 21%' },
  { symbol: 'ICICIBANK',   name: 'ICICI Bank',                sector: 'Banking',         capCategory: 'LARGE', peRatio: 17, pbRatio: 2.8,  dividendYieldPct: 0.8, roePct: 18, rocePct: 21, debtToEquity: 6.5, revenueGrowth3yr: 22, profitGrowth3yr: 30, promoterHoldingPct: 0.0,  fiiHoldingPct: 44, diiHoldingPct: 20, companyThesis: 'Best-in-class private bank with growing retail franchise', futureGoals: 'Credit card & digital banking leadership' },
  { symbol: 'SBIN',        name: 'State Bank of India',       sector: 'Banking',         capCategory: 'LARGE', peRatio: 10, pbRatio: 1.5,  dividendYieldPct: 1.5, roePct: 18, rocePct: 16, debtToEquity: 9.5, revenueGrowth3yr: 15, profitGrowth3yr: 55, promoterHoldingPct: 57.5, fiiHoldingPct: 10, diiHoldingPct: 25, companyThesis: 'Largest PSU bank benefiting from India credit upcycle', futureGoals: 'YONO digital scaling, asset quality improvement' },
  { symbol: 'BHARTIARTL',  name: 'Bharti Airtel',             sector: 'Telecom',         capCategory: 'LARGE', peRatio: 60, pbRatio: 7.0,  dividendYieldPct: 0.4, roePct: 12, rocePct: 14, debtToEquity: 2.1, revenueGrowth3yr: 18, profitGrowth3yr: 90, promoterHoldingPct: 55.9, fiiHoldingPct: 19, diiHoldingPct: 12, companyThesis: 'India\'s premium telecom operator with Africa exposure', futureGoals: '5G monetization, ARPU improvement' },
  { symbol: 'BAJFINANCE',  name: 'Bajaj Finance',             sector: 'NBFC',            capCategory: 'LARGE', peRatio: 32, pbRatio: 6.0,  dividendYieldPct: 0.4, roePct: 20, rocePct: 14, debtToEquity: 4.5, revenueGrowth3yr: 30, profitGrowth3yr: 25, promoterHoldingPct: 55.9, fiiHoldingPct: 22, diiHoldingPct: 18, companyThesis: 'India\'s premier consumer NBFC with 80M+ customers', futureGoals: 'EMI card expansion, deposit franchise scaling' },
  { symbol: 'ASIANPAINT',  name: 'Asian Paints',              sector: 'Consumer',        capCategory: 'LARGE', peRatio: 50, pbRatio: 14,   dividendYieldPct: 0.9, roePct: 30, rocePct: 38, debtToEquity: 0.0, revenueGrowth3yr: 14, profitGrowth3yr: 10, promoterHoldingPct: 52.9, fiiHoldingPct: 16, diiHoldingPct: 16, companyThesis: 'Market leader in decorative paints with distribution moat', futureGoals: 'Home décor adjacency, premiumization play' },
  { symbol: 'ITC',         name: 'ITC Limited',               sector: 'Consumer',        capCategory: 'LARGE', peRatio: 26, pbRatio: 7.0,  dividendYieldPct: 3.0, roePct: 28, rocePct: 35, debtToEquity: 0.0, revenueGrowth3yr: 12, profitGrowth3yr: 22, promoterHoldingPct: 0.0,  fiiHoldingPct: 42, diiHoldingPct: 22, companyThesis: 'Cigarettes cash cow funding FMCG & hotels growth', futureGoals: 'FMCG breakeven, hotel demerger unlock' },
  { symbol: 'LT',          name: 'Larsen & Toubro',           sector: 'Infrastructure',  capCategory: 'LARGE', peRatio: 32, pbRatio: 4.5,  dividendYieldPct: 1.0, roePct: 14, rocePct: 13, debtToEquity: 1.2, revenueGrowth3yr: 20, profitGrowth3yr: 25, promoterHoldingPct: 0.0,  fiiHoldingPct: 27, diiHoldingPct: 31, companyThesis: 'Largest infra & tech conglomerate riding capex supercycle', futureGoals: 'Middle East mega projects, data centers' },
  { symbol: 'MARUTI',      name: 'Maruti Suzuki',             sector: 'Auto',            capCategory: 'LARGE', peRatio: 26, pbRatio: 5.5,  dividendYieldPct: 1.0, roePct: 22, rocePct: 26, debtToEquity: 0.0, revenueGrowth3yr: 18, profitGrowth3yr: 55, promoterHoldingPct: 58.2, fiiHoldingPct: 22, diiHoldingPct: 12, companyThesis: 'India auto market leader with unmatched distribution', futureGoals: 'SUV segment capture, EV roadmap 2025' },
  { symbol: 'SUNPHARMA',   name: 'Sun Pharmaceutical',        sector: 'Pharma',          capCategory: 'LARGE', peRatio: 35, pbRatio: 5.5,  dividendYieldPct: 0.7, roePct: 15, rocePct: 18, debtToEquity: 0.1, revenueGrowth3yr: 13, profitGrowth3yr: 18, promoterHoldingPct: 54.5, fiiHoldingPct: 20, diiHoldingPct: 14, companyThesis: 'India\'s largest pharma with specialty US & India business', futureGoals: 'Specialty portfolio US approval ramp' },
  { symbol: 'TITAN',       name: 'Titan Company',             sector: 'Consumer',        capCategory: 'LARGE', peRatio: 60, pbRatio: 17,   dividendYieldPct: 0.4, roePct: 28, rocePct: 33, debtToEquity: 0.0, revenueGrowth3yr: 25, profitGrowth3yr: 30, promoterHoldingPct: 52.9, fiiHoldingPct: 16, diiHoldingPct: 16, companyThesis: 'Premium consumer brand with jewellery & watches leadership', futureGoals: 'Emerging businesses: Taneira, CaratLane' },
  { symbol: 'KOTAKBANK',   name: 'Kotak Mahindra Bank',       sector: 'Banking',         capCategory: 'LARGE', peRatio: 20, pbRatio: 3.5,  dividendYieldPct: 0.1, roePct: 14, rocePct: 17, debtToEquity: 5.5, revenueGrowth3yr: 20, profitGrowth3yr: 22, promoterHoldingPct: 25.9, fiiHoldingPct: 40, diiHoldingPct: 20, companyThesis: 'Conservative premium bank with strong brand', futureGoals: 'Digital banking growth post RBI lifting restrictions' },
  // MID CAP
  { symbol: 'PERSISTENT',  name: 'Persistent Systems',        sector: 'IT',              capCategory: 'MID',   peRatio: 55, pbRatio: 12,   dividendYieldPct: 0.5, roePct: 22, rocePct: 28, debtToEquity: 0.0, revenueGrowth3yr: 35, profitGrowth3yr: 50, promoterHoldingPct: 31.1, fiiHoldingPct: 27, diiHoldingPct: 18, companyThesis: 'Fastest growing mid-cap IT with strong AI & cloud wins', futureGoals: 'GenAI-led revenue acceleration, $2B target' },
  { symbol: 'DIXON',       name: 'Dixon Technologies',        sector: 'Electronics',     capCategory: 'MID',   peRatio: 80, pbRatio: 22,   dividendYieldPct: 0.1, roePct: 27, rocePct: 30, debtToEquity: 0.3, revenueGrowth3yr: 50, profitGrowth3yr: 45, promoterHoldingPct: 34.8, fiiHoldingPct: 20, diiHoldingPct: 25, companyThesis: 'Electronics EMS leader benefiting from PLI schemes', futureGoals: 'Mobile manufacturing scale-up, display fab' },
  { symbol: 'LTIM',        name: 'LTIMindtree',               sector: 'IT',              capCategory: 'MID',   peRatio: 35, pbRatio: 7.0,  dividendYieldPct: 1.5, roePct: 22, rocePct: 28, debtToEquity: 0.0, revenueGrowth3yr: 25, profitGrowth3yr: 20, promoterHoldingPct: 68.6, fiiHoldingPct: 14, diiHoldingPct: 10, companyThesis: 'L&T-backed mid-cap IT with diversified vertical exposure', futureGoals: 'Cross-sell synergies, data & AI practice growth' },
  { symbol: 'POLYCAB',     name: 'Polycab India',             sector: 'Electricals',     capCategory: 'MID',   peRatio: 40, pbRatio: 7.5,  dividendYieldPct: 0.5, roePct: 20, rocePct: 24, debtToEquity: 0.2, revenueGrowth3yr: 22, profitGrowth3yr: 35, promoterHoldingPct: 67.7, fiiHoldingPct: 15, diiHoldingPct: 12, companyThesis: 'Wire & cable market leader with FMEG expansion', futureGoals: 'Project LEAP: ₹20K Cr revenue by FY26' },
  { symbol: 'CHOLAFIN',    name: 'Cholamandalam Finance',     sector: 'NBFC',            capCategory: 'MID',   peRatio: 22, pbRatio: 4.5,  dividendYieldPct: 0.2, roePct: 20, rocePct: 15, debtToEquity: 5.5, revenueGrowth3yr: 30, profitGrowth3yr: 40, promoterHoldingPct: 46.4, fiiHoldingPct: 24, diiHoldingPct: 16, companyThesis: 'South India NBFC leader in vehicle & home loans', futureGoals: 'Rural penetration, affordable housing expansion' },
  { symbol: 'TRENT',       name: 'Trent (Westside)',          sector: 'Retail',          capCategory: 'MID',   peRatio: 120,pbRatio: 25,   dividendYieldPct: 0.1, roePct: 22, rocePct: 25, debtToEquity: 0.1, revenueGrowth3yr: 40, profitGrowth3yr: 80, promoterHoldingPct: 37.0, fiiHoldingPct: 25, diiHoldingPct: 18, companyThesis: 'Tata retail play with Zudio fast fashion disruption', futureGoals: 'Zudio 1000 stores, Star Bazaar grocery expansion' },
  { symbol: 'ASTRAL',      name: 'Astral Limited',            sector: 'Pipes',           capCategory: 'MID',   peRatio: 70, pbRatio: 14,   dividendYieldPct: 0.2, roePct: 20, rocePct: 22, debtToEquity: 0.0, revenueGrowth3yr: 22, profitGrowth3yr: 18, promoterHoldingPct: 55.5, fiiHoldingPct: 14, diiHoldingPct: 14, companyThesis: 'CPVC pipe market leader with adhesives expansion', futureGoals: 'Paints category launch, international expansion' },
  { symbol: 'PIIND',       name: 'PI Industries',             sector: 'Agrochemicals',   capCategory: 'MID',   peRatio: 35, pbRatio: 6.0,  dividendYieldPct: 0.4, roePct: 18, rocePct: 22, debtToEquity: 0.0, revenueGrowth3yr: 20, profitGrowth3yr: 22, promoterHoldingPct: 51.9, fiiHoldingPct: 21, diiHoldingPct: 15, companyThesis: 'CSM agrochem leader with strong patent-protected molecules', futureGoals: 'Pharma API diversification, new CSM orders' },
  { symbol: 'SUPREMEIND',  name: 'Supreme Industries',        sector: 'Plastics',        capCategory: 'MID',   peRatio: 40, pbRatio: 9.0,  dividendYieldPct: 0.7, roePct: 22, rocePct: 28, debtToEquity: 0.0, revenueGrowth3yr: 15, profitGrowth3yr: 20, promoterHoldingPct: 48.0, fiiHoldingPct: 12, diiHoldingPct: 14, companyThesis: 'Plastic pipe & packaging leader with consistent compounding', futureGoals: 'Value-added products mix improvement' },
  { symbol: 'KPITTECH',    name: 'KPIT Technologies',         sector: 'IT',              capCategory: 'MID',   peRatio: 65, pbRatio: 18,   dividendYieldPct: 0.3, roePct: 28, rocePct: 35, debtToEquity: 0.0, revenueGrowth3yr: 40, profitGrowth3yr: 50, promoterHoldingPct: 38.5, fiiHoldingPct: 18, diiHoldingPct: 20, companyThesis: 'Auto software/EV tech specialist in a high-growth niche', futureGoals: 'SDV, EV powertrain wins in Europe & US' },
  // SMALL CAP
  { symbol: 'KAYNES',      name: 'Kaynes Technology',         sector: 'Electronics',     capCategory: 'SMALL', peRatio: 90, pbRatio: 18,   dividendYieldPct: 0.0, roePct: 15, rocePct: 17, debtToEquity: 0.4, revenueGrowth3yr: 45, profitGrowth3yr: 55, promoterHoldingPct: 59.0, fiiHoldingPct: 10, diiHoldingPct: 18, companyThesis: 'IoT & embedded EMS company riding defence & auto PLI', futureGoals: 'ESDM vertical expansion, aerospace entry' },
  { symbol: 'IDEAFORGE',   name: 'ideaForge Technology',      sector: 'Defence',         capCategory: 'SMALL', peRatio: 50, pbRatio: 5.0,  dividendYieldPct: 0.0, roePct: 8,  rocePct: 10, debtToEquity: 0.1, revenueGrowth3yr: 60, profitGrowth3yr: -20,promoterHoldingPct: 37.0, fiiHoldingPct: 6,  diiHoldingPct: 12, companyThesis: 'India\'s leading drone manufacturer for defence & surveillance', futureGoals: 'MALE drone category, export orders' },
  { symbol: 'APTUS',       name: 'Aptus Value Housing',       sector: 'Housing Finance', capCategory: 'SMALL', peRatio: 20, pbRatio: 3.0,  dividendYieldPct: 0.5, roePct: 14, rocePct: 12, debtToEquity: 3.5, revenueGrowth3yr: 30, profitGrowth3yr: 30, promoterHoldingPct: 58.0, fiiHoldingPct: 20, diiHoldingPct: 12, companyThesis: 'Affordable housing NBFC in underpenetrated South India markets', futureGoals: 'Geographic expansion, loan book ₹10K Cr' },
  { symbol: 'MEDANTA',     name: 'Global Health (Medanta)',   sector: 'Healthcare',      capCategory: 'SMALL', peRatio: 55, pbRatio: 6.0,  dividendYieldPct: 0.0, roePct: 12, rocePct: 14, debtToEquity: 0.5, revenueGrowth3yr: 22, profitGrowth3yr: 30, promoterHoldingPct: 67.0, fiiHoldingPct: 12, diiHoldingPct: 16, companyThesis: 'Premium hospital chain with North India super-specialty focus', futureGoals: 'New hospital additions, occupancy ramp-up' },
  { symbol: 'RATEGAIN',    name: 'RateGain Travel Tech',      sector: 'Travel Tech',     capCategory: 'SMALL', peRatio: 40, pbRatio: 5.0,  dividendYieldPct: 0.0, roePct: 12, rocePct: 15, debtToEquity: 0.0, revenueGrowth3yr: 40, profitGrowth3yr: 45, promoterHoldingPct: 51.0, fiiHoldingPct: 15, diiHoldingPct: 14, companyThesis: 'SaaS travel tech with global hotel & airline pricing clients', futureGoals: 'AI revenue management, US market scale' },
  { symbol: 'DOMS',        name: 'DOMS Industries',           sector: 'Consumer',        capCategory: 'SMALL', peRatio: 70, pbRatio: 15,   dividendYieldPct: 0.3, roePct: 22, rocePct: 26, debtToEquity: 0.0, revenueGrowth3yr: 25, profitGrowth3yr: 30, promoterHoldingPct: 75.0, fiiHoldingPct: 5,  diiHoldingPct: 8,  companyThesis: 'Stationery market leader with Fila brand tie-up', futureGoals: 'Export push, art products expansion' },
  { symbol: 'SENCO',       name: 'Senco Gold',                sector: 'Jewellery',       capCategory: 'SMALL', peRatio: 20, pbRatio: 3.0,  dividendYieldPct: 0.5, roePct: 15, rocePct: 14, debtToEquity: 0.8, revenueGrowth3yr: 25, profitGrowth3yr: 30, promoterHoldingPct: 67.0, fiiHoldingPct: 8,  diiHoldingPct: 12, companyThesis: 'East India jewellery retailer with brand & expansion story', futureGoals: '150 store network by 2026' },
  { symbol: 'HAPPYMIND',   name: 'Happiest Minds Technologies', sector: 'IT',            capCategory: 'SMALL', peRatio: 35, pbRatio: 7.0,  dividendYieldPct: 1.5, roePct: 28, rocePct: 35, debtToEquity: 0.0, revenueGrowth3yr: 30, profitGrowth3yr: 25, promoterHoldingPct: 53.0, fiiHoldingPct: 12, diiHoldingPct: 18, companyThesis: 'Born-digital IT with AI, IoT and security focus', futureGoals: '$500M revenue milestone, product IP play' },
  // More stocks
  { symbol: 'ZOMATO',      name: 'Zomato',                    sector: 'Consumer Tech',   capCategory: 'LARGE', peRatio: 150,pbRatio: 12,   dividendYieldPct: 0.0, roePct: 5,  rocePct: 6,  debtToEquity: 0.0, revenueGrowth3yr: 65, profitGrowth3yr: 200,promoterHoldingPct: 0.0,  fiiHoldingPct: 55, diiHoldingPct: 12, companyThesis: 'Food delivery & quick commerce with Blinkit moat', futureGoals: 'District events, B2B Hyperpure scaling' },
  { symbol: 'PAYTM',       name: 'One97 Communications',      sector: 'Fintech',         capCategory: 'MID',   peRatio: 0,  pbRatio: 2.5,  dividendYieldPct: 0.0, roePct: -15,rocePct: -12,debtToEquity: 0.0, revenueGrowth3yr: 25, profitGrowth3yr: 0,   promoterHoldingPct: 19.0, fiiHoldingPct: 30, diiHoldingPct: 16, companyThesis: 'India\'s largest payments ecosystem, profitability path', futureGoals: 'Payment aggregator license, lending revival' },
  { symbol: 'NYKAA',       name: 'FSN E-Commerce (Nykaa)',    sector: 'Consumer Tech',   capCategory: 'MID',   peRatio: 500,pbRatio: 15,   dividendYieldPct: 0.0, roePct: 5,  rocePct: 4,  debtToEquity: 0.2, revenueGrowth3yr: 35, profitGrowth3yr: 80, promoterHoldingPct: 52.0, fiiHoldingPct: 15, diiHoldingPct: 20, companyThesis: 'India\'s beauty omnichannel leader with 200K products', futureGoals: 'Fashion vertical profitability, D2C brands' },
  { symbol: 'MAPMYINDIA',  name: 'CE Info Systems (MapmyIndia)', sector: 'Technology',  capCategory: 'SMALL', peRatio: 60, pbRatio: 12,   dividendYieldPct: 0.3, roePct: 20, rocePct: 24, debtToEquity: 0.0, revenueGrowth3yr: 30, profitGrowth3yr: 30, promoterHoldingPct: 42.0, fiiHoldingPct: 12, diiHoldingPct: 16, companyThesis: 'India\'s maps & mobility tech monopoly on connected vehicles', futureGoals: 'OEM in-vehicle maps, EV charging network data' },
  { symbol: 'CDSL',        name: 'Central Depository Services', sector: 'Capital Markets', capCategory: 'SMALL',peRatio: 50, pbRatio: 12,   dividendYieldPct: 1.0, roePct: 30, rocePct: 40, debtToEquity: 0.0, revenueGrowth3yr: 25, profitGrowth3yr: 30, promoterHoldingPct: 15.0, fiiHoldingPct: 14, diiHoldingPct: 20, companyThesis: 'India\'s largest CDSL depository benefiting from demat account boom', futureGoals: 'KYC business, data analytics revenue' },
  { symbol: 'CAMPUS',      name: 'Campus Activewear',          sector: 'Consumer',        capCategory: 'SMALL', peRatio: 40, pbRatio: 5.0,  dividendYieldPct: 0.3, roePct: 14, rocePct: 16, debtToEquity: 0.4, revenueGrowth3yr: 30, profitGrowth3yr: 20, promoterHoldingPct: 52.0, fiiHoldingPct: 14, diiHoldingPct: 10, companyThesis: 'India\'s largest sports shoe brand targeting mass market', futureGoals: 'International launch, premium product lines' },
  { symbol: 'EMUDHRA',     name: 'eMudhra Limited',            sector: 'Technology',      capCategory: 'SMALL', peRatio: 45, pbRatio: 8.0,  dividendYieldPct: 0.2, roePct: 18, rocePct: 22, debtToEquity: 0.0, revenueGrowth3yr: 28, profitGrowth3yr: 35, promoterHoldingPct: 71.0, fiiHoldingPct: 8,  diiHoldingPct: 10, companyThesis: 'Trust infrastructure for digital identity & certificates', futureGoals: 'Blockchain PKI, international certification hubs' },
  { symbol: 'UJJIVANSFB',  name: 'Ujjivan Small Finance Bank', sector: 'Banking',         capCategory: 'SMALL', peRatio: 8,  pbRatio: 1.5,  dividendYieldPct: 2.0, roePct: 22, rocePct: 18, debtToEquity: 8.0, revenueGrowth3yr: 25, profitGrowth3yr: 40, promoterHoldingPct: 73.0, fiiHoldingPct: 7,  diiHoldingPct: 12, companyThesis: 'Microfinance-SFB serving underbanked rural India', futureGoals: 'Universal bank license path, deposit franchise' },
  { symbol: 'DELHIVERY',   name: 'Delhivery',                  sector: 'Logistics',       capCategory: 'MID',   peRatio: 200,pbRatio: 3.5,  dividendYieldPct: 0.0, roePct: 2,  rocePct: 3,  debtToEquity: 0.1, revenueGrowth3yr: 30, profitGrowth3yr: 50, promoterHoldingPct: 0.0,  fiiHoldingPct: 28, diiHoldingPct: 22, companyThesis: 'India\'s largest tech-first logistics network', futureGoals: 'EBITDA breakeven, B2B supply chain expansion' },
  { symbol: 'JSWENERGY',   name: 'JSW Energy',                 sector: 'Power',           capCategory: 'MID',   peRatio: 40, pbRatio: 4.5,  dividendYieldPct: 0.5, roePct: 12, rocePct: 11, debtToEquity: 1.2, revenueGrowth3yr: 20, profitGrowth3yr: 30, promoterHoldingPct: 67.0, fiiHoldingPct: 14, diiHoldingPct: 20, companyThesis: 'Clean energy transition play targeting 20GW by 2030', futureGoals: 'Battery storage, green hydrogen investments' },
  { symbol: 'CLEAN',       name: 'Clean Science Technology',   sector: 'Chemicals',       capCategory: 'SMALL', peRatio: 40, pbRatio: 8.0,  dividendYieldPct: 0.8, roePct: 25, rocePct: 30, debtToEquity: 0.0, revenueGrowth3yr: 20, profitGrowth3yr: 15, promoterHoldingPct: 59.0, fiiHoldingPct: 12, diiHoldingPct: 14, companyThesis: 'Specialty chemical company with unique green chemistry processes', futureGoals: 'New product launches, capacity expansion' },
  { symbol: 'TANLA',       name: 'Tanla Platforms',            sector: 'Technology',      capCategory: 'SMALL', peRatio: 25, pbRatio: 5.0,  dividendYieldPct: 1.5, roePct: 30, rocePct: 38, debtToEquity: 0.0, revenueGrowth3yr: 30, profitGrowth3yr: 35, promoterHoldingPct: 41.0, fiiHoldingPct: 16, diiHoldingPct: 18, companyThesis: 'CPaaS leader with blockchain-based Wisely platform', futureGoals: 'Wisely platform international rollout' },
  { symbol: 'BIKAJI',      name: 'Bikaji Foods International', sector: 'FMCG',            capCategory: 'SMALL', peRatio: 60, pbRatio: 10,   dividendYieldPct: 0.2, roePct: 15, rocePct: 18, debtToEquity: 0.1, revenueGrowth3yr: 25, profitGrowth3yr: 30, promoterHoldingPct: 71.0, fiiHoldingPct: 8,  diiHoldingPct: 12, companyThesis: 'Regional ethnic snacks brand scaling nationally', futureGoals: 'South India & export push, capacity expansion' },
  { symbol: 'SIGNATURE',   name: 'Signatureglobal India',      sector: 'Real Estate',     capCategory: 'SMALL', peRatio: 60, pbRatio: 5.0,  dividendYieldPct: 0.0, roePct: 8,  rocePct: 9,  debtToEquity: 0.8, revenueGrowth3yr: 40, profitGrowth3yr: 50, promoterHoldingPct: 66.0, fiiHoldingPct: 10, diiHoldingPct: 12, companyThesis: 'Affordable housing developer in Delhi NCR under PM Awas', futureGoals: 'Pre-sales ₹10K Cr FY26, Noida expansion' },
  // MICRO CAP
  { symbol: 'SURYODAY',    name: 'Suryoday Small Finance Bank',sector: 'Banking',         capCategory: 'MICRO', peRatio: 10, pbRatio: 1.2,  dividendYieldPct: 1.0, roePct: 12, rocePct: 10, debtToEquity: 7.0, revenueGrowth3yr: 30, profitGrowth3yr: 60, promoterHoldingPct: 37.0, fiiHoldingPct: 10, diiHoldingPct: 10, companyThesis: 'Micro-finance SFB with strong track record in rural lending', futureGoals: 'Diversification beyond MFI, deposit growth' },
  { symbol: 'TATTECH',     name: 'Tata Technologies',          sector: 'IT',              capCategory: 'MID',   peRatio: 40, pbRatio: 8.0,  dividendYieldPct: 1.2, roePct: 22, rocePct: 28, debtToEquity: 0.0, revenueGrowth3yr: 20, profitGrowth3yr: 25, promoterHoldingPct: 73.0, fiiHoldingPct: 8,  diiHoldingPct: 14, companyThesis: 'Engineering R&D services for automotive & aerospace OEMs', futureGoals: 'EV embedded software, aerospace wins' },
];

// ── Seed stocks into MongoDB ───────────────────────────────────────────────────
async function seedStocks() {
  let seeded = 0;
  for (const stock of SEED_STOCKS) {
    await InvestmentStock.findOneAndUpdate(
      { symbol: stock.symbol },
      { $setOnInsert: { ...stock, aiScore: 0, aiRating: 'HOLD', lastUpdated: new Date() } },
      { upsert: true }
    );
    seeded++;
  }
  logger.info(`Seeded ${seeded} investment stocks`, { module: 'investmentService' });
  return seeded;
}

// ── Screener ──────────────────────────────────────────────────────────────────
async function screenStocks(filters = {}) {
  const query = {};
  if (filters.cap)           query.capCategory = filters.cap.toUpperCase();
  if (filters.sector)        query.sector = new RegExp(filters.sector, 'i');
  if (filters.minPe != null) query.peRatio = { ...query.peRatio, $gte: Number(filters.minPe) };
  if (filters.maxPe != null) query.peRatio = { ...query.peRatio, $lte: Number(filters.maxPe) };
  if (filters.minRoe != null) query.roePct = { $gte: Number(filters.minRoe) };
  if (filters.maxDebt != null) query.debtToEquity = { $lte: Number(filters.maxDebt) };
  if (filters.minDiv != null) query.dividendYieldPct = { $gte: Number(filters.minDiv) };
  if (filters.rating)        query.aiRating = filters.rating.toUpperCase();

  return InvestmentStock.find(query).sort({ aiScore: -1 }).lean();
}

// ── Claude AI Recommendation ──────────────────────────────────────────────────
async function getAiRecommendation(capFilter, sectorFilter) {
  const cacheKey = `${capFilter || 'ALL'}_${sectorFilter || 'ALL'}`;

  // Check cache (4-hour TTL)
  const cached = await AiRecommendation.findOne({ cacheKey, expiresAt: { $gt: new Date() } }).lean();
  if (cached) return cached.response;

  const stocks = await screenStocks({ cap: capFilter, sector: sectorFilter });
  if (!stocks.length) return { error: 'No stocks match the filter' };

  if (!ANTHROPIC_API_KEY) return { error: 'ANTHROPIC_API_KEY not configured' };

  const stockList = stocks.slice(0, 20).map(s =>
    `${s.symbol} (${s.capCategory}/${s.sector}): PE=${s.peRatio}, ROE=${s.roePct}%, Debt=${s.debtToEquity}, Growth=${s.profitGrowth3yr}%pa, Rating=${s.aiRating}`
  ).join('\n');

  const prompt = `You are a professional equity research analyst focusing on Indian stock markets (NSE/BSE).

Analyze these stocks and provide TOP 5 recommendations with conviction:

${stockList}

For each recommendation provide:
1. Symbol & company name
2. Investment thesis (2 sentences)
3. Key risks (2 points)
4. Target price range (12-month horizon)
5. Conviction level: HIGH/MEDIUM/LOW
6. Why NOW is a good time to enter

Format as JSON array with keys: symbol, name, thesis, risks, targetRange, conviction, entryReason, aiScore (0-100)

Current market context: Indian markets, March 2026. FII activity mixed, domestic flows positive.`;

  try {
    const { data } = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
      },
      {
        headers: {
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        timeout: 60000,
      }
    );

    const raw = data?.content?.[0]?.text || '[]';
    const recommendations = JSON.parse(raw.match(/\[[\s\S]*\]/)?.[0] || '[]');

    // Update AI scores in DB
    for (const rec of recommendations) {
      if (rec.symbol && rec.aiScore != null) {
        const rating = rec.conviction === 'HIGH' ? 'BUY' : rec.conviction === 'MEDIUM' ? 'HOLD' : 'WATCH';
        await InvestmentStock.findOneAndUpdate(
          { symbol: rec.symbol },
          { aiScore: rec.aiScore, aiRating: rating, lastUpdated: new Date() }
        );
      }
    }

    const response = { recommendations, generatedAt: new Date(), filter: { cap: capFilter, sector: sectorFilter } };

    // Cache for 4 hours
    await AiRecommendation.findOneAndUpdate(
      { cacheKey },
      { cacheKey, capFilter, sectorFilter, response, cachedAt: new Date(), expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000) },
      { upsert: true }
    );

    return response;
  } catch (err) {
    logger.error(`Claude AI recommendation failed: ${err.message}`, { module: 'investmentService' });
    throw err;
  }
}

// ── Claude Deep Dive for single stock ─────────────────────────────────────────
async function getStockDeepDive(symbol) {
  const stock = await InvestmentStock.findOne({ symbol: symbol.toUpperCase() }).lean();
  if (!stock) throw new Error(`Stock ${symbol} not found`);
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured');

  const prompt = `You are a senior equity analyst. Provide a DEEP DIVE analysis for:

Company: ${stock.name} (${stock.symbol})
Sector: ${stock.sector} | Category: ${stock.capCategory}
PE: ${stock.peRatio} | PB: ${stock.pbRatio} | Dividend: ${stock.dividendYieldPct}%
ROE: ${stock.roePct}% | ROCE: ${stock.rocePct}% | D/E: ${stock.debtToEquity}
Revenue Growth (3yr): ${stock.revenueGrowth3yr}% | Profit Growth (3yr): ${stock.profitGrowth3yr}%
Promoter Holding: ${stock.promoterHoldingPct}% | FII: ${stock.fiiHoldingPct}% | DII: ${stock.diiHoldingPct}%
Company Thesis: ${stock.companyThesis}
Future Goals: ${stock.futureGoals}

Provide comprehensive analysis including:
1. Business model & competitive moat
2. Financial health assessment
3. Growth catalysts (3-5 years)
4. Key risks & mitigants
5. Valuation commentary
6. Entry strategy (levels to watch)
7. Portfolio fit (aggressive/balanced/conservative)
8. Final verdict with conviction score (0-100)

Be specific, data-driven, and actionable.`;

  const { data } = await axios.post(
    'https://api.anthropic.com/v1/messages',
    {
      model: 'claude-sonnet-4-6',
      max_tokens: 3000,
      messages: [{ role: 'user', content: prompt }],
    },
    {
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      timeout: 60000,
    }
  );

  return {
    symbol: stock.symbol,
    name: stock.name,
    analysis: data?.content?.[0]?.text || '',
    generatedAt: new Date(),
  };
}

// ── Portfolio ──────────────────────────────────────────────────────────────────
async function getPortfolio() {
  const holdings = await InvestPortfolio.find().lean();
  return holdings.map(h => {
    const gainPct = h.currentPrice && h.buyPrice
      ? ((h.currentPrice - h.buyPrice) / h.buyPrice * 100).toFixed(2)
      : null;
    const gainAbs = h.currentPrice && h.buyPrice
      ? ((h.currentPrice - h.buyPrice) * h.quantity).toFixed(2)
      : null;
    return { ...h, gainPct, gainAbs };
  });
}

async function addPortfolioHolding(data) {
  return InvestPortfolio.create({
    symbol:   data.symbol.toUpperCase(),
    name:     data.name,
    quantity: Number(data.quantity),
    buyPrice: Number(data.buyPrice),
    buyDate:  new Date(data.buyDate),
  });
}

async function removePortfolioHolding(id) {
  return InvestPortfolio.findByIdAndDelete(id);
}

// ── Refresh prices from Zerodha ───────────────────────────────────────────────
async function refreshStockPrices() {
  try {
    const stocks = await InvestmentStock.find({}, 'symbol').lean();
    const zerodha = require('../../../execution/zerodha');
    let updated = 0;
    for (const s of stocks) {
      try {
        const quote = await zerodha.getQuote(s.symbol, 'NSE');
        if (quote?.last_price) {
          await InvestmentStock.findOneAndUpdate(
            { symbol: s.symbol },
            { currentPrice: quote.last_price, priceUpdatedAt: new Date() }
          );
          await InvestPortfolio.updateMany(
            { symbol: s.symbol },
            { currentPrice: quote.last_price, priceUpdatedAt: new Date() }
          );
          updated++;
        }
      } catch {}
      await new Promise(r => setTimeout(r, 300));
    }
    logger.info(`Investment prices refreshed: ${updated}/${stocks.length}`, { module: 'investmentService' });
    return updated;
  } catch (err) {
    logger.error(`Price refresh failed: ${err.message}`, { module: 'investmentService' });
    throw err;
  }
}

module.exports = {
  seedStocks,
  screenStocks,
  getAiRecommendation,
  getStockDeepDive,
  getPortfolio,
  addPortfolioHolding,
  removePortfolioHolding,
  refreshStockPrices,
};
