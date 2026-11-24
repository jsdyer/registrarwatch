# RegistrarWatch

Compare selected quarterly measurements of reported phishing across generic top-level domain registrars. [Open RegistrarWatch on CoolCode](https://coolcode.ca/registrarwatch/).

<!-- coolcode:guide -->
Search a registrar name or IANA ID, then select its row to compare quarters. Rates are per 10,000 managed gTLD domains. Start with eight tracked registrars or load the publisher’s original CSV locally to explore all published registrar rows for that quarter.
<!-- /coolcode:guide -->

## Source and coverage

Interisle Consulting Group publishes quarterly aggregate registrar tables through its [Cybercrime Information Center](https://www.cybercrimeinfocenter.org/records-repository). The built-in cohort includes Gname and PublicDomainRegistry for attraction-impersonation research, plus Tucows, GoDaddy, Dynadot, NameCheap, NameSilo and Spaceship for comparison. The same eight IANA IDs are selected across quarters regardless of rank. To explore the full table, download the linked publisher CSV and import it locally. The browser verifies the SHA-256 against the original download and associates the file with its reporting period. Reloading clears imported data. Each quarter links to its original CSV. The source measurements are global. Search terms stay in the browser. Selecting a registrar or a reporting period adds its public ID or date to the shareable URL.

The archive starts in February 2025. Each quarter keeps the registrar's published name for that period. History joins observations by IANA ID, and excludes the reserved registry-operator IDs 9998 and 9999. Totals cover the loaded cohort or imported table before filtering. Use the publisher's [methodology](https://interisle.net/research-methodology) and source CSV when comparing against other datasets. Coverage depends on feeds and inclusion criteria. For example, the May–July 2026 published comparison covers registrars with at least 30,000 domains managed and 25 reported phishing domains.

A domain can reappear in successive quarters. Compromised sites also count as phishing domains. The data supplies no case-level geography, victim counts, complaints to an authority or registrar mitigation times. The adjacent [AbusePulse](https://coolcode.ca/abusepulse/) and [ATIP Explorer](https://coolcode.ca/atip/) support research on those questions.

## Refresh and build

The refresh workflow checks the publisher on the 7th and 21st of each month. A changed snapshot is tested and committed before dispatching the normal Pages workflow. Run `python3 scripts/refresh.py` to discover new complete quarters, check their structure, and update the checked-in measurements when the source changes. The snapshot date is the last content change. `data/index.json.checked_at` records every successful source check, including unchanged quarters; it is the watchdog freshness field. For older captures without that field, the offline build uses the known content-change day at midnight UTC, never the current build time. The static build requires no credentials or network. A missing or malformed source aborts the refresh before replacing the candidate data.

```sh
node --test tests/*.test.mjs
python3 -m unittest discover -s tests -v
python3 scripts/build.py
python3 -m http.server --directory dist 8000
```

The Pages workflow tests the app in Chromium and deploys the built project on a push to main. Run the local browser checks with `python3 tests/browser_smoke.py` after installing Playwright and Chromium. Optionally set `CHROMIUM_PATH` to a local Chromium executable.

<!-- schedule-reliability -->
## Schedule reliability

Public GitHub repositories can have scheduled workflows disabled after 60 days of inactivity. A separate weekly [schedule guard](.github/workflows/schedule-guard.yml) calls GitHub's enable-workflow API for an explicit list of refresh workflows and itself. It can restore workflows disabled for inactivity, preserves manually disabled workflows, and runs independently of collection failures.

This is an interim mitigation, not a scheduling guarantee: GitHub does not document active-workflow renewal as a permanent exemption, and scheduled runs can be delayed or dropped. A scheduler on our own Linux server is the planned independent trigger. The guard does not collect data, create dummy commits, or change source/check timestamps; successful collection and published data freshness still need monitoring.
<!-- /schedule-reliability -->
