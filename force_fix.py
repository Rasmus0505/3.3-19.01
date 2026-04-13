import re
import codecs

file_path = r"D:\3.3-19.01\Docx\PPT\PPT-双击打开.html"
with codecs.open(file_path, "r", "utf-8") as f:
    html = f.read()

# I noticed from the grep output that the end of s3 had extra div closures:
#         </div>
# 
#         </div>
#         </div>
# 
#         <div class="slide" id="s4">

# I will replace any sequence of multiple </div> closures before <div class="slide" id="s4"> with a clean one
html = re.sub(r'</div>\s*</div>\s*</div>\s*<div class="slide" id="s4">', '</div>\n\n        <div class="slide" id="s4">', html)

# And before the HUD, make sure there are exactly two </div> tags closing presentation-area and presentation-wrapper
html = re.sub(r'(</div>\s*)+<!-- 底部 HUD -->', '</div>\n    </div>\n\n    <!-- 底部 HUD -->', html)

with codecs.open(file_path, "w", "utf-8") as f:
    f.write(html)
print("Regex fixed.")
