#!/usr/bin/env python3
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    
    # 读取 SVG
    with open('apps/web/public/app-icon.svg', 'r') as f:
        svg_content = f.read()
    
    # 转义反引号
    svg_escaped = svg_content.replace('`', '\\`')
    
    # 创建 HTML 页面来渲染 SVG
    html = f'''
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {{ margin: 0; padding: 0; }}
            #canvas {{ display: block; }}
        </style>
    </head>
    <body>
        <canvas id="canvas" width="1024" height="1024"></canvas>
        <script>
            const canvas = document.getElementById('canvas');
            const ctx = canvas.getContext('2d');
            const img = new Image();
            const svg = `{svg_escaped}`;
            const blob = new Blob([svg], {{type: 'image/svg+xml'}});
            const url = URL.createObjectURL(blob);
            
            img.onload = function() {{
                ctx.drawImage(img, 0, 0, 1024, 1024);
                URL.revokeObjectURL(url);
            }};
            img.src = url;
        </script>
    </body>
    </html>
    '''
    
    page.set_content(html)
    page.wait_for_timeout(2000)  # 等待渲染完成
    
    # 截图保存为 PNG
    page.locator('#canvas').screenshot(path='tools/pack/resources/mac/icon.png')
    
    browser.close()
    print('✅ PNG 已生成: tools/pack/resources/mac/icon.png')
