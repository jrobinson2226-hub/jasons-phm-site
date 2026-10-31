# Monthly referral-agent scorecard for Jason (buyer's agents on his Team Pipeline files).
# usage: scorecard.py rows.json out.json [YYYY-MM]   (month defaults to last month)
# Writes out.json = {subject, body}. Counts: leads = files added; Real Deals = contract date (or move to Real Deal);
# fundings = Funded logged (or move to Closed); volume = loan amount on the file. Archived Dead files still count.
import json, sys, re, datetime as dt
from zoneinfo import ZoneInfo
CT = ZoneInfo('America/Chicago')
rows_f, out_f = sys.argv[1], sys.argv[2]
now = dt.datetime.now(CT)
if len(sys.argv) > 3: y, m = map(int, sys.argv[3].split('-'))
else:
    first = now.date().replace(day=1) - dt.timedelta(days=1); y, m = first.year, first.month
m_start = dt.date(y, m, 1); m_end = (m_start + dt.timedelta(days=32)).replace(day=1)
y_start = dt.date(y, 1, 1)

def parse(t):
    if not t: return None
    try:
        if re.match(r'^\d{4}-\d{2}-\d{2}$', str(t)): return dt.date.fromisoformat(str(t))
        return dt.datetime.fromisoformat(str(t).replace('Z', '+00:00')).astimezone(CT).date()
    except Exception: return None

def amt(v):
    try: n = float(re.sub(r'[^0-9.]', '', str(v or ''))); return n if n > 0 else 0
    except Exception: return 0

def money(n): return f'${n/1e6:.2f}M' if n >= 1e6 else f'${n:,.0f}'

deals = []
for r in json.load(open(rows_f)):
    if not r or not re.match(r'^lanes/[^/]+/deals/[^/]+$', str(r[0])): continue
    if len(r) > 4 and str(r[4]).upper() == 'TRUE': continue
    raw = ''.join((p[1:] if p.startswith('~') else p) for p in (str(x) for x in r[5:12]) if p)
    try: deals.append(json.loads(raw))
    except Exception: pass

def key(n): return re.sub(r'\s+', ' ', str(n or '')).strip().lower()
A = {}
for d in deals:
    k = key(d.get('agentName'))
    if not k: continue
    sd = d.get('stageDates') or {}
    lead = parse(d.get('createdAt')) or parse(d.get('stageSince'))
    real = parse(d.get('contractDate')) or parse(sd.get('realdeal'))
    fund = parse(d.get('fundedAt')) or (parse(sd.get('closed')) if d.get('stage') == 'closed' else None)
    a = A.setdefault(k, {'name': d['agentName'].strip(), 'm': [0, 0, 0, 0, 0], 'y': [0, 0, 0, 0, 0], 'last': None})
    for when, i, vol in ((lead, 0, False), (real, 1, True), (fund, 3, True)):
        if not when: continue
        a['last'] = max(a['last'], when) if a['last'] else when
        for bucket, lo in (('m', m_start), ('y', y_start)):
            if lo <= when < m_end:
                a[bucket][i] += 1
                if vol: a[bucket][i + 1] += amt(d.get('loanAmt'))

def row(a, b):
    l, r, rv, f, fv = a[b]
    return f"{l} lead{'s' if l != 1 else ''}, {r} Real Deal{'s' if r != 1 else ''}" + (f' ({money(rv)})' if rv else '') + \
           f", {f} funded" + (f' ({money(fv)})' if fv else '')

month_name = m_start.strftime('%B %Y')
active = sorted((a for a in A.values() if any(a['m'])), key=lambda a: (-a['m'][3], -a['m'][1], -a['m'][0], a['name']))
ytd = sorted((a for a in A.values() if any(a['y'])), key=lambda a: (-a['y'][3], -a['y'][4], -a['y'][0], a['name']))[:15]
quiet_cut = m_end - dt.timedelta(days=90)
quiet = sorted((a for a in A.values() if a['last'] and a['last'] < quiet_cut and a['y'][0] + a['y'][3] > 0), key=lambda a: a['last'], reverse=True)

L = ['Good morning, Jason!', '', f'Here is your referral-agent scorecard for {month_name}.', '']
L.append(f'{month_name.upper()} ({len(active)} agent{"s" if len(active) != 1 else ""} with activity)')
L += [f"- {a['name']}: {row(a, 'm')}" for a in active] or ['- No agent activity this month.']
L += ['', f'YEAR TO DATE, TOP {len(ytd)} (by fundings)']
L += [f"{i}. {a['name']}: {row(a, 'y')}" for i, a in enumerate(ytd, 1)] or ['- No agent activity yet this year.']
if quiet:
    L += ['', 'GONE QUIET (sent business this year, nothing in the last 90 days)']
    L += [f"- {a['name']}: last activity {a['last'].strftime('%b %-d')}" for a in quiet[:10]]
L += ['', 'Counts come from the buyer\'s agent on each Team Pipeline file. Volume is the loan amount on the file.',
      '', 'Open the dashboard: https://jasonhomeloan.com/pipeline']
json.dump({'subject': f'Agent scorecard: {month_name}', 'body': '\n'.join(L)}, open(out_f, 'w'), indent=1)
print(f'{len(active)} agents active in {month_name}; {len(ytd)} on the YTD list; {len(quiet)} gone quiet')
