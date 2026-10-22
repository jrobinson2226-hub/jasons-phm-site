Helper scripts used by Jason's scheduled Claude tasks to read and write the live Team Pipeline data
(the "docs" tab of the Team Pipeline Data Google Sheet), in the same row format the Apps Script server uses.

- sheetdoc.py: read one record, or build the row to write for it
- importer.py: turns DPA quiz lead emails into pipeline rows (new leads, notes on existing files)
