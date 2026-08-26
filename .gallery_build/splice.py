#!/usr/bin/env python3
# Splice the rebuilt Event Gallery (CSS / HTML / JS) into the landing page.
import io, os, sys, time

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC  = os.path.join(os.path.dirname(ROOT), "edify-tutorial-landing.html")

def read(p):
    with io.open(p, "r", encoding="utf-8") as f:
        return f.read()

CSS  = read(os.path.join(ROOT, "gallery_css.txt")).rstrip("\n")
HTML = read(os.path.join(ROOT, "gallery_html.txt")).rstrip("\n")
JS   = read(os.path.join(ROOT, "gallery_js.txt")).rstrip("\n")

content = read(SRC)
orig_len = len(content)

# ---- backup ----
stamp = time.strftime("%Y%m%d-%H%M%S")
bak = SRC + ".bak-" + stamp
with io.open(bak, "w", encoding="utf-8") as f:
    f.write(content)

def fail(msg):
    print("ERROR:", msg); sys.exit(1)

# ---------- Region A: CSS ----------
mk = "NIRMAAN EVENT GALLERY — PREMIUM COMPONENT"
if content.count(mk) != 1: fail("CSS banner marker count != 1")
bstart = content.rfind("/*", 0, content.index(mk))
css_line_start = content.rfind("\n", 0, bstart) + 1
pricing = "/* ---------- pricing (fee register) ---------- */"
if content.count(pricing) != 1: fail("pricing marker count != 1")
p = content.index(pricing)
p_line_start = content.rfind("\n", 0, p) + 1
before = content[:css_line_start].rstrip()
after  = content[p_line_start:]
content = before + "\n\n" + CSS + "\n\n" + after

# ---------- Region B: HTML ----------
h0 = "<!-- NIRMAAN EVENT GALLERY -->"
h1 = "<!-- PRICING -->"
if content.count(h0) != 1: fail("HTML start marker count != 1")
if content.count(h1) != 1: fail("HTML end marker (PRICING) count != 1")
hs = content.rfind("\n", 0, content.index(h0)) + 1
he = content.rfind("\n", 0, content.index(h1)) + 1
before = content[:hs].rstrip()
after  = content[he:]
content = before + "\n\n" + HTML + "\n\n" + after

# ---------- Region C: JS ----------
jhead = "el.classList.add('in'); });"
if content.count(jhead) != 1: fail("JS head marker count != 1")
jh = content.index(jhead)
head_end = content.index("\n  }", jh) + len("\n  }")   # end of the reveal else-block
jend_mk = "})(); /* end Gallery IIFE */"
if content.count(jend_mk) != 1: fail("JS end marker count != 1")
je = content.index(jend_mk) + len(jend_mk)
before = content[:head_end]
after  = content[je:]
content = before + "\n\n" + JS + after

# ---------- validation ----------
checks = [
    ("no old section class", content.count("nirmaan-gallery-section") == 0),
    ("no old ngal- classes",  "ngal" not in content),
    ("no old CSS banner",     mk not in content),
    ("no old JS banner",      "EDIFY INTERACTIVE PARALLAX GALLERY" not in content),
    ("no old IIFE tag",       "end Gallery IIFE" not in content),
    ("new IIFE tag present",  content.count("/* end Event Gallery */") == 1),
    ("gallery anchor kept",   content.count('id="gallery"') == 1),
    ("9 gallery items",       content.count('class="egal-item"') == 9),
    ("9 data-index",          content.count('data-index="') == 9),
    ("lightbox present",      content.count('id="egalLb"') == 1),
    ("pricing intact",        content.count(pricing) == 1),
    ("PRICING html intact",   content.count(h1) == 1),
    ("body closed",           "</body>" in content and "</html>" in content),
    ("style block closed",    content.count("<style>") == 1 and content.count("</style>") == 1),
    ("one script block",      content.count("<script>") == 1 and content.count("</script>") == 1),
]
bad = [name for name, ok in checks if not ok]
if bad:
    fail("validation failed: " + "; ".join(bad))

with io.open(SRC, "w", encoding="utf-8") as f:
    f.write(content)

print("OK  backup:", os.path.basename(bak))
print("OK  size:", orig_len, "->", len(content), "(delta %+d)" % (len(content) - orig_len))
for name, ok in checks:
    print("  [pass]", name)
