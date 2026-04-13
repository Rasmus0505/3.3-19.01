import re
import codecs

file_path = r"D:\3.3-19.01\Docx\PPT\PPT-双击打开.html"
with codecs.open(file_path, "r", "utf-8") as f:
    html = f.read()

# 确保所有slide都可见，之前的 flex-direction 可能导致高度溢出
html = html.replace("padding: 5% 10%;", "padding: 50px 100px; box-sizing: border-box;")

# Check if the JS is really scaling
if "const wrapper = document.getElementById('presentation-wrapper');" in html:
    print("JS Scale logic exists.")

# Write back
with codecs.open(file_path, "w", "utf-8") as f:
    f.write(html)
