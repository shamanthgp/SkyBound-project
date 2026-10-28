import re

with open('static/index.html', encoding='utf-8') as f:
    html = f.read()

with open('static/app.js', encoding='utf-8') as f:
    js = f.read()

ids_html = set(re.findall(r'id=[\'\"]([^\'\"]+)[\'\"]', html))
ids_js = set(re.findall(r'getElementById\([\'\"]([^\'\"]+)[\'\"]\)', js))

missing = ids_js - ids_html
print('Missing IDs used in getElementById:', missing)

qs_js = set(re.findall(r'querySelector\([\'\"]#([^\'\"]+)[\'\"]\)', js))
missing_qs = qs_js - ids_html
print('Missing IDs used in querySelector:', missing_qs)
