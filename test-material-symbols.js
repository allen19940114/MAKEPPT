/**
 * 测试 Material Symbols 图标渲染
 */

import { chromium } from 'playwright';

const TEST_HTML = `
<!DOCTYPE html>
<html>
<head>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght@400" rel="stylesheet">
  <style>
    body { background: #333; padding: 20px; }
    .slide { background: #1a1a2e; padding: 40px; color: white; }
    .material-symbols-outlined {
      font-family: 'Material Symbols Outlined';
      font-size: 48px;
      color: #4fc3f7;
      display: inline-block;
      margin: 10px;
    }
    .icon-row { display: flex; gap: 20px; flex-wrap: wrap; }
    .icon-item { text-align: center; }
    .icon-item span:last-child { display: block; font-size: 12px; margin-top: 5px; }
  </style>
</head>
<body>
  <section class="slide">
    <h2>Material Symbols 测试</h2>
    <div class="icon-row">
      <div class="icon-item">
        <span class="material-symbols-outlined">trending_up</span>
        <span>trending_up</span>
      </div>
      <div class="icon-item">
        <span class="material-symbols-outlined">water_drop</span>
        <span>water_drop</span>
      </div>
      <div class="icon-item">
        <span class="material-symbols-outlined">translate</span>
        <span>translate</span>
      </div>
      <div class="icon-item">
        <span class="material-symbols-outlined">rocket_launch</span>
        <span>rocket_launch</span>
      </div>
      <div class="icon-item">
        <span class="material-symbols-outlined">cloud_off</span>
        <span>cloud_off</span>
      </div>
      <div class="icon-item">
        <span class="material-symbols-outlined">visibility</span>
        <span>visibility</span>
      </div>
    </div>
  </section>
</body>
</html>
`;

async function runTest() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log('启动测试...');
    await page.goto('http://localhost:3001');
    await page.waitForLoadState('networkidle');

    // 输入 HTML
    await page.fill('#htmlInput', TEST_HTML);
    await page.waitForTimeout(1000);

    // 直接检查图标渲染，不需要点击按钮
    const result = await page.evaluate(async () => {
      const converter = window.app?.converter;
      if (!converter) {
        return { error: 'Converter not found' };
      }

      // 创建 iframe
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:absolute;left:-9999px;width:1920px;height:1080px;border:none;';
      document.body.appendChild(iframe);

      await new Promise(resolve => {
        iframe.onload = resolve;
        iframe.src = 'about:blank';
      });

      const iframeDoc = iframe.contentDocument;
      const html = document.getElementById('htmlInput').value;
      iframeDoc.open();
      iframeDoc.write(html);
      iframeDoc.close();

      // 等待字体加载
      await new Promise(r => setTimeout(r, 2000));
      if (iframeDoc.fonts && iframeDoc.fonts.ready) {
        await iframeDoc.fonts.ready;
      }
      await new Promise(r => setTimeout(r, 500));

      // 解析幻灯片
      const slides = converter.htmlParser.extractSlides(iframeDoc);

      // 捕获图标
      await converter.captureFontIcons(slides, iframeDoc);

      // 收集结果
      const results = [];
      function collectResults(elements) {
        for (const el of elements) {
          if (el.type === 'icon' && el.isFontIcon) {
            results.push({
              iconName: el.iconName,
              hasImageData: !!el.iconImageData,
              imageDataType: el.iconImageData ? (el.iconImageData.startsWith('data:image/png') ? 'PNG' : 'SVG') : null,
              imageDataLength: el.iconImageData?.length || 0
            });
          }
          if (el.children) {
            collectResults(el.children);
          }
        }
      }
      for (const slide of slides) {
        collectResults(slide.elements);
      }

      document.body.removeChild(iframe);

      return {
        slideCount: slides.length,
        iconResults: results
      };
    });

    console.log('\n=== 测试结果 ===');
    console.log('幻灯片数量:', result.slideCount);
    console.log('\n图标渲染结果:');

    if (result.iconResults && result.iconResults.length > 0) {
      result.iconResults.forEach((icon, i) => {
        const status = icon.hasImageData ? '✓' : '✗';
        console.log(`  ${status} ${icon.iconName}: ${icon.imageDataType || 'FAILED'} (${icon.imageDataLength} bytes)`);
      });

      const successCount = result.iconResults.filter(i => i.hasImageData).length;
      console.log(`\n总计: ${successCount}/${result.iconResults.length} 个图标成功渲染`);
    } else {
      console.log('  没有检测到图标');
    }

  } catch (error) {
    console.error('测试失败:', error);
  } finally {
    await browser.close();
  }
}

runTest();
