Helper scripts used by Jason's scheduled Claude tasks to read and write the live Team Pipeline data
(the "docs" tab of the Team Pipeline Data Google Sheet), in the same row format the Apps Script server uses.

- sheetdoc.py: read one record, or build the row to write for it
- importer.py: turns DPA quiz lead emails into pipeline rows (new leads, notes on existing files)
- summary.py: the 5 PM referral-partner emails (skips internal notes)
- followups.mjs: runs the live pipeline page headless on the sheet data to list each person's open follow-ups (read-only)
- morning.py: turns followups.mjs output into the 8 AM follow-up emails for Jason and Suzanne
- scorecard.py: the monthly referral-agent scorecard email
