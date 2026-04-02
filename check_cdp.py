import http.client
import json
import urllib.request

# Get page info
conn = http.client.HTTPConnection("127.0.0.1", 9224)
conn.request("GET", "/json")
resp = conn.getresponse()
pages = json.loads(resp.read())
print("Pages:", json.dumps(pages, indent=2))
conn.close()

if not pages:
    print("No pages found")
    exit()

page = pages[0]
ws_url = page.get("webSocketDebuggerUrl")
print("\nWebSocket URL:", ws_url)

# Now use the DevTools URL with Edge
devtools_url = page.get("devtoolsFrontendUrl")
if devtools_url:
    full_url = f"http://127.0.0.1:9224{devtools_url}"
    print("DevTools URL:", full_url)
