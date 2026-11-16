"""
Research only: downloads the free market-flow data for round 4 (scripts/research-flow.mts) into a cache folder.

  - CVD input: Binance spot hourly klines (data-api.binance.vision, no key): quote volume and taker buy quote volume.
  - Open interest: Binance USDT-M futures daily "metrics" archives (data.binance.vision, 5 minute rows); the last
    sum_open_interest (in coins, so price moves do not count as new money) of each hour is kept.

Output per coin in FLOW_CACHE (default: OS temp/zolva-flow): <COIN>-cvd.json [[hour ms, quote vol, taker buy quote]],
<COIN>-oi.json [[hour ms, open interest in coins]]. Reruns skip files already present. Run with python -I.

  python -I scripts/research-flow-data.py
"""
import calendar
import concurrent.futures
import csv
import io
import json
import os
import re
import tempfile
import time
import urllib.request
import zipfile

CACHE = os.environ.get("FLOW_CACHE", os.path.join(tempfile.gettempdir(), "zolva-flow"))
COINS = {"BTC": "BTCUSDT", "ETH": "ETHUSDT", "SOL": "SOLUSDT", "XRP": "XRPUSDT", "NEAR": "NEARUSDT", "ZEC": "ZECUSDT"}
START_MS = 1597190400000  # 2020-08-12, same as scripts/binance-history.mts
HOUR_MS = 3_600_000


def get(url: str, attempts: int = 5) -> bytes:
    for attempt in range(attempts):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "research-script"}), timeout=60) as response:
                return response.read()
        except Exception:
            if attempt == attempts - 1:
                raise
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(url)


def cvd(coin: str, symbol: str) -> None:
    path = os.path.join(CACHE, f"{coin}-cvd.json")
    if os.path.exists(path):
        return
    rows, start, now = [], START_MS, int(time.time() * 1000)
    while start < now:
        page = json.loads(get(f"https://data-api.binance.vision/api/v3/klines?symbol={symbol}&interval=1h&startTime={start}&limit=1000"))
        if not page:
            break
        rows += [[int(k[0]), float(k[7]), float(k[10])] for k in page]
        start = int(page[-1][0]) + HOUR_MS
        time.sleep(0.2)
    with open(path, "w") as f:
        json.dump(rows, f)
    print(coin, "cvd", len(rows), "hours")


def list_metric_files(symbol: str) -> list[str]:
    keys, marker = [], ""
    while True:
        xml = get(f"https://s3-ap-northeast-1.amazonaws.com/data.binance.vision?prefix=data/futures/um/daily/metrics/{symbol}/&marker={marker}").decode()
        found = re.findall(r"<Key>([^<]+\.zip)</Key>", xml)
        keys += found
        if "<IsTruncated>true</IsTruncated>" not in xml or not found:
            return keys
        marker = found[-1]


def one_day(key: str) -> list[list[float]]:
    data = get(f"https://data.binance.vision/{key}")
    out = {}
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        for name in archive.namelist():
            reader = csv.DictReader(io.TextIOWrapper(archive.open(name), "utf-8"))
            for row in reader:
                try:
                    ts = row["create_time"]
                    ms = calendar.timegm(time.strptime(ts, "%Y-%m-%d %H:%M:%S")) * 1000
                    value = float(row["sum_open_interest"])
                except (KeyError, ValueError):
                    continue
                hour = ms // HOUR_MS * HOUR_MS
                if hour not in out or ms >= out[hour][0]:
                    out[hour] = (ms, value)
    return [[hour, value] for hour, (_, value) in out.items()]


def oi(coin: str, symbol: str) -> None:
    path = os.path.join(CACHE, f"{coin}-oi.json")
    if os.path.exists(path):
        return
    keys = list_metric_files(symbol)
    rows = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        for part in pool.map(one_day, keys):
            rows += part
    rows.sort()
    with open(path, "w") as f:
        json.dump(rows, f)
    print(coin, "oi", len(keys), "days", len(rows), "hours")


if __name__ == "__main__":
    os.makedirs(CACHE, exist_ok=True)
    for coin, symbol in COINS.items():
        cvd(coin, symbol)
        oi(coin, symbol)
