#!/usr/bin/env python3
# Splice v2: replace the v1 masonry Event Gallery with the "Live Reel" marquee.
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

# ---------- Region A: CSS (gallery banner -> pricing comment) ----------
css_mk  = "EVENT GALLERY — cinematic parallax component"
pricing = "/* ---------- pricing (fee register) ---------- */"
if content.count(css_mk) != 1: fail("CSS banner marker count != 1 (%d)" % content.count(css_mk))
if content.count(pricing) != 1: fail("pricing marker count != 1")
bstart = content.rfind("/*", 0, content.index(css_mk))
css_line_start = content.rfind("\n", 0, bstart) + 1
p = content.index(pricing)
p_line_start = content.rfind("\n", 0, p) + 1
content = content[:css_line_start].rstrip() + "\n\n" + CSS + "\n\n" + content[p_line_start:]

# ---------- Region B: HTML (gallery comment -> PRICING comment) ----------
h0 = "<!-- NIRMAAN EVENT GALLERY -->"
h1 = "<!-- PRICING -->"
if content.count(h0) != 1: fail("HTML start marker count != 1")
if content.count(h1) != 1: fail("HTML end marker (PRICING) count != 1")
hs = content.rfind("\n", 0, content.index(h0)) + 1
he = content.rfind("\n", 0, content.index(h1)) + 1
content = content[:hs].rstrip() + "\n\n" + HTML + "\n\n" + content[he:]

# ---------- Region C: JS (gallery IIFE banner -> end marker) ----------
js_mk   = "EVENT GALLERY — cinematic parallax + full-screen lightbox"
jend_mk = "})(); /* end Event Gallery */"
if content.count(js_mk) != 1: fail("JS banner marker count != 1 (%d)" % content.count(js_mk))
if content.count(jend_mk) != 1: fail("JS end marker count != 1")
jbanner = content.index(js_mk)
jstart_comment = content.rfind("/*", 0, jbanner)
js_line_start = content.rfind("\n", 0, jstart_comment) + 1
je = content.index(jend_mk) + len(jend_mk)
content = content[:js_line_start].rstrip() + "\n\n" + JS + content[je:]

# ---------- validation ----------
idx_ok = all(('data-index="%d"' % i) in content for i in range(9))
checks = [
    ("gallery anchor kept",        content.count('id="gallery"') == 1),
    ("reel container present",     content.count('id="egalReel"') == 1),
    ("one reel row",               content.count('class="egal-row egal-row-') == 1),
    ("no hover-pause rule",        ".egal-reel:hover" not in content),
    ("9 cards",                    content.count('class="egal-card') == 9),
    ("9 data-index",               content.count('data-index="') == 9),
    ("data-index 0..8 all present", idx_ok),
    ("marquee keyframe present",   "egal-scroll" in content),
    ("ready-gate present",         "egal-ready" in content),
    ("lightbox present",           content.count('id="egalLb"') == 1),
    ("new IIFE tag present",       content.count("/* end Event Gallery */") == 1),
    # old masonry artifacts fully gone
    ("no egal-item",               "egal-item" not in content),
    ("no egal-grid/egalGrid",      "egal-grid" not in content and "egalGrid" not in content),
    ("no egal-media-wrap",         "egal-media-wrap" not in content),
    ("no data-speed",              "data-speed" not in content),
    ("no egal-container",          "egal-container" not in content),
    ("no computeTargets (old JS)", "computeTargets" not in content),
    ("no old nirmaan/ngal",        "nirmaan-gallery-section" not in content and "ngal" not in content),
    # surrounding document intact
    ("pricing css intact",         content.count(pricing) == 1),
    ("PRICING html intact",        content.count(h1) == 1),
    ("body/html closed",           "</body>" in content and "</html>" in content),
    ("one style block",            content.count("<style>") == 1 and content.count("</style>") == 1),
    ("one script block",           content.count("<script>") == 1 and content.count("</script>") == 1),
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
