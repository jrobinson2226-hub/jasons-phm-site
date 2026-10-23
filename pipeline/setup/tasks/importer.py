# usage: importer.py sheet.json emails.json out.json
# sheet.json: the get_values result for docs!A2:L2000 ({"values":[...]} or the bare list); row N of the list is sheet row N+2
# emails.json: [{"threadId","date","subject","body"}]
# out.json: {"updates":[{"range","values","expect_version","path"}], "appends":[[...]], "summary":[...]}
import json,os,re,sys,random,string,time,datetime as dt
from zoneinfo import ZoneInfo
CT=ZoneInfo('America/Chicago');OWNER='u_2aDWsNc1cndxwjnlgJVlpA';CHUNK=40000;PARTS=7
sheet_f,emails_f,out_f=sys.argv[1:4]
now=dt.datetime.now(CT);NOWMS=int(time.time()*1000)
raw=json.load(open(sheet_f));rows=raw['values'] if isinstance(raw,dict) else raw
def iso(d):return d.astimezone(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.000Z')
def quiet(d):
    # quiet hours: weeknights 8 PM-9 AM and the weekend (Fri 8 PM - Mon 9 AM)
    if d.hour>=20:d=(d+dt.timedelta(days=1)).replace(hour=9,minute=0,second=0,microsecond=0)
    elif d.hour<9:d=d.replace(hour=9,minute=0,second=0,microsecond=0)
    if d.weekday()>=5:d=(d+dt.timedelta(days=7-d.weekday())).replace(hour=9,minute=0,second=0,microsecond=0)
    return d
def nine(days):return (now+dt.timedelta(days=days)).replace(hour=9,minute=0,second=0,microsecond=0)
def uid():return 'q'+''.join(random.choice(string.ascii_lowercase+string.digits) for _ in range(12))
def d10(p):d=re.sub(r'\D','',str(p or ''));return d[-10:] if len(d)>=10 else ''
def fmtp(p):d=d10(p);return f'({d[:3]}) {d[3:6]}-{d[6:]}' if d else (p or '')
def parse(r):
    s=''.join((str(p)[1:] if str(p).startswith('~') else str(p)) for p in r[5:12] if p)
    try:return json.loads(s) if s else None
    except Exception:return None
docs={}
for i,r in enumerate(rows):
    if not r or not r[0]:continue
    docs[str(r[0])]={'row':i+2,'version':int(float(r[1] or 0)),'deleted':str(r[4] if len(r)>4 else '').upper()=='TRUE','data':parse(r)}
def line(path,data,version):
    j=json.dumps(data,separators=(',',':'),ensure_ascii=False)
    parts=['~'+j[i:i+CHUNK] for i in range(0,len(j),CHUNK)]
    if len(parts)>PARTS:raise SystemExit('record too large: '+path)
    return [path,version,NOWMS,OWNER,False]+parts+['']*(PARTS-len(parts))
updates=[];appends=[];summary=[]
def put(path,data):
    cur=docs.get(path)
    updates[:]=[u for u in updates if u['path']!=path];appends[:]=[a for a in appends if a[0]!=path]
    if cur:updates.append({'path':path,'range':f"docs!A{cur['row']}:L{cur['row']}",'expect_version':cur['version'],'values':[line(path,data,cur['version']+1)]})
    else:appends.append(line(path,data,1))
ONLINE=[('min',5,'Call + text: first contact',0),('min',125,'Call + text: second attempt today',1),('d',2,'Call',0),('d',3,'Text',0),('d',5,'Call + text',0),('d',7,'Text',0),('d',10,'Last call, then move to Nurture or Dead',0)]
def cadence():
    out=[]
    for kind,n,t,same in ONLINE:
        d=quiet(now+dt.timedelta(minutes=n) if kind=='min' else nine(n))
        x={'id':uid(),'title':t,'due':iso(d),'owner':OWNER,'done':False,'kind':'cadence','stage':'lead'}
        if same:x['sameDay']=1
        out.append(x)
    return out
deals=[(p,v['data']) for p,v in docs.items() if re.match(r'^lanes/[^/]+/deals/[^/]+$',p) and not v['deleted'] and v['data']]
agents=((docs.get('agents/list') or {}).get('data') or {}).get('list') or []
emails=json.load(open(emails_f))
digest_add=[]
for em in emails:
    b=em['body'];g=lambda k:(re.search(r'^'+k+r':\s*(.*)$',b,re.M) or [None,''])[1].strip()
    name,phone,email,timeline,agent=g('Name'),g('Phone'),g('Email').lower(),g('Timeline'),g('Agent')
    looking,programs=g('Looking in'),g('Programs shown')
    if not name:summary.append(f"Skipped an email with no name ({em.get('subject','')})");continue
    if re.search(r'test',name+' '+em['subject'],re.I) or d10(phone).startswith('555555'):
        summary.append(f'Skipped test submission: {name}');continue
    kit=bool(re.search(r'Rate Survival Kit',em.get('subject','')+' '+b,re.I))
    F='the Rate Survival Kit form' if kit else 'the DPA quiz';V='Filled out' if kit else 'Took'
    when=dt.datetime.fromisoformat(em['date'].replace('Z','+00:00')).astimezone(CT)
    info=(f"{V} {F} on {when.strftime('%a %b %-d, %-I:%M %p')}. Timeline: {timeline or '-'}. "+(f"Interested in: {programs or '-'}." if kit else f"Looking in: {looking or '-'}. Programs shown: {programs or '-'}."))+(f" Agent field: {agent}." if agent and agent.lower() not in ('none listed','-') else '')
    matches=[(p,d) for p,d in deals if (d10(phone) and d10(d.get('phone'))==d10(phone)) or (email and (d.get('email') or '').lower()==email)]
    nowiso=iso(now)
    if not matches:
        ag=next((a for a in agents if agent and len(agent)>3 and agent.lower() in a.get('n','').lower()),None)
        did=uid();tasks=cadence()
        deal={'id':did,'name':name,'phone':fmtp(phone),'email':email,'source':'Online','agentName':ag['n'] if ag else '','agentEmail':(ag or {}).get('e',''),'agentPhone':fmtp((ag or {}).get('p','')),
          'stage':'lead','stageSince':nowiso,'stageDates':{'lead':nowiso},'program':'','contractDate':'','closeDate':'','closeTime':'','piw':False,'milestones':{},'tasks':tasks,
          'notes':[{'at':nowiso,'by':OWNER,'text':f'Auto-added from {F}. '+info}],'lastDisposition':'','lastTouchAt':None,'lane':OWNER,
          'createdAt':nowiso,'createdBy':OWNER,'updatedAt':nowiso,'updatedBy':OWNER}
        path=f'lanes/{OWNER}/deals/{did}';put(path,deal);deals.append((path,deal))
        digest_add.append(dict(title=tasks[0]['title'],due=tasks[0]['due'],borrower=name,phone=fmtp(phone),stage='Lead',kind='Follow-up',dealId=did))
        summary.append(f'New lead added: {name}');continue
    matches.sort(key=lambda x:x[1].get('stage') in ('dead','closed'))
    path,d=matches[0];d=json.loads(json.dumps(d));st=d.get('stage');tasks=list(d.get('tasks') or []);notes=list(d.get('notes') or [])
    if email and not d.get('email'):d['email']=email
    if d10(phone) and not d.get('phone'):d['phone']=fmtp(phone)
    new=[]
    if st in ('nurture','dead'):
        tasks=[t for t in tasks if t.get('done')]+cadence();new=tasks[-7:-6]
        d.update({'stage':'lead','stageSince':nowiso,'stageDates':{**(d.get('stageDates') or {}),'lead':nowiso},'pqInactive':False})
        notes.append({'at':nowiso,'by':OWNER,'text':f'Back in Lead from {st.title()}: {V.lower()} {F}. '+info})
        summary.append(f'{d["name"]}: moved from {st.title()} back to Lead (' + ('Rate Survival Kit' if kit else 'took the quiz') + ')')
    else:
        notes.append({'at':nowiso,'by':OWNER,'text':(f'{V} {F} again. ' if any(F[4:] in n.get('text','') for n in notes) else '')+info})
        open_q=[t for t in tasks if not t.get('done') and t.get('title','').startswith(('Took the DPA quiz','FYI: took the DPA quiz','Rate Survival Kit lead','FYI: filled out the Rate Survival Kit'))]
        if not open_q:
            title=(('Rate Survival Kit lead: call now' if kit else 'Took the DPA quiz: call now') if st in ('lead','opp') else ('FYI: filled out the Rate Survival Kit form' if kit else 'FYI: took the DPA quiz')+' (already in '+{'prequal':'PreQual','preapproval':'PreApproved','realdeal':'Real Deal','closed':'Closed Loan'}.get(st,st)+')')
            t={'id':uid(),'title':title+(f' (timeline: {timeline})' if timeline else ''),'due':iso(quiet(now)),'owner':OWNER,'done':False,'kind':'manual','stage':st}
            tasks.append(t);new=[t]
        summary.append(f'{d["name"]}: already in pipeline ({st}); note added'+(' + follow-up' if new else ''))
    d['tasks']=tasks;d['notes']=notes[-200:];d['updatedAt']=nowiso;d['updatedBy']=OWNER
    put(path,d);deals[:]=[(p2,(d if p2==path else d2)) for p2,d2 in deals]
    stage_name={'lead':'Lead','opp':'Opportunity','prequal':'PreQual','preapproval':'PreApproved','realdeal':'Real Deal','closed':'Closed Loan','nurture':'Lead','dead':'Lead'}.get(st,st)
    digest_add+=[dict(title=t['title'],due=t['due'],borrower=d['name'],phone=fmtp(d.get('phone') or phone),stage=stage_name,kind='Follow-up',dealId=d['id']) for t in new]
dg=docs.get('digest/'+OWNER)
if digest_add and dg and dg['data']:
    dd=dg['data'];dd['items']=(dd.get('items') or [])+digest_add;dd['updatedAt']=iso(now);put('digest/'+OWNER,dd)
q=(docs.get('imports/quiz') or {}).get('data') or {'note':'Gmail thread ids of DPA quiz emails already handled.','processed':[]}
q['processed']=([e['threadId'] for e in emails]+[x for x in q.get('processed',[]) if x not in [e['threadId'] for e in emails]])[:300];q['lastRun']=iso(now)
put('imports/quiz',q)
json.dump({'updates':updates,'appends':appends,'summary':summary},open(out_f,'w'),ensure_ascii=False)
print('\n'.join(summary) or 'Nothing to import')
print(f'{len(updates)} row update(s), {len(appends)} new row(s)')
