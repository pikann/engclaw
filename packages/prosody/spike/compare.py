"""usage: compare.py ref.json ts.json  -> parity metrics per file"""
import json, sys, numpy as np
a, b = json.load(open(sys.argv[1])), json.load(open(sys.argv[2]))
print(f"{'file':14}{'frames':>7}{'voiced%':>8}{'agree%':>8}{'f0 corr':>9}{'MAE cents':>10}{'rms r':>8}{'ts ms':>7}{'xRT':>6}")
for k in a:
    ra, rb = a[k], b[k]
    n = min(len(ra['voiced']), len(rb['voiced']))
    va, vb = np.array(ra['voiced'][:n]), np.array(rb['voiced'][:n])
    fa = np.array([np.nan if v is None else v for v in ra['f0'][:n]])
    fb = np.array([np.nan if v is None else v for v in rb['f0'][:n]])
    both = (va == 1) & (vb == 1)
    corr = np.corrcoef(fa[both], fb[both])[0, 1] if both.sum() > 2 else float('nan')
    cents = np.abs(1200 * np.log2(fa[both] / fb[both]))
    rc = np.corrcoef(ra['rms'][:n], rb['rms'][:n])[0, 1]
    print(f"{k:14}{n:7}{va.mean()*100:8.1f}{(va==vb).mean()*100:8.1f}{corr:9.4f}{cents.mean():10.2f}{rc:8.5f}{rb['ms']:7.0f}{rb['seconds']*1000/rb['ms']:6.1f}")
    if len(ra['voiced']) != len(rb['voiced']): print('  frame count mismatch', len(ra['voiced']), len(rb['voiced']))
