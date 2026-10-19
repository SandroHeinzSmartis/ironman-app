"""Packt die App in eine einzelne HTML-Datei (für die Testversion als Artifact).

Aufruf: python3 tools/testversion.py <ziel.html>
"""
import sys, re

css = open('style.css').read()
css = re.sub(r'body \{ margin: 0;(.*?)padding: env\(safe-area-inset-top\) 16px calc\(env\(safe-area-inset-bottom\) \+ 24px\); \}',
             r'body { margin: 0;\1padding-block: 0 24px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }',
             css, flags=re.S)
assert 'padding-block' in css
css = css.replace(':root {', ':root { color-scheme: dark;', 1)
body = open('index.html').read().split('<body>')[1].split('</body>')[0]
body = re.sub(r'\s*<script src="[^"]+"></script>', '', body)
plan = open('plan.json').read().replace('</', '<\\/')
js = ''
for f in ['lebensmittel.js', 'app.js', 'grafik.js', 'essen.js']:
    js += open(f).read() + '\n'
js = js.replace("fetch('plan.json').then(r => r.json()).then(p => {", "Promise.resolve(window.PLAN).then(p => {")
js = js.replace("if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');", "")
assert 'window.PLAN' in js
open(sys.argv[1], 'w').write(f'''<title>Ironman Trainingsplan</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
{css}</style>
{body}
<script>window.PLAN = {plan};</script>
<script>
{js}</script>
''')
