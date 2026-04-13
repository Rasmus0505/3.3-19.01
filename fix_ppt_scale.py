import re
import codecs

file_path = r"D:\3.3-19.01\Docx\PPT\PPT-双击打开.html"
with codecs.open(file_path, "r", "utf-8") as f:
    html = f.read()

# 1. Update CSS
css_old = """        #presentation-area {
            position: relative;
            width: 100vw;
            height: calc(100vh - 80px);
            overflow: hidden;
        }"""

css_new = """        #presentation-wrapper {
            position: relative;
            width: 100vw;
            height: calc(100vh - 80px);
            overflow: hidden;
            display: flex;
            justify-content: center;
            align-items: center;
        }
        #presentation-area {
            position: absolute;
            width: 1920px;
            height: 1080px;
            overflow: hidden;
            transform-origin: center center;
        }"""

html = html.replace(css_old, css_new)
if "#presentation-wrapper" not in html:
    # Just in case the exact replacement failed, do a regex replacement
    html = re.sub(
        r"#presentation-area\s*\{[^}]*\}",
        css_new,
        html
    )

# 2. Add the wrapper div in HTML
html = html.replace('<div id="presentation-area">', '<div id="presentation-wrapper">\n    <div id="presentation-area">')

# Close the wrapper div right before the HUD
html = html.replace('<!-- 底部 HUD -->', '</div>\n\n    <!-- 底部 HUD -->')

# 3. Add JS for scaling
js_scale = """
        function handleResize() {
            const wrapper = document.getElementById('presentation-wrapper');
            const area = document.getElementById('presentation-area');
            const scale = Math.min(wrapper.clientWidth / 1920, wrapper.clientHeight / 1080);
            area.style.transform = `scale(${scale})`;
        }
        window.addEventListener('resize', handleResize);
        handleResize(); // init
"""

if "handleResize()" not in html:
    html = html.replace("const counterEl = document.getElementById('currentSlideNum');", 
                        "const counterEl = document.getElementById('currentSlideNum');\n" + js_scale)

# Save back
with codecs.open(file_path, "w", "utf-8") as f:
    f.write(html)
print("Scaling patch applied.")
