"""NON-NORMATIVE prototype used on 2026-10-29 to check that the §12 targets are reachable.
Simplified (no jitter, coarse calibration, condensed state machine). docs/PLAN.md wins on every detail."""
import math, sys, numpy as np, rrcf

C = dict(rpmRated=3800, vRated=12, vStart=4.0, tauUp=0.8, tauDown=2.5, iIdle=0.03, iAero=0.15, iFric=0.40,
         iInrushMax=0.33, iInrushGain=0.15, iRipple=0.01, fricSpeedLoss=0.25, fricCoast=0.6, blades=7, ppr=2,
         u0=2.0, rUnb=28, mMount=0.25, bladePass=0.02, amb=25, ohMax=35, heatFrac=0.35, rTh0=18, airCool=0.5, cTh=15,
         mpuNoise=0.007, dlpf=184, accSens=0.185, accNoise=0.005, adcVmin=0.075, adcSpan=3.05, adcNoise=2, adcInl=6,
         probeTau=8, iMax=0.30, tMax=60.0, nCrit=5, nClear=3, hyst=0.8)
dt = 0.0005
wR = C['rpmRated'] * 2 * math.pi / 60

def run(script, T_end, model=None, seed=1, collect=False):
    rng = np.random.default_rng(seed)
    phi2, phi3 = rng.uniform(0, 2*math.pi, 2)
    w = 0.0; th = 0.0; T = C['amb'] + C['heatFrac']*12*0.18*C['rTh0']/(1+C['airCool']); Tp = T
    faults = dict(imb=0.0, loose=0.0, fric=0.0, oh=0.0, loss=0.0)
    ramps = {}
    relay = False; state = 'OFF'; t = 0.0
    lp = np.zeros(3)
    alpha = dt/(1/(2*math.pi*C['dlpf'])+dt)
    feats = []; states = []; Ts = []; lastValid = None; first = True
    counts0 = None; t_state = 0; consec = 0; clr = 0; iLim = 0; reason=None
    pulses_prev = 0
    verdict = None; scores=[]
    acts = sorted(script)
    while t < T_end:
        # window of 1 s
        N = 2000
        for a in [a for a in acts if t <= a[0] < t+1]:
            if a[1] == 'START' and state == 'OFF': state = 'CAL'; t_state = a[0]
            elif a[1] == 'RESET' and state == 'CRIT': state='OFF'
            else:
                k, v, r = a[1], a[2], a[3]
                if r: ramps[k] = (a[0], faults[k], v, r)
                else: faults[k] = v
        thetas = np.empty(N); ws = np.empty(N); Is = np.empty(N)
        pulses = 0
        for n in range(N):
            tt = t + n*dt
            for k,(t0,v0,v1,r) in list(ramps.items()):
                f = min(1, max(0,(tt-t0)/r)); faults[k] = v0+(v1-v0)*f
            if state == 'CAL' and tt - t_state >= 0.5: state = 'START'; t_state = tt
            relay = state in ('START','NORMAL','WARN')
            V = 12.0 if relay else 0.0
            fr = faults['fric']
            if V >= C['vStart']:
                wt = wR*min(1.15, (V-C['vStart'])/(C['vRated']-C['vStart']))*(1-C['fricSpeedLoss']*fr)
                w += (wt-w)/C['tauUp']*dt
            else:
                wt = 0; w += -w/(C['tauDown']*(1-C['fricCoast']*fr))*dt
            th += w*dt
            r_ = w/wR
            if V >= C['vStart']:
                I = C['iIdle']+C['iAero']*r_**3+C['iFric']*fr*r_
                inr = C['iInrushGain']*max(0, 1-w/wt) if wt>0 else 0
                if inr > 0: I = min(C['iInrushMax'], I+inr)
            else: I = 0.0
            Pheat = C['heatFrac']*V*I
            Rth = C['rTh0']/(1+C['airCool']*r_)
            Tamb = C['amb']+faults['oh']*C['ohMax']
            T += (Pheat-(T-Tamb)/Rth)/C['cTh']*dt
            Tp += (T-Tp)/C['probeTau']*dt
            thetas[n] = th; ws[n] = w; Is[n] = I + C['iRipple']*math.sin(4*th)*(1 if V>0 else 0)
        # vibration vectorised
        A1 = (C['u0'] + faults['imb']*C['rUnb'])*1e-6*ws**2/(C['mMount']*9.80665)
        L = faults['loose']; G = 1+1.5*L; B = C['bladePass']*(ws/wR)**2
        ax = G*A1*np.cos(thetas)+0.5*L*A1*np.cos(2*thetas+phi2)+0.25*L*A1*np.cos(3*thetas+phi3)+0.3*B*np.sin(7*thetas)
        ay = G*A1*np.sin(thetas)+0.5*L*A1*np.sin(2*thetas+phi2)+0.25*L*A1*np.sin(3*thetas+phi3)+0.3*B*np.cos(7*thetas)+1.0
        az = 0.2*G*A1*np.cos(thetas+math.pi/4)+B*np.sin(7*thetas)
        if L > 0:
            ph = np.mod(thetas, 2*math.pi); tsince = ph/np.maximum(ws,1)
            imp = 2*L*A1*np.exp(-tsince/0.002)*np.sin(2*math.pi*300*tsince)
            ax += imp; ay += imp
            ax += rng.normal(0,0.04*L,N); ay += rng.normal(0,0.04*L,N); az += rng.normal(0,0.04*L,N)
        acc = np.stack([ax,ay,az])
        out = np.empty_like(acc)
        for n in range(N):
            lp += alpha*(acc[:,n]-lp); out[:,n] = lp
        smp = out[:, ::2] + rng.normal(0, C['mpuNoise'], (3, N//2))
        smp = np.clip(np.round(smp*16384)/16384, -2, 2)
        # current chain
        Vout = 2.5 + C['accSens']*Is[::2] + rng.normal(0, C['accNoise'], N//2)
        Vpin = Vout*2/3
        cnt = np.clip(np.round(4095*(Vpin-C['adcVmin'])/C['adcSpan'] + C['adcInl']*np.sin(math.pi*Vpin/3.1) + rng.normal(0,C['adcNoise'],N//2)),0,4095)
        if counts0 is None and state in ('START','CAL'): counts0 = np.mean(np.clip(np.round(4095*(2.5*2/3-C['adcVmin'])/C['adcSpan'] + C['adcInl']*math.sin(math.pi*2.5*2/3/3.1) + rng.normal(0,C['adcNoise'],1000)),0,4095))
        c0 = counts0 if counts0 is not None else cnt.mean()
        i_cal = (cnt - c0)*(C['adcSpan']/4095)/(2/3)/C['accSens']
        d = smp - smp.mean(axis=1, keepdims=True)
        arms = math.sqrt(np.mean(np.sum(d**2,axis=0)))
        cf = max(np.max(np.abs(d[k]))/max(1e-6, math.sqrt(np.mean(d[k]**2))) for k in range(3))
        irms = math.sqrt(np.mean(i_cal**2))
        # T reading
        reading = round(Tp/0.0625)*0.0625
        if first: reading = 85.0; first = False
        else: lastValid = reading
        Ts.append((t+1, lastValid))
        vs = [(a,b) for a,b in Ts if b is not None and a > t+1-60]
        dtdt = (np.polyfit([a for a,_ in vs],[b for _,b in vs],1)[0]*60) if len(vs)>=10 else None
        p_total = int(th/(2*math.pi)*C['ppr']); rpm = (p_total-pulses_prev)*60/C['ppr']; pulses_prev = p_total
        t += 1
        f = dict(a=arms, cf=cf, i=irms, T=lastValid, dtdt=dtdt, rpm=rpm)
        # firmware limits/state
        if state == 'START' and t - t_state >= 10: state = 'NORMAL'
        alert = clear = False; sc=None
        if model is not None and None not in f.values() and state in ('NORMAL','WARN') and faults['loss'] < 1:
            sc, dom = model.score(f); alert = sc > model.thr; clear = sc < C['hyst']*model.thr
            scores.append((t, sc, dom, alert))
        if state in ('NORMAL','WARN','START'):
            iLim = iLim+1 if irms > (C['iMax'] if state!='START' else 0.4) else 0
            if lastValid is not None and lastValid > C['tMax']: state='CRIT'; reason=('T_MAX',t)
            elif iLim >= 3: state='CRIT'; reason=('I_MAX',t)
        if state == 'NORMAL' and alert: state='WARN'; consec=1; clr=0
        elif state == 'WARN':
            if alert: consec+=1; clr=0
            elif clear: clr+=1; consec=0
            if consec >= C['nCrit']: state='CRIT'; reason=('RCF',t)
            elif clr >= C['nClear']: state='NORMAL'
        feats.append(f); states.append((t,state,rpm,irms,lastValid))
    return feats, states, scores, reason

KEYS = ['a','cf','i','T','dtdt','rpm']
FLOOR = dict(a=0.005, cf=0.05, i=0.002, T=0.1, dtdt=0.05, rpm=15)
class Model:
    def __init__(self, pts, keys=KEYS, ntree=40, seed=7, thrF=1.25):
        self.keys = keys
        X = np.array([[p[k] for k in keys] for p in pts])
        tr, ho = X[:120], X[120:180]
        self.mu = tr.mean(0); self.sd = np.maximum(tr.std(0), [FLOOR[k] for k in keys])
        Z = (tr-self.mu)/self.sd
        np.random.seed(seed)
        self.forest = []
        for _ in range(ntree):
            tree = rrcf.RCTree()
            for i,z in enumerate(Z): tree.insert_point(z, index=i)
            self.forest.append(tree)
        self.n = len(tr); self.thr = 0.5
        self.hs = [self.score(dict(zip(keys,h)))[0] for h in ho]
    def score(self, f):
        z = (np.array([f[k] for k in self.keys])-self.mu)/self.sd
        s = 0
        for tree in self.forest:
            tree.insert_point(z, index='tmp'); s += tree.codisp('tmp'); tree.forget_point('tmp')
        return s/len(self.forest)/self.n, self.keys[int(np.argmax(np.abs(z)))]

if __name__ == '__main__':
    feats, states, _, _ = run([(0,'START')], 196, seed=11)
    base = [f for (f,s) in zip(feats,states) if s[0] > 15][:180]
    print('healthy example', {k: (round(v,4) if v is not None else None) for k,v in base[-1].items()})
    import statistics as st
    for k in KEYS: print(k, 'mean', round(st.mean(b[k] for b in base),4), 'sd', round(st.pstdev(b[k] for b in base),4))
    keys = KEYS if len(sys.argv) < 2 else sys.argv[1].split(',')
    m = Model(base, keys=keys)
    print('thr', m.thr, 'holdout max', round(max(m.hs),3))
    sc = {
      'S1 baseline': ([(0,'START')], 600),
      'S2 imbalance': ([(0,'START'),(60,'imb',0.3,0)], 120),
      'S3 looseness': ([(0,'START'),(60,'loose',0.6,0)], 120),
      'S4 friction': ([(0,'START'),(60,'fric',0.5,30)], 140),
      'S5 overheat': ([(0,'START'),(60,'oh',1.0,0)], 140),
      'S6 wifi+overheat': ([(0,'START'),(30,'loss',1.0,0),(60,'oh',1.0,0)], 420),
    }
    for name,(scr,T) in sc.items():
        feats, states, scores, reason = run(scr, T, model=m, seed=99)
        alerts = [s for s in scores if s[3]]
        firstA = alerts[0] if alerts else None
        crit = next((s for s in states if s[1]=='CRIT'), None)
        mx = max(s[1] for s in scores if s[0] < (60 if 'baseline' not in name else 1e9)) if scores else None
        print(f"{name}: maxPreFault={mx and round(mx,3)} alerts={len(alerts)} first={firstA and (firstA[0], round(firstA[1],2), firstA[2])} trip={reason} ")
        if name.startswith('S2'):
            ct = reason[1]; print('   rpm 15s after trip', [s[2] for s in states if s[0]==ct+15])
            print('   a_rms ratio', round(feats[61]['a']/feats[50]['a'],2), 'I change %', round(100*(feats[61]['i']/feats[50]['i']-1),2))
        if name.startswith('S4'):
            print('   friction feats @70', {k: round(v,3) for k,v in feats[69].items()}, 'healthy', {k: round(v,3) for k,v in feats[50].items()})
