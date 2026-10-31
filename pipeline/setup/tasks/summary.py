# 5 PM referral-partner summaries for Jason's Team Pipeline.
# usage: summary.py rows.json out.json [YYYY-MM-DD]
# rows.json: the "values" array from the docs tab, rows of [path, version, updatedAt, by, deleted, part1..part7]
# Internal notes (status checklist items, Add note, Skip, Never reached, Contract fell through, PreQual status changes,
# pace changes, contract details) never go to agents: they carry "internal" in the app, and older ones are caught by prefix.
import json, sys, re, datetime as dt
from zoneinfo import ZoneInfo
CT = ZoneInfo('America/Chicago')
rows_f, out_f = sys.argv[1], sys.argv[2]
now = dt.datetime.now(CT)
today = dt.date.fromisoformat(sys.argv[3]) if len(sys.argv) > 3 else now.date()
STAGES = {'lead': 'Lead', 'opp': 'Opportunity', 'prequal': 'Prequal', 'preapproval': 'Preapproval',
          'realdeal': 'Under contract', 'nurture': 'Long-term nurture'}
SKIP_NOTE = re.compile(r'^(Emailed |Agent email NOT sent|Referral thank-you|Skipped: |Note - |Done: |PreQual status|'
                       r'Check-in pace|Disclosures not received|Marked Inactive|Automatically moved|Inactive PreQual|'
                       r'Contract details entered|Never reached|Contract fell through|Closing moved|Funded|Canceled)')
AGENT_EMAILED = re.compile(r'^Emailed ')

def parse(t):
    try: return dt.datetime.fromisoformat(str(t).replace('Z', '+00:00')).astimezone(CT)
    except Exception: return None

def when(d):
    return d.strftime('%a, %b %-d at %-I:%M %p').replace(':00 ', ' ')

def internal(n):
    return bool(n.get('internal')) or bool(SKIP_NOTE.match(n.get('text', '') or ''))

deals = {}
for r in json.load(open(rows_f)):
    if not r or not re.match(r'^lanes/[^/]+/deals/[^/]+$', str(r[0])): continue
    if len(r) > 4 and str(r[4]).upper() == 'TRUE': continue
    raw = ''.join((p[1:] if p.startswith('~') else p) for p in (str(x) for x in r[5:12]) if p)
    try: d = json.loads(raw)
    except Exception: continue
    at = float(r[2] or 0) if len(r) > 2 else 0
    if d.get('id') and (d['id'] not in deals or at > deals[d['id']][0]): deals[d['id']] = (at, d)

agents = {}
for _, d in deals.values():
    stage, email = d.get('stage'), (d.get('agentEmail') or '').strip().lower()
    if d.get('archived') or stage not in STAGES or not re.match(r'^[^@\s]+@[^@\s]+\.[^@\s]+$', email): continue
    notes = sorted((n for n in d.get('notes') or [] if parse(n.get('at')) and parse(n['at']).date() == today),
                   key=lambda n: n['at'])
    # an instant agent email already covered everything logged before it
    last_mail = max((i for i, n in enumerate(notes) if AGENT_EMAILED.match(n.get('text', ''))), default=-1)
    fresh = [re.sub(r'^Where things stand:\s*', '', n['text'].strip()) for n in notes[last_mail + 1:]
             if n.get('text') and not internal(n)]
    created = parse(d.get('createdAt'))
    is_new = bool(created and created.date() == today and last_mail < 0)
    if not (is_new or fresh): continue
    nxt = sorted(parse(t['due']) for t in d.get('tasks') or []
                 if not t.get('done') and parse(t.get('due')) and parse(t['due']) > now)
    a = agents.setdefault(email, {'to': email, 'name': d.get('agentName') or '', 'borrowers': []})
    a['borrowers'].append({'name': d.get('name') or 'Your client', 'stage': STAGES[stage], 'new': is_new,
                           'today': fresh, 'next': when(nxt[0]) if nxt else ''})

out = []
for a in agents.values():
    first = (a['name'].split() or ['there'])[0]
    lines = [f'Hi {first}!', '', "Here's today's update on your referral" + ('s' if len(a['borrowers']) > 1 else '') + ':', '']
    for b in sorted(a['borrowers'], key=lambda b: b['name'].lower()):
        lines.append(f"- {b['name']}: {b['stage']}" + (' (new today!)' if b['new'] else ''))
        for t in b['today']: lines.append(f'  Today: {t}')
        if b['new'] and not b['today']: lines.append("  Today: Got their info and I'm reaching out now.")
        if b['next']: lines.append(f"  Next follow-up: {b['next']}")
        lines.append('')
    lines += ["Thanks for the referrals! Let me know if you have any questions.", '',
              'Jason Robinson', 'Sr. Loan Officer | Prosperity Home Mortgage', 'NMLS 1008330',
              '(913) 687-7247 | jason.robinson@phmloans.com']
    out.append({'to': a['to'], 'agent': a['name'], 'borrowers': [b['name'] for b in a['borrowers']],
                'subject': "Your referrals: today's update", 'body': '\n'.join(lines)})
json.dump(out, open(out_f, 'w'), indent=1)
print(f'{len(out)} agent email(s) to send' + (': ' + ', '.join(o['agent'] or o['to'] for o in out) if out else ' (no new leads or updates today)'))
