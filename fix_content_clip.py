import re
import codecs

file_path = r"D:\3.3-19.01\Docx\PPT\PPT-双击打开.html"
with codecs.open(file_path, "r", "utf-8") as f:
    html = f.read()

# Increase container sizes just in case elements overlap
css_bento = r"\.bento\s*\{[^}]*\}"
match = re.search(css_bento, html)
if match:
    bento_css = match.group(0)
    if "box-sizing" not in bento_css:
        bento_css = bento_css.replace("}", "    box-sizing: border-box;\n}")
        html = html.replace(match.group(0), bento_css)

# Ensure slides take up exactly the 1920x1080 resolution
css_slide = r"\.slide\s*\{\s*display:\s*none\s*!important;\s*width:\s*100%;\s*height:\s*100%;"
if re.search(css_slide, html):
    html = re.sub(r"width:\s*100%;\s*height:\s*100%;", "width: 1920px; height: 1080px;", html)

with codecs.open(file_path, "w", "utf-8") as f:
    f.write(html)
print("Content clipping CSS fixed.")
