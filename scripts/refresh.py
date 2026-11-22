"""Refresh public Interisle registrar measurements. Run before the offline build."""
import calendar
from concurrent.futures import ThreadPoolExecutor
import csv
import hashlib
from datetime import date, datetime
from html.parser import HTMLParser
from io import StringIO
import json
from pathlib import Path
import re
from urllib.request import Request, urlopen

SOURCE = "https://www.cybercrimeinfocenter.org"
REPOSITORY = SOURCE + "/records-repository"
OUTPUT = Path(__file__).resolve().parents[1] / "web" / "data"
COMPARISON_IDS = {69, 146, 303, 472, 1068, 1479, 1923, 3862}
FILENAME = re.compile(r"/s/Phishing-RegistrarStats-([A-Za-z]{3}\d{4})-([A-Za-z]{3}\d{4})\.csv", re.I)


class SourceLinks(HTMLParser):
    def __init__(self):
        super().__init__()
        self.files = set()

    def handle_starttag(self, tag, attrs):
        href = dict(attrs).get("href", "")
        if tag == "a" and FILENAME.fullmatch(href):
            self.files.add(href)


def read_url(url):
    request = Request(url, headers={"User-Agent": "CoolCode RegistrarWatch/1.0 (public aggregates)"})
    with urlopen(request, timeout=45) as response:
        result = response.read(6_000_001)
    if len(result) > 6_000_000:
        raise ValueError("Unexpectedly large source")
    return result


def measurements(text):
    rows = []
    ids = set()
    for row in csv.DictReader(StringIO(text)):
        identifier = int(row["Registrar IANA ID"])
        if identifier in {9998, 9999}:  # Registry operator acting as registrar
            continue
        name = row["Registrar Name"].strip()
        portfolio = int(row["Registrar DUM"])
        domains = int(row["Phishing Domains"])
        if not name or identifier <= 0 or identifier in ids or portfolio <= 0 or domains < 0:
            raise ValueError(f"Invalid registrar row: {identifier}")
        ids.add(identifier)
        rows.append([identifier, name, portfolio, domains])
    if not rows:
        raise ValueError("Source has no registrar measurements")
    return sorted(rows)


def quarter(href):
    start, end = (datetime.strptime(x, "%b%Y").date() for x in FILENAME.fullmatch(href).groups())
    if (end.year - start.year) * 12 + end.month - start.month != 2:
        raise ValueError(f"Expected a three-month interval: {href}")
    end = end.replace(day=calendar.monthrange(end.year, end.month)[1])
    return start.isoformat(), end.isoformat()


def retrieve(href):
    start, end = quarter(href)
    raw = read_url(SOURCE + href)
    rows = measurements(raw.decode("utf-8-sig"))
    if len(rows) < 40:
        raise ValueError(f"Unexpectedly short table: {href}")
    return start, {"start": start, "end": end, "source": SOURCE + href, "sha256": hashlib.sha256(raw).hexdigest(),
                   "publishedRows": len(rows), "rows": [r for r in rows if r[0] in COMPARISON_IDS]}


def save_json(path, value):
    temp = path.with_suffix(".tmp")
    temp.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    temp.replace(path)


def main():
    parser = SourceLinks()
    parser.feed(read_url(REPOSITORY).decode("utf-8-sig"))
    hrefs = sorted(h for h in parser.files if quarter(h)[0] >= "2025-02-01")
    with ThreadPoolExecutor(max_workers=4) as pool:
        data = dict(pool.map(retrieve, hrefs))
    if len(data) < 6 or len(data) != len(hrefs):
        raise ValueError("Missing periods or duplicate quarters")
    OUTPUT.mkdir(parents=True, exist_ok=True)
    index = OUTPUT / "index.json"
    previous = json.loads(index.read_text()) if index.exists() else {}
    if not set(previous.get("quarters", [])) <= data.keys():
        raise ValueError("Source dropped a previously published quarter")
    changed = False
    for start, record in sorted(data.items()):
        path = OUTPUT / (start + ".json")
        if not path.exists() or json.loads(path.read_text()) != record:
            save_json(path, record)
            changed = True
    if changed or not index.exists():
        save_json(index, {"updated": date.today().isoformat(), "quarters": sorted(data, reverse=True)})
    print(f"{len(data)} quarters; {sum(len(row['rows']) for row in data.values())} registrar observations")


if __name__ == "__main__":
    main()
