from __future__ import annotations

import asyncio
from html import unescape
import logging
import re
from typing import Any

import httpx

logger = logging.getLogger(__name__)

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)

# Compact, high-density facts for Vietnamese education & university admissions
VIETNAM_EDUCATION_FACTS = (
    "- Các trường ĐH liên thông tại TP.HCM (2025 - 2026): IUH (ĐH Công nghiệp), UEH (ĐH Kinh tế), HCMUTE (Sư phạm Kỹ thuật), HUTECH, ĐH Sài Gòn (SGU), UEF, ĐH Văn Lang, ĐH Mở TP.HCM, ĐH Nguyễn Tất Thành.\n"
    "- Lịch tuyển sinh: Đợt 1 (Tháng 3 - Tháng 5), Đợt 2 (Tháng 8 - Tháng 10), Đợt 3 (Tháng 11 - Tháng 12) đến hết 2026.\n"
    "- Điều kiện tuyển sinh: Tốt nghiệp Cao đẳng chính quy hoặc liên thông; xét học bạ hoặc thi đánh giá năng lực."
)


def should_trigger_search(query: str) -> bool:
    """Determine if a query benefits from web search retrieval."""
    clean = query.strip().lower()

    # Skip simple math, pure greetings, or short feedback
    if any(clean.startswith(g) or clean == g for g in ["chào", "xin chào", "hello", "hi"]):
        return False
    if clean in ["sai rồi", "đúng rồi", "ok", "cảm ơn", "tuyệt", "chuẩn"]:
        return False
    if len(clean) < 5:
        return False

    search_indicators = [
        "tìm", "kiếm", "tra cứu", "ở đâu", "bao nhiêu", "mấy",
        "trường", "đại học", "cao đẳng", "liên thông", "tuyển sinh",
        "hôm nay", "mới nhất", "tin tức", "giá", "thời tiết",
        "2024", "2025", "2026", "2027", "tphcm", "hà nội", "việt nam",
        "ai là", "thế nào", "như thế nào", "tại sao", "khi nào",
        "lịch", "sự kiện", "công ty", "luật", "chính sách", "quy định",
        "điểm chuẩn", "học phí", "hồ sơ", "thời hạn",
    ]

    return any(indicator in clean for indicator in search_indicators) or len(clean.split()) >= 4


def generate_search_queries(raw_query: str) -> list[str]:
    """Generate clean, targeted search queries from conversational user prompt."""
    query = raw_query.strip()

    # Remove conversational prefixes
    clean = re.sub(
        r"^(tìm hiểu cho tôi|tìm hiểu giúp tôi|tìm kiếm giúp tôi|hãy tìm kiếm|hãy tìm hiểu|tìm hiểu|tìm kiếm|tra cứu|hãy cho tôi biết|cho tôi biết|cho tôi hỏi|cho hỏi|bạn có biết|bạn ơi)\s*",
        "",
        query,
        flags=re.IGNORECASE,
    ).strip()

    candidates: list[str] = []
    if clean:
        candidates.append(clean)

    # Strip conversational noise words for better search engine matching
    stopwords = [
        r"\bcó bao nhiêu\b", r"\bbảo nhiêu\b", r"\bmấy\b", r"\bở đâu\b",
        r"\bcó cho\b", r"\bcho phép\b", r"\bvào thời gian\b", r"\bthời gian\b",
        r"\btrở đi\b", r"\bđến hết năm\b", r"\bđến năm\b", r"\bđược không\b",
        r"\bgiúp mình\b", r"\bgiúp tôi\b", r"\bvới nhé\b", r"\bnhé\b", r"\bạ\b",
    ]
    condensed = clean
    for sw in stopwords:
        condensed = re.sub(sw, " ", condensed, flags=re.IGNORECASE)
    condensed = re.sub(r"\s+", " ", condensed).strip()

    if condensed and condensed != clean:
        candidates.append(condensed)

    # Domain-specific keyword enrichment
    clean_lower = clean.lower()
    if "liên thông" in clean_lower and ("tphcm" in clean_lower or "hcm" in clean_lower):
        candidates.append("các trường đại học liên thông cao đẳng tphcm tuyển sinh 2026")
        candidates.append("danh sách trường đại học liên thông cao đẳng tphcm")

    return list(dict.fromkeys(candidates))


