# User guide — QR Tracker

QR Tracker is a free tool for creating QR codes and seeing how they are used: **no account
required, no personal data collected**.

👉 <https://titouanlegourrierec.github.io/qr-tracker/>

## Create a QR code

1. Open the **Create** page.
2. Paste the destination address (your web page, a form, an article…).
3. Give it a name if you want to find it later ("Hallway poster, building B").
4. Click **Create QR code** (an anti-bot check runs automatically).

You get:

- the **QR code**, as a **PNG** (high resolution, for printing) or an **SVG** (vector, for
  designers);
- the **short link** behind it;
- your **secret key**. ⚠️ It is shown only once: copy it somewhere safe (password manager,
  notes…), then tick **I have saved my secret key somewhere safe**; until you do, your
  browser asks for confirmation before you close or reload the page. Without the key, you
  cannot view the statistics or change the link;
- a **private statistics link** to bookmark: it holds the key after the `#`, which is never
  sent to the server.

The QR code is also added to **My QR codes**, but only in the browser where you created it
(the page tells you if your browser refused, e.g. in private browsing). The list shows each
code's number of scans, its last scan and whether it is disabled. **Export (JSON)** makes a
backup, or moves the list to another computer.

## View the statistics

Open your bookmarked **private link**, click _Statistics_ in **My QR codes**, or go to
**Statistics** and paste the private link (or enter the 7-character code and the secret
key).

The dashboard shows the number of scans; the visitors, each counted once per day (to
protect privacy nobody is recognized from one day to the next, so someone who scans on three
days counts three times); scans per day and per hour; the hour-of-day and day-of-week
patterns; a world map of scan locations (zoom and drag it); and the top countries, cities,
devices, operating systems, browsers and languages. Bots (WhatsApp or Slack link previews,
search-engine crawlers…) are left out unless you tick the box that includes them.
**Export scans (CSV)** downloads the anonymized per-scan data for Excel, R or Python.

Dates and times use your browser's time zone (shown under the filters) and date format. The
CSV covers the same days as the dashboard, but gives each scan's time in UTC (`scanned_at`,
ending in `Z`).

## Edit or delete

At the bottom of the statistics page you can:

- **change the destination** without reprinting: the same QR code points to the new
  address;
- **disable** the link for a while (scans show a "link disabled" page), then re-enable it;
- **permanently delete** the link and all its statistics. This cannot be undone and the
  printed QR code stops working; **My QR codes** then confirms the deletion.

## Share the statistics

To show the statistics to someone (a colleague, a client) without letting them change or
delete your QR code: on the statistics page, under **Share the statistics (read-only)**,
click **Create a read-only link** and copy it. Whoever opens it sees the dashboard and can
export the CSV, but has no management panel.

**Replace the read-only link** gives a new one (the previous link stops working); **Revoke**
turns it off. Your browser keeps the read-only link with the QR code in **My QR codes** and
its JSON export. In another browser, or if the link shown no longer works because it was
replaced elsewhere, replace it to get a new one.

## Report a QR code

If a QR code made with this service leads to a scam, malware or other harmful content, open
**Report abuse** (at the bottom of every page), paste the short link your phone showed
(…/r/ followed by 7 characters) and pick what is wrong. Reports are reviewed and harmful
links are blocked for everyone. Reporting needs no account and does not record who you are.

Destinations known to Google Safe Browsing as phishing or malware are refused when a QR code
is created or edited.

## Printing tips

- Print from the **PNG** (1024 px) or the **SVG**.
- Keep a white margin around the QR code, and test it with your phone before printing at
  scale.

## Privacy at a glance

No IP address or persistent identifier is ever kept; scan data is anonymous and deleted
after 12 months. Details: the site's **Privacy** page.

## Having trouble?

Write to <titouanlegourrierec@kaist.ac.kr> or open an
[issue](https://github.com/titouanlegourrierec/qr-tracker/issues).
