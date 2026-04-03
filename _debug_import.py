import sys, os, shutil
for k in list(sys.modules.keys()):
    if 'app' in k:
        del sys.modules[k]
for root, dirs, files in os.walk('app/api'):
    for f in list(files):
        if f.endswith('.pyc'):
            try: os.remove(os.path.join(root, f))
            except: pass
    for d in list(dirs):
        if d == '__pycache__':
            try: shutil.rmtree(os.path.join(root, d))
            except: pass

print('sys.modules for admin:')
for k in sorted(sys.modules.keys()):
    if 'routers.admin' in k:
        v = sys.modules[k]
        print('  %s -> %s (type=%s)' % (k, getattr(v, '__name__', repr(v)), type(v).__name__))

print()
print('importing...')
_admin_top = __import__("app.api.routers.admin", fromlist=["router"])
print('result:', type(_admin_top).__name__)
print('has router attr:', hasattr(_admin_top, 'router'))
