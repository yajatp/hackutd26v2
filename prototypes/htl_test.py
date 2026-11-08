import sys,os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import json
from detect import load
H=os.path.join(os.environ.get('EOG_DIR', os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'eog-data')), 'history') + '/'
print('event      key_level key_htl | raw: level htl | smoothed(6 samples): level htl | baseline-inflow+smoothed htl')
errs={'raw':[],'smooth':[],'base':[]}
for fo in ['snapshot_2026-10-08T1200','snapshot_2026-10-09T0330','snapshot_2026-10-10T0900']:
    net,ops,ts,arr,_=load(H+fo); key=json.load(open(H+fo+'/answer_key.json'))
    fac={f['id']:f for s in net['systems'] for f in s['facilities']}
    shut=net['defaults']['tank_limits_pct']['shutdown']
    for k in key:
        if k.get('hours_to_limit_final') is None: continue
        f=fac[k['facility']]; cap=f['tank']['capacity_bbl']
        L=arr[(f['tank']['id'],'level_pct')]; I=arr[(f['id'],'inflow_bpd')]
        rate=lambda inflow: inflow/24/cap*100
        raw_l=L[-1]; raw_h=(shut-raw_l)/rate(I[-1])
        N=6; xs=list(range(-N+1,1)); ys=L[-N:]; mx=sum(xs)/N; my=sum(ys)/N
        b=sum((x-mx)*(y-my) for x,y in zip(xs,ys))/sum((x-mx)**2 for x in xs); sl=my+b*(0-mx)
        mi=sum(I[-N:])/N; sm_h=(shut-sl)/rate(mi)
        base=sum(w['baseline_water_bpd'] for w in f['wells']); bh=(shut-sl)/rate(base)
        errs['raw'].append(abs(raw_h-k['hours_to_limit_final'])); errs['smooth'].append(abs(sm_h-k['hours_to_limit_final'])); errs['base'].append(abs(bh-k['hours_to_limit_final']))
        print(f"{k['id']:9s} {k['level_final_pct']:6.1f} {k['hours_to_limit_final']:5.2f} | {raw_l:6.2f} {raw_h:5.3f} | {sl:6.2f} {sm_h:5.3f} | {bh:5.3f}")
for k,v in errs.items(): print(k,'max |htl err| %.3fh (%.1f min) mean %.3fh'%(max(v),max(v)*60,sum(v)/len(v)))
