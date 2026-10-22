# sheetdoc.py get  <sheet.json> <path>             -> prints {"row","version","deleted","data"} or null
# sheetdoc.py line <sheet.json> <path> <data.json>  -> prints {"range" (or "append": true),"expect_version","values":[[...]]}
# sheet.json = the get_values result for docs!A2:L2000 ({"values":[...]} or the bare list); list row N is sheet row N+2
import json,sys,time
OWNER='u_2aDWsNc1cndxwjnlgJVlpA';CHUNK=40000;PARTS=7
cmd,sheet_f,path=sys.argv[1:4]
raw=json.load(open(sheet_f));rows=raw['values'] if isinstance(raw,dict) else raw
found=None
for i,r in enumerate(rows):
    if r and str(r[0])==path:
        s=''.join((str(p)[1:] if str(p).startswith('~') else str(p)) for p in r[5:12] if p)
        found={'row':i+2,'version':int(float(r[1] or 0)),'deleted':str(r[4] if len(r)>4 else '').upper()=='TRUE','data':json.loads(s) if s else None};break
if cmd=='get':print(json.dumps(found));sys.exit()
data=json.load(open(sys.argv[4]));j=json.dumps(data,separators=(',',':'),ensure_ascii=False)
parts=['~'+j[i:i+CHUNK] for i in range(0,len(j),CHUNK)];parts+=['']*(PARTS-len(parts))
v=(found['version']+1) if found else 1
out={'values':[[path,v,int(time.time()*1000),OWNER,False]+parts],'expect_version':found['version'] if found else None}
if found:out['range']=f"docs!A{found['row']}:L{found['row']}"
else:out['append']=True
print(json.dumps(out,ensure_ascii=False))
