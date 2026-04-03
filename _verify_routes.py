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

from app.main import create_app
app = create_app()

admin_routes = []
for r in app.routes:
    if hasattr(r, 'path') and '/api/admin/' in r.path:
        admin_routes.append((list(getattr(r, 'methods', [])), r.path))
admin_routes.sort()

print('=== Admin API routes (%d total) ===' % len(admin_routes))
for m, p in admin_routes:
    print('  %s %s' % (m, p))

print()
ann = [(list(r.methods), r.path) for r in app.routes if hasattr(r, 'path') and 'announcement' in r.path]
print('Announcement routes (%d):' % len(ann))
for m, p in ann:
    print('  %s %s' % (m, p))

print()
delete_routes = [(list(r.methods), r.path) for r in app.routes if hasattr(r, 'methods') and 'DELETE' in r.methods and '/api/admin/' in r.path]
print('DELETE admin routes (%d):' % len(delete_routes))
for m, p in delete_routes:
    print('  DELETE %s' % p)