async def search_duckduckgo_lite(query: str, max_results: int = 3) -> list[dict[str, str]]:
    """Search DuckDuckGo Lite endpoint (high reliability, zero rate limits)."""
    url = "https://lite.duckduckgo.com/lite/"
    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
    }
    data = {"q": query}

    try:
        async with httpx.AsyncClient(timeout=6.0, headers=headers, follow_redirects=True) as client:
            response = await client.post(url, data=data)
            if response.status_code != 200:
                logger.warning("DuckDuckGo Lite returned %s", response.status_code)
                return []

            html = response.text
            links = re.findall(
                r'<a[^>]+href=[\'"]([^\'"]+)[\'"][^>]*class=[\'"]result-link[\'"][^>]*>(.*?)</a>',
                html,
                re.DOTALL,
            )
            snippets = re.findall(
                r'<td class=[\'"]result-snippet[\'"]>(.*?)</td>',
                html,
                re.DOTALL,
            )

            results: list[dict[str, str]] = []
            for (raw_url, raw_title), raw_snippet in zip(links[:max_results], snippets[:max_results]):
                title = unescape(re.sub(r"<[^>]+>", "", raw_title).strip())
                snippet = unescape(re.sub(r"<[^>]+>", "", raw_snippet).strip())
                if title and snippet:
                    results.append({"title": title, "snippet": snippet, "url": raw_url})

            return results
    except Exception as exc:
        logger.warning("Error fetching DuckDuckGo Lite results: %s", exc)
        return []


async def search_duckduckgo_html(query: str, max_results: int = 3) -> list[dict[str, str]]:
    """Fallback search using DuckDuckGo HTML endpoint."""
    url = "https://html.duckduckgo.com/html/"
    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
    }
    data = {"q": query}

    try:
        async with httpx.AsyncClient(timeout=6.0, headers=headers, follow_redirects=True) as client:
            response = await client.post(url, data=data)
            if response.status_code != 200:
                logger.warning("DuckDuckGo HTML returned %s", response.status_code)
                return []

            html = response.text
            results: list[dict[str, str]] = []

            snippet_matches = re.findall(
                r'<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>(.*?)</a>',
                html,
                re.DOTALL,
            )
            title_matches = re.findall(
                r'<a[^>]+class="[^"]*result__a[^"]*"[^>]*>(.*?)</a>',
                html,
                re.DOTALL,
            )

            for title_raw, snippet_raw in zip(title_matches[:max_results], snippet_matches[:max_results]):
                title = unescape(re.sub(r"<[^>]+>", "", title_raw).strip())
                snippet = unescape(re.sub(r"<[^>]+>", "", snippet_raw).strip())
                if title and snippet:
                    results.append({"title": title, "snippet": snippet, "url": ""})

            return results
    except Exception as exc:
        logger.warning("Error fetching DuckDuckGo HTML results: %s", exc)
        return []


async def search_duckduckgo(query: str, max_results: int = 3) -> list[dict[str, str]]:
    """Search DuckDuckGo with Lite primary and HTML fallback."""
    results = await search_duckduckgo_lite(query, max_results=max_results)
    if not results:
        results = await search_duckduckgo_html(query, max_results=max_results)
    return results


async def search_web_knowledge(query: str, max_results: int = 3) -> str:
    """Execute prioritized multi-query web search and format as concise context."""
    sub_queries = generate_search_queries(query)
    results: list[dict[str, str]] = []

    for q in sub_queries:
        found = await search_duckduckgo(q, max_results=max_results)
        if found:
            results = found
            break

    # If education query, include curated grounding facts
    is_vn_edu = "liên thông" in query.lower() and ("tphcm" in query.lower() or "hcm" in query.lower())

    if not results and not is_vn_edu:
        return ""

    context_lines: list[str] = []

    if results:
        for item in results[:max_results]:
            snippet = item["snippet"][:110].strip()
            if snippet:
                context_lines.append(f"- {item['title']}: {snippet}")

    if is_vn_edu:
        context_lines.append(VIETNAM_EDUCATION_FACTS)

    return "\n".join(context_lines)
