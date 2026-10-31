# 8 AM follow-up emails for Jason and Suzanne, from followups.mjs output.
# usage: morning.py followups.json emails.json <owner_email> <member_email>
# Writes emails.json = [{to, name, subject, body, due_today, past_due}] — one per person, skipped if they have nothing due.
# Only team members get these emails; no borrower or agent is ever emailed.
import json, sys, datetime as dt
from zoneinfo import ZoneInfo
CT = ZoneInfo('America/Chicago')
src, out_f, owner_email, member_email = sys.argv[1:5]
data = json.load(open(src))
now = dt.datetime.now(CT); today = now.date(); tomorrow = today + dt.timedelta(days=1)
# Monday's "tomorrow" is Tuesday; Friday's next workday is Monday
next_day = today + dt.timedelta(days=3 if today.weekday() == 4 else 1)

def parse(t):
    try: return dt.datetime.fromisoformat(str(t).replace('Z', '+00:00')).astimezone(CT)
    except Exception: return None

def line(i, show_time):
    d = parse(i['due'])
    who = i.get('borrower') or 'Task'
    stage = f" ({i['stage']})" if i.get('stage') else ''
    phone = f" · {i['phone']}" if i.get('phone') else ''
    when = d.strftime('%-I:%M %p') if show_time else 'was due ' + d.strftime('%a, %b %-d')
    return f"- {when} · {who}{stage}: {i['title']}{phone}"

emails = []
members = [p for p in data['people'] if p['role'] == 'member']
for p in data['people']:
    if p['role'] == 'owner': to, first = owner_email, 'Jason'
    elif members and p is members[0] and member_email: to, first = member_email, 'Suzanne'
    else: continue
    items = sorted((i for i in p['items'] if parse(i.get('due'))), key=lambda i: i['due'])
    past = [i for i in items if parse(i['due']).date() < today]
    due = [i for i in items if parse(i['due']).date() == today]
    nxt = [i for i in items if parse(i['due']).date() == next_day]
    if not past and not due: continue
    label = 'Monday' if next_day.weekday() == 0 else 'tomorrow'
    lines = [f'Good morning, {first}!', '']
    if past:
        lines.append(f'PAST DUE ({len(past)})'); lines += [line(i, False) for i in past]; lines.append('')
    if due:
        lines.append(f'TODAY ({len(due)})'); lines += [line(i, True) for i in due]; lines.append('')
    lines.append(f"Up next {label}: {len(nxt)} follow-up{'s' if len(nxt) != 1 else ''}.")
    lines += ['', 'Open the pipeline: https://jasonhomeloan.com/pipeline']
    parts = [f'{len(due)} due today'] + ([f'{len(past)} past due'] if past else [])
    emails.append({'to': to, 'name': first, 'due_today': len(due), 'past_due': len(past),
                   'subject': f"Your follow-ups for {now.strftime('%a, %b %-d')} ({', '.join(parts)})",
                   'body': '\n'.join(lines)})
json.dump(emails, open(out_f, 'w'), indent=1)
print('\n'.join(f"{e['name']}: {e['due_today']} due today, {e['past_due']} past due" for e in emails) or 'Nothing due for anyone today.')
