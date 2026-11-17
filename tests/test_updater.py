import os,sys,json,io,zipfile,tempfile,importlib.util
from unittest.mock import patch
from pathlib import Path
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root/'app'))
import release, updater

def item(channel,version, asset=True, **extra):
    name='customer-followup-%s-v%s.zip'%(channel,version)
    return {'tag_name':channel+'-v'+version,'assets':[{'name':name,'browser_download_url':'https://example.invalid/'+name,'size':42}] if asset else [],**extra}
def run(items,channel='with-intro'):
    with patch.object(release,'UPDATE_CHANNEL',channel),patch.object(updater,'_fetch',return_value=json.dumps(items).encode()):return updater.check()
items=[item('no-intro','9.0.0'),item('with-intro','1.5.0'),item('with-intro','9.0.0',prerelease=True),item('with-intro','2.0.0',draft=True)]
r=run(items);assert r['latest']=='1.5.0' and r['has_update'] and 'with-intro' in r['asset']['name'],r
r=run(items,'no-intro');assert r['latest']=='9.0.0' and 'no-intro' in r['asset']['name'],r
r=run([item('with-intro','1.5.0',False)]);assert not r['has_update'] and r['asset'] is None and r['error'],r
r=run([item('with-intro','1.4.0')]);assert not r['has_update'] and not r['error'],r
pages=[([item('no-intro','1.4.0')]*100),[item('with-intro','1.6.0')]]
with patch.object(release,'UPDATE_CHANNEL','with-intro'),patch.object(updater,'_fetch',side_effect=[json.dumps(p).encode() for p in pages]):assert updater.check()['latest']=='1.6.0'
with tempfile.TemporaryDirectory() as tmp:
    p=Path(tmp); b=io.BytesIO()
    with zipfile.ZipFile(b,'w') as z:
        z.writestr('package/app/release.py','VERSION = "1.5.0"\n')
        z.writestr('package/app/new.py','ok = 1\n')
        z.writestr('package/tools/tool.py','ok = 1\n')
        z.writestr('package/data/crm.db','BAD')
        z.writestr('package/app/../data/crm.db','BAD')
    data=p/'data';data.mkdir();(data/'crm.db').write_text('SAFE')
    app=p/'app';app.mkdir();(app/'release.py').write_text('VERSION = "1.4.0"\n')
    upd=data/'updates'; staging=upd/'staging'
    with patch.object(updater,'UPD_DIR',str(upd)),patch.object(updater,'STAGING',str(staging)),patch.object(updater.urllib.request,'urlopen',return_value=io.BytesIO(b.getvalue())):
        assert updater.prepare({'url':'https://example.invalid/file.zip'})==3
    assert not (staging/'data').exists() and (data/'crm.db').read_text()=='SAFE'
    sys.argv=['update_helper.py',str(p)]
    spec=importlib.util.spec_from_file_location('safe_helper',root/'app/update_helper.py');helper=importlib.util.module_from_spec(spec);spec.loader.exec_module(helper)
    helper.wait_port_free=lambda:True
    assert helper.main()==0
    assert (data/'crm.db').read_text()=='SAFE'
    assert (app/'release.py').read_text()=='VERSION = "1.5.0"\n'
    assert (p/'app.bak/release.py').read_text()=='VERSION = "1.4.0"\n'
print('PASS: channel isolation, release ordering, paging, missing package, data protection, update replacement and backup')

