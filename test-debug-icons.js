/**
 * 调试脚本 - 检查图标解析和匹配
 */

import { chromium } from 'playwright';

const TEST_HTML = `
<!DOCTYPE html>
<html>
<head>
  <link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet">
  <style>
    .material-icons { font-size: 48px; color: white; }
  </style>
</head>
<body>
  <section class="slide">
    <div class="icon-box">
      <div class="icon-item">
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
        </svg>
        <span>SVG图标</span>
      </div>
      <div class="icon-item">
        <span class="material-icons">directions_car</span>
        <span>车辆图标</span>
      </div>
      <div class="icon-item">
        <span class="material-icons">home</span>
        <span>首页图标</span>
      </div>
      <div class="icon-item">
        <i class="material-icons">settings</i>
        <span>设置图标</span>
      </div>
    </div>
  </section>
</body>
</html>
`;

async function runDebug() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto('http://localhost:3001');
    await page.waitForLoadState('networkidle');

    // 注入 HTML 并触发解析
    await page.fill('#htmlInput', TEST_HTML);
    await page.waitForTimeout(500);

    // 捕获控制台输出
    page.on('console', msg => {
      if (msg.text().includes('DEBUG:')) {
        console.log('Browser:', msg.text());
      }
    });

    // 调用转换流程来检查解析后的元素
    const debugResult = await page.evaluate(async () => {
      const converter = window.app?.converter;
      if (!converter) {
        return { error: 'Converter not found' };
      }

      // 使用 renderAndParse 来获取完整的解析结果
      const html = document.getElementById('htmlInput').value;

      // 创建 iframe
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:absolute;left:-9999px;width:1920px;height:1080px;border:none;';
      document.body.appendChild(iframe);

      await new Promise(resolve => {
        iframe.onload = resolve;
        iframe.src = 'about:blank';
      });

      const iframeDoc = iframe.contentDocument;
      iframeDoc.open();
      iframeDoc.write(html);
      iframeDoc.close();

      await new Promise(r => setTimeout(r, 500));

      // 使用 HtmlParser 解析
      const slides = converter.htmlParser.extractSlides(iframeDoc);

      // 实际调用 captureFontIcons 来测试完整流程
      await converter.captureFontIcons(slides, iframeDoc);

      // 收集结果
      const results = [];
      function collectResults(elements) {
        for (const el of elements) {
          if (el.type === 'icon' && el.isFontIcon) {
            results.push({
              iconName: el.iconName,
              hasImageData: !!el.iconImageData,
              imageDataPrefix: el.iconImageData ? el.iconImageData.substring(0, 100) : null
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

    console.log('=== 解析和捕获结果 ===');
    console.log('幻灯片数量:', debugResult.slideCount);
    console.log('\n图标结果:');
    debugResult.iconResults.forEach((result, i) => {
      console.log(`\nIcon ${i + 1}:`);
      console.log('  iconName:', JSON.stringify(result.iconName));
      console.log('  hasImageData:', result.hasImageData);
      console.log('  imageDataPrefix:', result.imageDataPrefix);
    });

  } catch (error) {
    console.error('调试失败:', error);
  } finally {
    await browser.close();
  }
}

runDebug();
