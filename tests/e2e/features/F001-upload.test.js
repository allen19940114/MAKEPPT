/**
 * F001 - HTML 文件上传与解析 E2E 测试
 * 使用 Playwright 进行浏览器自动化测试
 */

import { chromium } from 'playwright';

describe('F001 - HTML 文件上传与解析', () => {
  let browser;
  let page;

  beforeAll(async () => {
    browser = await chromium.launch({
      headless: true
    });
  });

  afterAll(async () => {
    if (browser) {
      await browser.close();
    }
  });

  beforeEach(async () => {
    const context = await browser.newContext();
    page = await context.newPage();
    // 注意: 需要先运行 npm run dev 启动服务器
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  });

  afterEach(async () => {
    if (page) {
      await page.close();
    }
  });

  test('F001-B1: 页面应正确加载', async () => {
    const title = await page.title();
    expect(title).toContain('HTML to PPT');

    // 检查主要元素是否存在
    const dropZone = await page.$('#dropZone');
    expect(dropZone).toBeTruthy();

    const htmlInput = await page.$('#htmlInput');
    expect(htmlInput).toBeTruthy();

    // 检查标题是否显示
    const headerText = await page.$eval('.logo', el => el.textContent);
    expect(headerText).toContain('HTML to PPT');
  });

  test('F001-B2: 代码粘贴功能应正常工作', async () => {
    const testHtml = `
      <section>
        <h1>Test Slide</h1>
        <p>Test content</p>
      </section>
    `;

    // 输入 HTML 代码
    await page.fill('#htmlInput', testHtml);

    // 等待预览生成
    await page.waitForTimeout(1000);

    // 检查预览区域是否显示
    const previewSection = await page.$('#previewSection');
    const isVisible = await previewSection.isVisible();
    expect(isVisible).toBe(true);

    // 检查幻灯片计数
    const slideCount = await page.$eval('#slideCount', el => el.textContent);
    expect(slideCount).toContain('1');
  });

  test('F001-B3: 转换按钮应可点击', async () => {
    const testHtml = `<section><h1>Test</h1></section>`;

    await page.fill('#htmlInput', testHtml);
    await page.waitForTimeout(1000);

    // 检查转换按钮是否显示
    const convertBtn = await page.$('#convertBtn');
    const isVisible = await convertBtn.isVisible();
    expect(isVisible).toBe(true);

    // 检查按钮是否可点击 (未禁用)
    const isDisabled = await page.$eval('#convertBtn', el => el.disabled);
    expect(isDisabled).toBe(false);
  });

  test('F001-B4: 重置按钮应清除内容', async () => {
    const testHtml = `<section><h1>Test</h1></section>`;

    await page.fill('#htmlInput', testHtml);
    await page.waitForTimeout(1000);

    // 点击重置按钮
    await page.click('#resetBtn');

    // 检查输入框是否已清空
    const inputValue = await page.$eval('#htmlInput', el => el.value);
    expect(inputValue).toBe('');

    // 检查预览区域是否隐藏
    const previewSection = await page.$('#previewSection');
    const isVisible = await previewSection.isVisible();
    expect(isVisible).toBe(false);
  });

  test('F001-B5: 多个幻灯片应正确识别', async () => {
    const testHtml = `
      <section><h1>Slide 1</h1></section>
      <section><h2>Slide 2</h2></section>
      <section><h3>Slide 3</h3></section>
    `;

    await page.fill('#htmlInput', testHtml);
    await page.waitForTimeout(1000);

    // 检查幻灯片计数
    const slideCount = await page.$eval('#slideCount', el => el.textContent);
    expect(slideCount).toContain('3');

    // 检查预览卡片数量
    const slideCards = await page.$$('.slide-preview');
    expect(slideCards.length).toBe(3);
  });
});
