# User guide — QR Tracker

QR Tracker is a free tool for creating QR codes and tracking how they are used,
**without accounts and without personal data**.

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
  manager, notes…). Without it, you cannot view the statistics or modify the link;
- a **private statistics link** to bookmark: it contains the key after the `#`, which is
  never sent to the server.

The QR code is also added to **My QR codes** — but only in the browser where you created
it. Use **Export (JSON)** to make a backup or move it to another computer.

## View the statistics

Three ways:

- open your bookmarked **private link**;
- go through **My QR codes** → _Statistics_;
- or **Statistics** → enter the code (7 characters) and the secret key.

You will find: the number of scans, unique visitors (a per-day estimate), scans per day
and per hour, the hour-of-day and day-of-week distributions, and the top countries,
cities, devices, operating systems, browsers, languages and networks. Bots (WhatsApp or
Slack link previews, search-engine crawlers…) are excluded by default — a checkbox lets
you include them. The **Export scans (CSV)** button downloads the anonymous detail for
Excel/R/Python.

## Edit or delete

At the bottom of the statistics page you can:

- **change the destination** without reprinting the QR code (the same QR code will point
  to the new address);
- temporarily **disable** the link (scans show a "link disabled" page), then re-enable
  it;
- **permanently delete** the link and all of its statistics (irreversible — the printed
  QR code will stop working).

## Printing tips

- Download the **PNG** (1024 px) or the **SVG** for printing.
- Keep a white margin around the QR code and test it with your phone before sending it
  to print.

## Privacy in short

No IP address or persistent identifier is ever kept; scan data is anonymous and deleted
after 12 months. Details: the site's **Privacy** page.

## Problems?

Open an issue: <https://github.com/titouanlegourrierec/qr-tracker/issues>
