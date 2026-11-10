"""Local-only bounded parser. UI exports can ignore their date filter; enforce it here.
Raw in-window messages stay in a private temporary directory, never in the report.
"""
import sys, re, zipfile, json, hashlib, os
from pathlib import Path
from datetime import datetime, timezone, timedelta

path, key = Path(sys.argv[1]), sys.argv[2]
if not re.fullmatch(r'C\d{2}', key):
    raise ValueError('Use an anonymous chat key')
zone = timezone(timedelta(hours=-5))
start = datetime(2026,10,28,tzinfo=zone)
cutoff = datetime(2026,10,29,18,46,tzinfo=zone)
with zipfile.ZipFile(path) as archive:
    data = archive.read('chat.txt').decode('utf-8-sig')
    members = archive.namelist()
pattern = re.compile(r'^\[(\d+/\d+/\d+, \d+:\d+:\d+ [AP]M)\] (.*?)(?=^\[\d+/\d+/\d+, |\Z)', re.M|re.S)
records=[]; outside=0
for stamp, text in pattern.findall(data):
    at=datetime.strptime(stamp,'%m/%d/%y, %I:%M:%S %p').replace(tzinfo=zone)
    if not start <= at <= cutoff:
        outside+=1;continue
    text=text.strip()
    if text.startswith('- [Llamada]'):
        role='call';body='[Llamada]'
    else:
        author,sep,body=text.partition(': ')
        role='outbound_adviser' if author=='Tú' else 'inbound'
        if not sep: role='system';body=text
    media='audio' if '<mensaje de voz omitido>' in body else 'image' if '<imagen omitida>' in body else 'text'
    records.append({'key':key+'-'+str(len(records)+1).zfill(3),'at':at.isoformat(),'direction':role,'type':media,'body':body})
destination=Path('/tmp/veltia-business-audit-20261030')
destination.mkdir(mode=0o700,exist_ok=True)
os.chmod(destination,0o700)
private=destination/(key+'.json')
private.write_text(json.dumps(records,ensure_ascii=False,indent=2))
os.chmod(private,0o600)
summary={'chat':key,'source':'WhatsApp Web export, locally date-filtered',
 'zipSha256':hashlib.sha256(path.read_bytes()).hexdigest(),'files':members,
 'outOfWindowExcluded':outside,'withinWindow':len(records),
 'first':records[0]['at'] if records else None,'last':records[-1]['at'] if records else None,
 'byType':{k:sum(r['type']==k for r in records) for k in ['text','image','audio']},
 'byDirection':{k:sum(r['direction']==k for r in records) for k in ['inbound','outbound_adviser','call','system']},
 'mediaIncluded':any(n not in ['chat.txt','chat.md'] for n in members)}
(destination/(key+'-summary.json')).write_text(json.dumps(summary,indent=2))
print(json.dumps(summary,ensure_ascii=False))
