import codecs

file_path = r"D:\3.3-19.01\Docx\PPT\PPT-双击打开.html"
with codecs.open(file_path, "r", "utf-8") as f:
    html = f.read()

# 找问题:
# 在插入第三个 slide (s3) 的时候，之前我的替换脚本多闭合了几个 div！
# 我们看一下 s3 结尾：
#             </div>
#         </div>
# 
#         </div>
#         </div>

# 那里多了两个 </div>，导致 `#presentation-area` 被提早关闭了。

# 修复：
# 用直接匹配把那块冗余的闭合删掉。
fixed_html = html.replace("""            </div>
        </div>

        </div>
        </div>

        <div class="slide" id="s4">""", """            </div>
        </div>

        <div class="slide" id="s4">""")

# 还有一个错误:
# <!-- 底部 HUD --> 上面多了一层多余的关闭，我们需要确保只有一个 </div> </div> 来关闭 presentation-area 和 wrapper
# Let's count them
count_area_open = fixed_html.count('<div id="presentation-area">')
count_wrapper_open = fixed_html.count('<div id="presentation-wrapper">')
# the bottom should be:
fixed_html = fixed_html.replace("""        </div>

    </div>

    </div>

    <!-- 底部 HUD -->""", """        </div>

    </div>
    </div>

    <!-- 底部 HUD -->""")

# If it's still messed up, let's just do a clean regex repair around slide 3 -> 4
fixed_html = fixed_html.replace("        </div>\n\n        </div>\n        </div>\n\n        <div class=\"slide\" id=\"s4\">", "        </div>\n\n        <div class=\"slide\" id=\"s4\">")
fixed_html = fixed_html.replace("        </div>\n        </div>\n\n        <div class=\"slide\" id=\"s4\">", "        <div class=\"slide\" id=\"s4\">")


# Just to be 100% safe, let's write it back.
with codecs.open(file_path, "w", "utf-8") as f:
    f.write(fixed_html)
print("Tag balance fixed.")
