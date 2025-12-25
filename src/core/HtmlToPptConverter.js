/**
 * HTML to PPT 转换器主类
 * 整合所有模块，提供统一的转换接口
 */

import { HtmlParser } from './HtmlParser.js';
import { PptGenerator } from './PptGenerator.js';
import { StyleConverter } from './StyleConverter.js';
import { AnimationConverter } from './AnimationConverter.js';

export class HtmlToPptConverter {
  constructor(options = {}) {
    this.options = {
      aspectRatio: '16:9',
      defaultFontFace: 'Arial',
      defaultFontSize: 18,
      preserveAnimations: true,
      ...options
    };

    this.htmlParser = new HtmlParser();
    this.styleConverter = new StyleConverter();
    this.animationConverter = new AnimationConverter();
    this.pptGenerator = null; // 延迟初始化，等待 aspectRatio 选项
  }

  /**
   * 从 HTML 字符串转换为 PPT
   * @param {string} htmlString - HTML 内容
   * @param {Object} options - 转换选项
   * @returns {Promise<Blob>} PPT 文件 Blob
   */
  async convertFromHtml(htmlString, options = {}) {
    // 解析 HTML
    const slides = this.parseHtml(htmlString);

    // 生成 PPT
    return await this.generatePpt(slides, options);
  }

  /**
   * 从 HTML 文件转换为 PPT
   * @param {File} file - HTML 文件
   * @param {Object} options - 转换选项
   * @returns {Promise<Blob>} PPT 文件 Blob
   */
  async convertFromFile(file, options = {}) {
    const htmlString = await this.readFile(file);
    return await this.convertFromHtml(htmlString, options);
  }

