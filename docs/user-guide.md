# User guide — QR Tracker

QR Tracker is a free tool for creating QR codes and tracking how they are used —
**no account required, no personal data collected**.

👉 <https://titouanlegourrierec.github.io/qr-tracker/>

## Create a QR code

1. Open the **Create** page.
2. Paste the destination address (your web page, a form, an article…).
3. Give it a name if you want to find it later ("Hallway poster, building B").
4. Click **Create QR code** (an anti-bot check runs automatically).

You get:

- the **QR code**, downloadable as **PNG** (high resolution, for printing) or **SVG**
  (vector, for designers);
- the **short link** behind the QR code;
- your **secret key** — ⚠️ it is shown only once. Copy it somewhere safe (password
  manager, notes…), then tick **I have saved my secret key somewhere safe**: until you do,
  your browser asks for confirmation before you close or reload the page. Without the key,
  you cannot view the statistics or modify the link;
- a **private statistics link** to bookmark: it contains the key after the `#`, which is
  never sent to the server.

The QR code is also added to **My QR codes** — but only in the browser where you created
it (the page tells you if your browser refused, e.g. in private browsing). Use
**Export (JSON)** to make a backup or move it to another computer.

## View the statistics

Three ways:

- open your bookmarked **private link**;
- open **My QR codes** and click _Statistics_;
- or **Statistics** → enter the code (7 characters) and the secret key.

The dashboard shows: the number of scans, unique visitors (a per-day estimate), scans per
day and per hour, the hour-of-day and day-of-week distributions, a world map of scan
locations (zoom and drag to explore it), and the top countries, cities, devices, operating
systems, browsers and languages. Bots (WhatsApp or Slack link previews, search-engine
crawlers…) are excluded by default — a checkbox lets you include them. The **Export scans
(CSV)** button downloads the anonymized per-scan data for Excel/R/Python.

## Edit or delete

At the bottom of the statistics page you can:

- **change the destination** without reprinting the QR code (the same QR code will point
  to the new address);
- temporarily **disable** the link (scans show a "link disabled" page), then re-enable
  it;
- **permanently delete** the link and all of its statistics (irreversible — the printed
  QR code will stop working).

## Report a QR code

If a QR code made with this service leads to a scam, malware or other harmful content,
open **Report abuse** (at the bottom of every page), paste the short link your phone showed
(…/r/ followed by 7 characters) and pick what is wrong. Reports are reviewed, and harmful
links are blocked for everyone. Reporting needs no account and does not record who you
are.

Destinations known to Google Safe Browsing as phishing or malware are refused when a QR
code is created or edited.

## Printing tips

- Download the **PNG** (1024 px) or the **SVG** for printing.
- Keep a white margin around the QR code and test it with your phone before printing it
  at scale.

## Privacy at a glance

No IP address or persistent identifier is ever kept; scan data is anonymous and deleted
after 12 months. Details: the site's **Privacy** page.

## Having trouble?

Write to <titouanlegourrierec@kaist.ac.kr> or open an issue:
<https://github.com/titouanlegourrierec/qr-tracker/issues>
