import json, sys, time, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from detect import load, detect
H=os.path.join(os.environ.get('EOG_DIR', os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'eog-data')), 'history') + '/'
folders=sys.argv[1:] or ['full_week','snapshot_2026-10-08T1200','snapshot_2026-10-09T0330','snapshot_2026-10-10T0900','mock_test_2026-10-10T1530']
def fmt(h): return 'None' if h is None else f'{h:+.2f}h'
for fo in folders:
    t0=time.perf_counter()
    net,ops,ts,arr,tp=load(H+fo)
    ev,cal=detect(net,ops,ts,arr)
    t1=time.perf_counter()
    print(f'===== {fo}: parse {tp:.2f}s, parse+detect {t1-t0:.2f}s, now={ts[-1]}, detected {len(ev)}')
    kp=H+fo+'/answer_key.json'
    if not os.path.exists(kp):
        for e in ev:
            print('  ',e['category'],e['asset_id'],time.strftime('%m-%d %H:%M',time.gmtime(e['onset_unix'])),
                  'end',time.strftime('%m-%d %H:%M',time.gmtime(e['end_unix'])) if e['end_unix'] else 'ONGOING',
                  'det',time.strftime('%m-%d %H:%M',time.gmtime(e['detected_unix'])) if e.get('detected_unix') else '',
                  'level',e.get('level_pct'),'htl',None if e.get('hours_to_limit') is None else round(e['hours_to_limit'],2))
        json.dump(ev,open(f'out_{fo}.json','w'),indent=1)
        continue
    key=json.load(open(kp))
    used=set(); per={}
    for k in key:
        c=k['category']; per.setdefault(c,{'tp':0,'fn':0,'fp':0,'onset_err':[],'end_err':[],'status_ok':0})
        best=None
        for j,e in enumerate(ev):
            if j in used or e['category']!=c or e['asset_id']!=k['asset']: continue
            ke=k['end_unix'] or 10**12; ee=e['end_unix'] or 10**12
            if e['onset_unix']<ke and k['onset_unix']<ee:
                best=j;break
        if best is None:
            per[c]['fn']+=1; print('   MISS',k['id'],c,k['asset'],k['status']); continue
        used.add(best); e=ev[best]; per[c]['tp']+=1
        oe=(e['onset_unix']-k['onset_unix'])/3600
        ee=None if (e['end_unix'] is None or k['end_unix'] is None) else (e['end_unix']-k['end_unix'])/3600
        per[c]['onset_err'].append(oe); 
        if ee is not None: per[c]['end_err'].append(ee)
        if e['status']==k['status']: per[c]['status_ok']+=1
        extra=''
        if c=='pump_failure':
            if k.get('trips_at_unix') and e.get('trips_at_unix_pred'):
                extra+=f" trips_at err {(e['trips_at_unix_pred']-k['trips_at_unix'])/60:+.0f}min"
            elif k.get('trips_at_unix') is None:
                extra+=f" key never trips; pred htl@onset={e['hours_to_limit_at_onset']:.2f}h (repair 6h)"
            extra+=f" level@onset key={k.get('level_pct')} ours={e['level_onset_pct']:.1f}"
            if k.get('hours_to_limit_final') is not None:
                extra+=f" | NOW htl key={k['hours_to_limit_final']} ours={e.get('hours_to_limit') and round(e['hours_to_limit'],2)} level key={k['level_final_pct']} ours={e.get('level_pct')}"
        det=''
        if e.get('detected_unix'): det=f" detect_lag={(e['detected_unix']-k['onset_unix'])/3600:.2f}h"
        print(f"   {k['id']:9s} {c:17s} {k['asset']:14s} onset_err={fmt(oe)} end_err={fmt(ee)} status key={k['status']} ours={e['status']}{det}{extra}")
    for j,e in enumerate(ev):
        if j not in used:
            per.setdefault(e['category'],{'tp':0,'fn':0,'fp':0,'onset_err':[],'end_err':[],'status_ok':0})['fp']+=1
            print('   FALSE POS',e['category'],e['asset_id'],e['onset_unix'],e['end_unix'])
    for c,d in per.items():
        tp,fn,fp=d['tp'],d['fn'],d['fp']
        P=tp/(tp+fp) if tp+fp else float('nan'); R=tp/(tp+fn) if tp+fn else float('nan')
        oe=[abs(x) for x in d['onset_err']]; ee=[abs(x) for x in d['end_err']]
        print(f"  {c:17s} TP={tp} FP={fp} FN={fn} precision={P:.2f} recall={R:.2f} status_match={d['status_ok']}/{tp} "
              f"|onset err| mean={sum(oe)/len(oe) if oe else 0:.2f}h max={max(oe) if oe else 0:.2f}h |end err| mean={sum(ee)/len(ee) if ee else 0:.2f}h max={max(ee) if ee else 0:.2f}h")
