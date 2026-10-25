"""
Fire many requests at once to confirm API throttling.
Usage: python scripts/test_rate_limit.py <API_BASE_URL>
"""
import sys
import urllib.error
import urllib.request
from collections import Counter
from concurrent.futures import ThreadPoolExecutor

if len(sys.argv) != 2:
    sys.exit("Usage: python scripts/test_rate_limit.py <API_BASE_URL>")

url = sys.argv[1].rstrip("/") + "/results/00000000-0000-0000-0000-000000000000"


def hit(_):
    try:
        with urllib.request.urlopen(url) as resp:
            return resp.status
    except urllib.error.HTTPError as e:
        return e.code
    except Exception as e:
        return type(e).__name__


with ThreadPoolExecutor(max_workers=20) as pool:
    results = Counter(pool.map(hit, range(60)))

print("Status code counts:", dict(results))
print("404 = request served (unknown ID), 429 = throttled")