"""Exercise the built registrar explorer at a project subpath in Chromium."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import csv
import hashlib
import io
import json
import os
import shutil
import tempfile
import threading
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def main():
    screenshots = ROOT / "browser-checks"
    screenshots.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory() as temporary:
        shutil.copytree(ROOT / "dist", Path(temporary) / "example-tool")
        server = ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=temporary))
        threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH"))
                page = browser.new_page(viewport={"width": 1280, "height": 1000})
                errors = []
                page.on("pageerror", lambda error: errors.append(str(error)))
                # Exercise the CSV import and pagination without calling the publisher from CI.
                latest = json.loads((ROOT / "web/data/index.json").read_text())["quarters"][0]
                record = json.loads((ROOT / f"web/data/{latest}.json").read_text())
                buffer = io.StringIO()
                writer = csv.writer(buffer)
                writer.writerow(["Registrar IANA ID", "Registrar Name", "Registrar DUM", "Phishing Domains"])
                writer.writerows(record["rows"])
                writer.writerows((5000+i, f"Fixture {i}", 100000, 123) for i in range(12))
                full_csv = buffer.getvalue().encode()
                record.update(sha256=hashlib.sha256(full_csv).hexdigest(), publishedRows=len(record["rows"])+12)
                page.route(f"**/data/{latest}.json", lambda route: route.fulfill(json=record))
                page.goto(f"http://127.0.0.1:{server.server_port}/example-tool/")
                page.locator("#rows button").first.wait_for()
                assert page.locator("#rows tr").count() == 8
                assert page.locator("#next").is_disabled()
                page.locator("summary").click()
                page.locator("#file").set_input_files({"name": "unknown.csv", "mimeType": "text/csv", "buffer": b"unverified"})
                page.get_by_text("This file does not match an archived source.", exact=False).wait_for()
                page.locator("#file").set_input_files({"name": "source.csv", "mimeType": "text/csv", "buffer": full_csv})
                page.get_by_text("Loaded 20 registrar rows", exact=False).wait_for()
                page.locator("#next").click()
                assert "page 2" in page.locator("#count").inner_text()
                page.locator("summary").click()
                page.locator("#query").fill("1923")
                assert page.locator("#rows tr").count() == 1
                assert "Gname" in page.locator("#rows").inner_text()
                page.locator("#rows button").click()
                assert page.locator("#periods tr").count() >= 6
                assert "registrar=1923" in page.url
                page.reload()
                page.locator("#history").wait_for()
                page.locator("#close").click()
                page.locator("#query").fill("<img src=x onerror=alert(1)>")
                assert "No matching" in page.locator("#count").inner_text()
                assert page.locator("img").count() == 0
                page.locator("#query").fill("")
                page.locator("#period").select_option("2026-02-01")
                page.locator("#sort").select_option("rate")
                assert "2026-02-01" in page.url
                page.screenshot(path=str(screenshots / "desktop.png"), full_page=True)
                page.set_viewport_size({"width": 390, "height": 844})
                assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
                page.screenshot(path=str(screenshots / "mobile.png"), full_page=True)
                assert not errors, errors
                browser.close()
            print("Browser checks passed: project subpath, real data, filtering, pagination, history, share links and mobile layout")
        finally:
            server.shutdown()


if __name__ == "__main__":
    main()
