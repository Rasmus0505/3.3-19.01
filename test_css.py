import codecs
file_path = r"D:\3.3-19.01\Docx\PPT\PPT-双击打开.html"
with codecs.open(file_path, "r", "utf-8") as f:
    html = f.read()

import re
match = re.search(r'#presentation-wrapper[\s\S]*?\}', html)
if match:
    print(match.group(0))

match2 = re.search(r'#presentation-area[\s\S]*?\}', html)
if match2:
    print(match2.group(0))