  /**
   * 读取文件内容
   * @param {File} file - 文件对象
   * @returns {Promise<string>} 文件内容
   */
  readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = (e) => reject(e);
      reader.readAsText(file);
    });
  }

  /**
   * 解析 HTML 并提取幻灯片
   * @param {string} htmlString - HTML 内容
   * @returns {Array<SlideData>} 幻灯片数据
   */
  parseHtml(htmlString) {
    return this.htmlParser.extractSlides(htmlString);
  }

  /**
   * 渲染 HTML 并获取计算后的样式
   * 这个方法需要在浏览器环境中使用 iframe 进行渲染
   * @param {string} htmlString - HTML 内容
   * @param {Object} options - 选项（包含 aspectRatio）
   * @returns {Promise<Array<SlideData>>} 带有计算样式的幻灯片数据
   */
  async renderAndParse(htmlString, options = {}) {
    return new Promise((resolve) => {
      // 创建隐藏的 iframe 来渲染 HTML
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:absolute;left:-9999px;width:1920px;height:1080px;border:none;';
      document.body.appendChild(iframe);

      iframe.onload = async () => {
        try {
          const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
          iframeDoc.open();
          iframeDoc.write(htmlString);
          iframeDoc.close();

          // 等待样式和字体加载
          await new Promise(r => setTimeout(r, 500));

          // 等待字体加载完成
          if (iframeDoc.fonts && iframeDoc.fonts.ready) {
            try {
              await Promise.race([
                iframeDoc.fonts.ready,
                new Promise(r => setTimeout(r, 2000)) // 最多等待2秒
              ]);
            } catch (e) {
              console.warn('Font loading timeout:', e);
            }
          }

          const slides = this.htmlParser.extractSlides(iframeDoc);

          // 捕获字体图标为图片
          await this.captureFontIcons(slides, iframeDoc);

          // 创建临时的 PptGenerator 来计算缩放参数
          const generatorOptions = {
            ...this.options,
            aspectRatio: options.aspectRatio || this.options.aspectRatio || '16:9'
          };
          const tempGenerator = new PptGenerator(generatorOptions);
          tempGenerator.initPresentation();
          tempGenerator.setContainerSize(
            iframe.contentWindow.innerWidth,
            iframe.contentWindow.innerHeight
          );

          // 保存缩放参数供后续使用
          this.lastContainerSize = {
            width: iframe.contentWindow.innerWidth,
            height: iframe.contentWindow.innerHeight
          };

          document.body.removeChild(iframe);
          resolve(slides);
        } catch (error) {
          console.error('renderAndParse error:', error);
          document.body.removeChild(iframe);
          // 回退到直接解析
          resolve(this.parseHtml(htmlString));
        }
      };

      // 触发加载
      iframe.src = 'about:blank';
    });
  }

  /**
   * 捕获字体图标为图片
   * @param {Array<SlideData>} slides - 幻灯片数据
   * @param {Document} doc - 渲染后的文档
   */
  async captureFontIcons(slides, doc) {
    for (const slide of slides) {
      await this.captureIconsInElements(slide.elements, doc);
    }
  }

  /**
   * 递归捕获元素中的字体图标
   * @param {Array} elements - 元素数组
   * @param {Document} doc - 渲染后的文档
   */
  async captureIconsInElements(elements, doc) {
    for (const element of elements) {
      // 如果是字体图标，尝试捕获为图片
      if (element.type === 'icon' && element.isFontIcon) {
        try {
          const iconImage = await this.renderFontIconToImage(element, doc);
          if (iconImage) {
            element.iconImageData = iconImage;
          }
        } catch (error) {
          console.warn('Failed to capture font icon:', error);
        }
      }

      // 递归处理子元素
      if (element.children && element.children.length > 0) {
        await this.captureIconsInElements(element.children, doc);
      }
    }
  }

  /**
   * 将字体图标渲染为图片
   * @param {Object} element - 图标元素数据
   * @param {Document} doc - 渲染后的文档
   * @returns {Promise<string|null>} base64 图片数据
   */
  async renderFontIconToImage(element, doc) {
    // 在文档中查找对应的图标元素
    const iconElements = doc.querySelectorAll('.material-icons, .material-icons-outlined, .material-icons-round, .material-icons-sharp, .material-symbols-outlined, .fa, .fas, .far, .fab, .bi, .mdi, i[class*="icon"]');

    for (const iconEl of iconElements) {
      // 匹配元素（通过类名或位置）
      const elClass = element.attributes?.class || '';
      const iconClass = iconEl.className || '';

      // 检查是否是同一个元素（通过类名匹配）
      if (iconClass.includes(elClass) || this.isSameElement(element, iconEl)) {
        return await this.captureElementToImage(iconEl);
      }
    }

    // 如果没有找到匹配的元素，尝试通过文本内容匹配
    const allIcons = doc.querySelectorAll('[class*="material-icons"], [class*="icon"], i, span');
    for (const iconEl of allIcons) {
      if (this.isSameElement(element, iconEl)) {
        return await this.captureElementToImage(iconEl);
      }
    }

    return null;
  }

  /**
   * 判断两个元素是否相同
   * @param {Object} elementData - 解析的元素数据
   * @param {Element} domElement - DOM 元素
   * @returns {boolean}
   */
  isSameElement(elementData, domElement) {
    // 通过标签名和类名匹配
    const tagMatch = elementData.tagName === domElement.tagName.toLowerCase();
    const classMatch = elementData.attributes?.class === domElement.className;

    // 如果位置信息可用，也可以用位置匹配
    if (elementData.position && domElement.getBoundingClientRect) {
      const rect = domElement.getBoundingClientRect();
      const posMatch = Math.abs(rect.x - elementData.position.x) < 5 &&
                       Math.abs(rect.y - elementData.position.y) < 5;
      if (posMatch) return true;
    }

    return tagMatch && classMatch;
  }

  /**
   * 将 DOM 元素捕获为图片
   * @param {Element} element - DOM 元素
   * @returns {Promise<string|null>} base64 图片数据
   */
  async captureElementToImage(element) {
    try {
      const rect = element.getBoundingClientRect();
      const computedStyle = window.getComputedStyle(element);

      // 获取元素尺寸（至少 24x24）
      const width = Math.max(rect.width, 24);
      const height = Math.max(rect.height, 24);

      // 创建 Canvas
      const canvas = document.createElement('canvas');
      const scale = 2; // 高清缩放
      canvas.width = width * scale;
      canvas.height = height * scale;

      const ctx = canvas.getContext('2d');
      ctx.scale(scale, scale);

      // 设置背景为透明
      ctx.clearRect(0, 0, width, height);

      // 获取文本内容和样式
      const text = element.textContent || '';
      const fontFamily = computedStyle.fontFamily;
      const fontSize = parseFloat(computedStyle.fontSize) || 24;
      const color = computedStyle.color || '#000000';

      // 设置字体
      ctx.font = `${fontSize}px ${fontFamily}`;
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // 绘制文本（图标字符）
      ctx.fillText(text, width / 2, height / 2);

      // 转换为 base64
      return canvas.toDataURL('image/png');
    } catch (error) {
      console.warn('Failed to capture element to image:', error);
      return null;
    }
  }

  /**
   * 生成 PPT
   * @param {Array<SlideData>} slides - 幻灯片数据
   * @param {Object} options - 生成选项
   * @returns {Promise<Blob>} PPT 文件 Blob
   */
  async generatePpt(slides, options = {}) {
    const metadata = {
      title: options.title || 'Converted Presentation',
      author: options.author || 'HTML to PPT Converter',
      subject: options.subject || '',
      company: options.company || ''
    };

    const onProgress = options.onProgress || (() => {});
    const total = slides.length;

    // 根据选项创建 PptGenerator（支持不同的长宽比）
    const generatorOptions = {
      ...this.options,
      aspectRatio: options.aspectRatio || this.options.aspectRatio || '16:9'
    };
    this.pptGenerator = new PptGenerator(generatorOptions);
    this.pptGenerator.initPresentation(metadata);

    // 设置容器尺寸用于等比例缩放
    if (this.lastContainerSize) {
      this.pptGenerator.setContainerSize(
        this.lastContainerSize.width,
        this.lastContainerSize.height
      );
    } else {
      // 默认容器尺寸 (1920x1080 for 16:9)
      this.pptGenerator.setContainerSize(1920, 1080);
    }

    // 逐页生成并报告进度
    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i];
      onProgress(i + 1, total, `正在处理第 ${i + 1}/${total} 页: ${slide.title || 'Untitled'}`);

      // 添加幻灯片
      this.pptGenerator.addSlide(slide);

      // 让出线程，更新 UI
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    onProgress(total, total, '正在生成 PPT 文件...');

    return await this.pptGenerator.exportToBlob();
  }

  /**
   * 完整的转换流程：渲染 HTML，解析样式，生成 PPT
   * @param {string} htmlString - HTML 内容
   * @param {Object} options - 选项
   * @returns {Promise<Blob>} PPT 文件 Blob
   */
  async convert(htmlString, options = {}) {
    // 在浏览器环境中渲染并解析（传递 aspectRatio 选项）
    const slides = await this.renderAndParse(htmlString, options);

    // 生成 PPT
    return await this.generatePpt(slides, options);
  }

  /**
   * 转换并下载
   * @param {string} htmlString - HTML 内容
   * @param {string} filename - 文件名
   * @param {Object} options - 选项
   */
  async convertAndDownload(htmlString, filename = 'presentation.pptx', options = {}) {
    const blob = await this.convert(htmlString, options);
    this.downloadBlob(blob, filename);
  }

  /**
   * 下载 Blob 文件
   * @param {Blob} blob - 文件 Blob
   * @param {string} filename - 文件名
   */
  downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * 获取预览数据（幻灯片缩略图信息）
   * @param {string} htmlString - HTML 内容
   * @returns {Array<Object>} 预览数据
   */
  getPreviewData(htmlString) {
    const slides = this.parseHtml(htmlString);

    return slides.map((slide, index) => ({
      index,
      title: slide.title || `Slide ${index + 1}`,
      elementCount: slide.elements.length,
      hasBackground: !!slide.background?.color || !!slide.background?.gradient,
      preview: this.generateSlidePreview(slide)
    }));
  }

  /**
   * 生成幻灯片预览 HTML
   * @param {SlideData} slide - 幻灯片数据
   * @returns {string} 预览 HTML
   */
  generateSlidePreview(slide) {
    const bgStyle = this.getBackgroundStyle(slide.background);

    let elementsHtml = '';
    for (const element of slide.elements.slice(0, 5)) { // 只显示前 5 个元素
      if (element.text) {
        elementsHtml += `<div class="preview-element">${element.text.substring(0, 50)}...</div>`;
      }
    }

    return `
      <div class="slide-preview" style="${bgStyle}">
        <div class="slide-title">${slide.title || 'Untitled'}</div>
        <div class="slide-elements">${elementsHtml}</div>
      </div>
    `;
  }

  /**
   * 获取背景样式字符串
   * @param {BackgroundData} background - 背景数据
   * @returns {string} CSS 样式字符串
   */
  getBackgroundStyle(background) {
    if (!background) return 'background-color: #ffffff;';

    if (background.gradient) {
      return `background: linear-gradient(${background.gradient.value});`;
    }

    if (background.color) {
      return `background-color: ${background.color};`;
    }

    return 'background-color: #ffffff;';
  }
}

export default HtmlToPptConverter;
