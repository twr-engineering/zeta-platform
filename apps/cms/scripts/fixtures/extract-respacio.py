"""
Extract the Respacio CRM golden-master fixtures from the production dump.

Source: wp_curl_info in zeta-group/_db/cwddmsp86-20260822-021406.sql.gz — the WordPress
plugin's permanent cache of every CRM call it made (1,554 rows, no TTL; PRD TF-03).

The dump is 89 MB and lives only on the capture machine, so its output is committed and
this script exists for provenance: re-run it only if the dump is re-pulled.

    python3 -I scripts/fixtures/extract-respacio.py ../zeta-group/_db/<dump>.sql.gz

Redaction. The fixtures ship in a shared repo, so they drop agent contact details and the
buyer/seller commission splits, and scrub e-mail addresses and phone numbers out of free
text. Nothing the public listing page renders as parity logic is removed.

Writes tests/fixtures/respacio/:
    listings.json      every distinct listing seen in a `properties` list response (latest wins)
    details/{ref}.json the `properties/view` response for each listing that resolved
    search-calls.json  every `properties` call: request params -> total + ordered ids (GM-SEARCH)
    filter-calls.json  every `properties/filter_property` call, same shape (GM-FILTER)
"""

import gzip
import json
import re
import sys
import urllib.parse
from pathlib import Path

OUT = Path(__file__).resolve().parents[2] / "tests" / "fixtures" / "respacio"
COLS = ["id", "ws_lang", "ws_name", "ws_url", "ws_data", "ws_response", "ws_datetime", "response_time"]
ESC = {"0": "\0", "n": "\n", "r": "\r", "t": "\t", "Z": "\x1a", "b": "\b"}

REDACT_KEYS = re.compile(
    r"^(agent_(phone|email|image|short_description)|landline_number|assign_user|"
    r".*commission.*|(buyer|seller)_tax_.*)$"
)
EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
PHONE = re.compile(r"(\+?63|0)9\d{2}[\s-]?\d{3}[\s-]?\d{4}")


def mysql_rows(values: str):
    """Parse the VALUES list of a mysqldump extended INSERT."""
    i, n = 0, len(values)
    while i < n:
        if values[i] != "(":
            i += 1
            continue
        i += 1
        row, field = [], None
        while True:
            c = values[i]
            if c == "'":
                i += 1
                buf = []
                while True:
                    c = values[i]
                    if c == "\\":
                        buf.append(ESC.get(values[i + 1], values[i + 1]))
                        i += 2
                    elif c == "'" and values[i + 1] == "'":
                        buf.append("'")
                        i += 2
                    elif c == "'":
                        i += 1
                        break
                    else:
                        buf.append(c)
                        i += 1
                field = "".join(buf)
            elif c in ",)":
                row.append(field)
                field = None
                i += 1
                if c == ")":
                    yield row
                    break
            else:
                j = i
                while values[j] not in ",)":
                    j += 1
                tok = values[i:j]
                field = None if tok == "NULL" else tok
                i = j


def redact(node):
    if isinstance(node, dict):
        return {k: ("[redacted]" if REDACT_KEYS.match(k) else redact(v)) for k, v in node.items()}
    if isinstance(node, list):
        return [redact(v) for v in node]
    if isinstance(node, str):
        return PHONE.sub("[phone]", EMAIL.sub("[email]", node))
    return node


def params(ws_data: str) -> dict:
    """Request params, preserving array keys (type[0], area[]) exactly as sent."""
    out: dict = {}
    for k, v in urllib.parse.parse_qsl(ws_data or "", keep_blank_values=True):
        out.setdefault(k, []).append(v)
    return {k: v[0] if len(v) == 1 else v for k, v in out.items()}


def main(dump: str) -> None:
    prefix = "INSERT INTO `wp_curl_info` VALUES "
    calls = []
    with gzip.open(dump, "rt", encoding="utf-8", errors="replace") as f:
        for line in f:
            if line.startswith(prefix):
                calls.extend(dict(zip(COLS, r)) for r in mysql_rows(line[len(prefix):]))

    listings: dict = {}
    details: dict = {}
    search_calls, filter_calls = [], []

    for c in sorted(calls, key=lambda c: int(c["id"])):
        try:
            res = json.loads(c["ws_response"])
        except (json.JSONDecodeError, TypeError):
            continue
        data = res.get("data") or {}
        if c["ws_name"] in ("properties", "properties/filter_property"):
            props = data.get("properties") or []
            for p in props:
                listings[p["id"]] = redact(p)
            entry = {
                "id": int(c["id"]),
                "at": c["ws_datetime"],
                "params": redact(params(c["ws_data"])),
                "total": res.get("total_records"),
                "ids": [p["id"] for p in props],
            }
            (search_calls if c["ws_name"] == "properties" else filter_calls).append(entry)
        elif c["ws_name"] == "properties/view" and data.get("property_details"):
            ref = data["property_details"][0]["reference_no"]
            details[ref] = redact(res)

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "details").mkdir(exist_ok=True)
    dump_json = lambda path, obj: path.write_text(json.dumps(obj, ensure_ascii=False, indent=1) + "\n")
    dump_json(OUT / "listings.json", sorted(listings.values(), key=lambda p: int(p["id"])))
    for ref, res in details.items():
        dump_json(OUT / "details" / f"{ref}.json", res)
    dump_json(OUT / "search-calls.json", search_calls)
    dump_json(OUT / "filter-calls.json", filter_calls)
    print(f"{len(calls)} calls -> {len(listings)} listings, {len(details)} details, "
          f"{len(search_calls)} search calls, {len(filter_calls)} filter calls")


if __name__ == "__main__":
    main(sys.argv[1])
