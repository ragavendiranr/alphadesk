"""FinBERT-based news sentiment analysis."""
import os, feedparser, requests
from datetime import datetime
from typing import List, Optional

# Lazy import transformers to avoid slow startup
_finbert = None

def _get_finbert():
    global _finbert
    if _finbert is None:
        from transformers import pipeline
        _finbert = pipeline('sentiment-analysis', model='ProsusAI/finbert')
    return _finbert


NEWS_API_KEY = os.getenv('NEWS_API_KEY', '')
RSS_FEEDS    = [
    'https://economictimes.indiatimes.com/markets/rss.cms',
    'https://www.moneycontrol.com/rss/MCtopnews.xml',
]
NEWS_API_URL = 'https://newsapi.org/v2/everything'


def fetch_newsapi(query: str = 'NIFTY stock market India', max_items: int = 20) -> List[str]:
    if not NEWS_API_KEY:
        return []
    try:
        resp = requests.get(NEWS_API_URL, params={
            'q':       query,
            'language':'en',
            'sortBy':  'publishedAt',
            'pageSize': max_items,
            'apiKey':   NEWS_API_KEY,
        }, timeout=10)
        articles = resp.json().get('articles', [])
        return [f"{a['title']}. {a.get('description', '')}" for a in articles if a.get('title')]
    except Exception as e:
        print(f'NewsAPI error: {e}')
        return []


def fetch_rss(max_per_feed: int = 10) -> List[str]:
    headlines = []
    for url in RSS_FEEDS:
        try:
            feed = feedparser.parse(url)
            for entry in feed.entries[:max_per_feed]:
                headlines.append(f"{entry.get('title', '')}. {entry.get('summary', '')[:200]}")
        except Exception as e:
            print(f'RSS feed error {url}: {e}')
    return headlines


def get_sentiment_score(texts: Optional[List[str]] = None, symbol: Optional[str] = None) -> dict:
    """
    Fetch news, run FinBERT, return structured sentiment result.
    """
    if texts is None:
        query = f'{symbol} NSE stock' if symbol else 'NIFTY stock market India'
        texts = fetch_newsapi(query) + fetch_rss()

    texts = [t for t in texts if t and len(t) > 10][:20]  # limit for speed

    if not texts:
        return {
            'score': 50.0, 'label': 'NEUTRAL',
            'positive_count': 0, 'negative_count': 0, 'neutral_count': 0,
            'articles_analyzed': 0, 'headlines': [],
            'symbol': symbol or 'MARKET',
        }

    finbert = _get_finbert()
    results = finbert(texts)

    positive = sum(1 for r in results if r['label'] == 'positive')
    negative = sum(1 for r in results if r['label'] == 'negative')
    neutral  = sum(1 for r in results if r['label'] == 'neutral')
    total    = len(results)

    score_raw = (positive - negative) / total  # -1 to +1
    score_100 = round(score_raw * 50 + 50, 1)  # normalize 0-100

    label = 'BULLISH' if score_raw > 0.1 else 'BEARISH' if score_raw < -0.1 else 'NEUTRAL'

    return {
        'score':           score_100,
        'label':           label,
        'positive_count':  positive,
        'negative_count':  negative,
        'neutral_count':   neutral,
        'articles_analyzed': total,
        'headlines':       texts[:5],
        'symbol':          symbol or 'MARKET',
        'timestamp':       datetime.utcnow().isoformat(),
    }


def sentiment_confidence_adjustment(confidence: float, signal_type: str, sentiment: dict) -> float:
    """Adjust ML confidence based on sentiment alignment."""
    label = sentiment.get('label', 'NEUTRAL')
    if label == 'NEUTRAL':
        return confidence
    if label == 'BULLISH' and signal_type == 'BUY':
        return min(100.0, confidence + 5.0)
    if label == 'BEARISH' and signal_type == 'SELL':
        return min(100.0, confidence + 5.0)
    if label == 'BULLISH' and signal_type == 'SELL':
        return max(0.0, confidence - 5.0)
    if label == 'BEARISH' and signal_type == 'BUY':
        return max(0.0, confidence - 5.0)
    return confidence
