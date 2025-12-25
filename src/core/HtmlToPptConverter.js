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

    // 获取图标名称用于精确匹配（优先使用 iconName，这是在 HtmlParser 中保存的原始图标文本）
    const elementText = element.iconName || element.content?.trim() || element.textContent?.trim() || '';

    // 第一优先：通过文本内容精确匹配（对于 Material Icons 这是最可靠的方式）
    for (const iconEl of iconElements) {
      const iconText = iconEl.textContent?.trim() || '';
      if (elementText && iconText === elementText) {
        return await this.captureElementToImage(iconEl, doc);
      }
    }

    // 第二优先：在更大范围内搜索匹配的文本
    const allIcons = doc.querySelectorAll('[class*="material-icons"], [class*="icon"], i, span');
    for (const iconEl of allIcons) {
      const iconText = iconEl.textContent?.trim() || '';
      if (elementText && iconText === elementText) {
        return await this.captureElementToImage(iconEl, doc);
      }
    }

    // 第三优先：只有在位置信息可用且匹配时才使用位置匹配
    // 注意：不使用仅类名匹配，因为多个图标可能有相同的类名
    for (const iconEl of iconElements) {
      if (element.position && iconEl.getBoundingClientRect) {
        const rect = iconEl.getBoundingClientRect();
        const posMatch = Math.abs(rect.x - element.position.x) < 5 &&
                         Math.abs(rect.y - element.position.y) < 5;
        if (posMatch) {
          return await this.captureElementToImage(iconEl, doc);
        }
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
   * 常用 Material Icons 的 SVG 路径映射
   * 这些是预定义的图标，可以在 PPT 中正确显示
   */
  static MATERIAL_ICON_PATHS = {
    'home': 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z',
    'settings': 'M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z',
    'directions_car': 'M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z',
    'car': 'M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z',
    'search': 'M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z',
    'menu': 'M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z',
    'close': 'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z',
    'check': 'M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z',
    'add': 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z',
    'delete': 'M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z',
    'edit': 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z',
    'person': 'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z',
    'email': 'M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z',
    'phone': 'M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z',
    'favorite': 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z',
    'star': 'M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z',
    'info': 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z',
    'warning': 'M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z',
    'error': 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z',
    'help': 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z',
    'account_circle': 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z',
    'arrow_back': 'M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z',
    'arrow_forward': 'M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z',
    'check_circle': 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z',
    'cancel': 'M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm5 13.59L15.59 17 12 13.41 8.41 17 7 15.59 10.59 12 7 8.41 8.41 7 12 10.59 15.59 7 17 8.41 13.41 12 17 15.59z',
    'visibility': 'M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z',
    'visibility_off': 'M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z',
    'lock': 'M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z',
    'download': 'M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z',
    'upload': 'M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z',
    'share': 'M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z',
    'shopping_cart': 'M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49c.08-.14.12-.31.12-.48 0-.55-.45-1-1-1H5.21l-.94-2H1zm16 16c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z',
    'refresh': 'M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z',
    'more_vert': 'M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z',
    'more_horiz': 'M6 10c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm12 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm-6 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z',
    'notifications': 'M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z',
    'calendar_today': 'M20 3h-1V1h-2v2H7V1H5v2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 18H4V8h16v13z',
    'schedule': 'M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z',
    'location_on': 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z',
    'attach_file': 'M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5c0-1.38 1.12-2.5 2.5-2.5s2.5 1.12 2.5 2.5v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z',
    'cloud': 'M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z',
    'folder': 'M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z',
    'insert_drive_file': 'M6 2c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6H6zm7 7V3.5L18.5 9H13z',
    'print': 'M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zm-3 11H8v-5h8v5zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-1-9H6v4h12V3z',
    'save': 'M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z',
    'send': 'M2.01 21L23 12 2.01 3 2 10l15 2-15 2z',
    'link': 'M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z',
    'language': 'M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zm6.93 6h-2.95c-.32-1.25-.78-2.45-1.38-3.56 1.84.63 3.37 1.91 4.33 3.56zM12 4.04c.83 1.2 1.48 2.53 1.91 3.96h-3.82c.43-1.43 1.08-2.76 1.91-3.96zM4.26 14C4.1 13.36 4 12.69 4 12s.1-1.36.26-2h3.38c-.08.66-.14 1.32-.14 2 0 .68.06 1.34.14 2H4.26zm.82 2h2.95c.32 1.25.78 2.45 1.38 3.56-1.84-.63-3.37-1.9-4.33-3.56zm2.95-8H5.08c.96-1.66 2.49-2.93 4.33-3.56C8.81 5.55 8.35 6.75 8.03 8zM12 19.96c-.83-1.2-1.48-2.53-1.91-3.96h3.82c-.43 1.43-1.08 2.76-1.91 3.96zM14.34 14H9.66c-.09-.66-.16-1.32-.16-2 0-.68.07-1.35.16-2h4.68c.09.65.16 1.32.16 2 0 .68-.07 1.34-.16 2zm.25 5.56c.6-1.11 1.06-2.31 1.38-3.56h2.95c-.96 1.65-2.49 2.93-4.33 3.56zM16.36 14c.08-.66.14-1.32.14-2 0-.68-.06-1.34-.14-2h3.38c.16.64.26 1.31.26 2s-.1 1.36-.26 2h-3.38z',
    'work': 'M20 6h-4V4c0-1.11-.89-2-2-2h-4c-1.11 0-2 .89-2 2v2H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-6 0h-4V4h4v2z',
    'school': 'M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82zM12 3L1 9l11 6 9-4.91V17h2V9L12 3z',
    'flight': 'M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z',
    'local_hospital': 'M19 3H5c-1.1 0-1.99.9-1.99 2L3 19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-1 11h-4v4h-4v-4H6v-4h4V6h4v4h4v4z',
    'restaurant': 'M11 9H9V2H7v7H5V2H3v7c0 2.12 1.66 3.84 3.75 3.97V22h2.5v-9.03C11.34 12.84 13 11.12 13 9V2h-2v7zm5-3v8h2.5v8H21V2c-2.76 0-5 2.24-5 4z',
    'local_cafe': 'M20 3H4v10c0 2.21 1.79 4 4 4h6c2.21 0 4-1.79 4-4v-3h2c1.11 0 2-.89 2-2V5c0-1.11-.89-2-2-2zm0 5h-2V5h2v3zM2 21h18v-2H2v2z',
    'movie': 'M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z',
    'music_note': 'M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z',
    'sports_soccer': 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 4h3c.55 0 1 .45 1 1v3h-4V6zm-2 0v4H7V7c0-.55.45-1 1-1h3zm-5 9v-3h4v4H7c-.55 0-1-.45-1-1zm6 4h-3c-.55 0-1-.45-1-1v-3h4v4zm0-5h-4V9h4v5zm6 2c0 .55-.45 1-1 1h-3v-4h4v3zm0-4h-4V9h4v4z',
    'fitness_center': 'M20.57 14.86L22 13.43 20.57 12 17 15.57 8.43 7 12 3.43 10.57 2 9.14 3.43 7.71 2 5.57 4.14 4.14 2.71 2.71 4.14l1.43 1.43L2 7.71l1.43 1.43L2 10.57 3.43 12 7 8.43 15.57 17 12 20.57 13.43 22l1.43-1.43L16.29 22l2.14-2.14 1.43 1.43 1.43-1.43-1.43-1.43L22 16.29z',
    'pets': 'M4.5 9.5m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0M9 5.5m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0M15 5.5m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0M19.5 9.5m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0M17.34 14.86c-.87-1.02-1.6-1.89-2.48-2.91-.46-.54-1.05-1.08-1.75-1.32-.11-.04-.22-.07-.33-.09-.25-.04-.52-.04-.78-.04s-.53 0-.79.05c-.11.02-.22.05-.33.09-.7.24-1.28.78-1.75 1.32-.87 1.02-1.6 1.89-2.48 2.91-1.31 1.31-2.92 2.76-2.62 4.79.29 1.02 1.02 2.03 2.33 2.32.73.15 3.06-.44 5.54-.44h.18c2.48 0 4.81.58 5.54.44 1.31-.29 2.04-1.31 2.33-2.32.31-2.04-1.3-3.49-2.61-4.8z',
    // Material Symbols 图标（测试文件中使用的）
    'account_tree': 'M22 11V3h-7v3H9V3H2v8h7V8h2v10h4v3h7v-8h-7v3h-2V8h2v3h7zM7 9H4V5h3v4zm10 6h3v4h-3v-4zm0-10v4h3V5h-3z',
    'agriculture': 'M19.5 12c.93 0 1.78.28 2.5.76V8c0-1.1-.9-2-2-2h-6.29l-1.06-1.06 1.41-1.41-.71-.71-3.53 3.53.71.71 1.41-1.41L13 6.71V9c0 1.1-.9 2-2 2H8.96c.22.54.38 1.12.46 1.73.19-.13.4-.21.63-.27.5-.14 1.03-.21 1.59-.18C13.43 10.25 15 8.18 15 6h5v6c.55-.64 1.27-1.12 2.08-1.38.14-.04.28-.08.42-.1v-.52zm-11.22.36C8.13 12.57 8 12.77 8 13c0 .55.45 1 1 1s1-.45 1-1c0-.44-.28-.81-.67-.94-.19.08-.37.18-.55.3zM20 13.5c-2.48 0-4.5 2.02-4.5 4.5s2.02 4.5 4.5 4.5 4.5-2.02 4.5-4.5-2.02-4.5-4.5-4.5zm0 7c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5zM4.5 18c-2.48 0-4.5 2.02-4.5 4.5S2.02 27 4.5 27 9 24.98 9 22.5 6.98 18 4.5 18zm0 7c-1.38 0-2.5-1.12-2.5-2.5S3.12 20 4.5 20s2.5 1.12 2.5 2.5S5.88 25 4.5 25z',
    'arrow_downward': 'M20 12l-1.41-1.41L13 16.17V4h-2v12.17l-5.58-5.59L4 12l8 8 8-8z',
    'arrow_upward': 'M4 12l1.41 1.41L11 7.83V20h2V7.83l5.58 5.59L20 12l-8-8-8 8z',
    'dns': 'M20 13H4c-.55 0-1 .45-1 1v6c0 .55.45 1 1 1h16c.55 0 1-.45 1-1v-6c0-.55-.45-1-1-1zM7 19c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zM20 3H4c-.55 0-1 .45-1 1v6c0 .55.45 1 1 1h16c.55 0 1-.45 1-1V4c0-.55-.45-1-1-1zM7 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z',
    'health_and_safety': 'M10.5 13H8v-3h2.5V7.5h3V10H16v3h-2.5v2.5h-3V13zM12 2L4 5v6.09c0 5.05 3.41 9.76 8 10.91 4.59-1.15 8-5.86 8-10.91V5l-8-3z',
    'html': 'M3.5 9H5v6H3.5v-2.5h-2V15H0V9h1.5v2h2V9zm11 3c0 .6-.2 1.1-.6 1.4-.4.4-.9.6-1.4.6H11v-2h1c.4 0 .5-.2.5-.5s-.1-.5-.5-.5h-1c-.4 0-.8.1-1.1.4-.3.3-.4.7-.4 1.1v1c0 .4.1.8.4 1.1.3.3.7.4 1.1.4h2V15H12c-.6 0-1.1-.2-1.4-.6-.4-.4-.6-.9-.6-1.4v-1c0-.6.2-1.1.6-1.4.4-.4.9-.6 1.4-.6h1c.6 0 1 .2 1.4.6.4.4.6.9.6 1.4v1zm2.5-3v6h1.5v-2.5h2V15H22V9h-1.5v2h-2V9h-1.5zm-8 6V10.5h1.5V9H6v1.5h1.5V15H9z',
    'inventory_2': 'M20 2H4c-1 0-2 .9-2 2v3.01c0 .72.43 1.34 1 1.69V20c0 1.1 1.1 2 2 2h14c.9 0 2-.9 2-2V8.7c.57-.35 1-.97 1-1.69V4c0-1.1-1-2-2-2zm-5 12H9v-2h6v2zm5-7H4V4h16v3z',
    'payments': 'M19 14V6c0-1.1-.9-2-2-2H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zm-9-1c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm13-6v11c0 1.1-.9 2-2 2H4v-2h17V7h2z',
    'picture_as_pdf': 'M20 2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-8.5 7.5c0 .83-.67 1.5-1.5 1.5H9v2H7.5V7H10c.83 0 1.5.67 1.5 1.5v1zm5 2c0 .83-.67 1.5-1.5 1.5h-2.5V7H15c.83 0 1.5.67 1.5 1.5v3zm4-3H19v1h1.5V11H19v2h-1.5V7h3v1.5zM9 9.5h1v-1H9v1zM4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm10 5.5h1v-3h-1v3z',
    'precision_manufacturing': 'M19.93 8.35l-3.6 1.68L14 7.7V6.3l2.33-2.33 3.6 1.68c.38.18.82.01 1-.36.18-.38.01-.82-.36-1l-3.92-1.83c-.38-.18-.83-.1-1.13.2L13.78 4.4c-.18-.24-.46-.4-.78-.4-.55 0-1 .45-1 1v1H8.82C8.34 4.65 6.98 3.73 5.4 4.07c-1.16.25-2.15 1.17-2.36 2.35-.32 1.77.9 3.35 2.67 3.57 1.23.15 2.32-.42 2.97-1.32L12 8.67v1.4l-1.88 1.88c-.28.28-.36.72-.22 1.08l2.03 5.08c.36.89 1.52 1.1 2.18.39l2.78-2.98c.29-.31.34-.77.13-1.14l-1.63-2.88 1.86-.86c.31-.15.55-.42.66-.75l1.64-4.88c.19-.38.03-.82-.35-1-.38-.18-.82-.01-1 .37l-1.37 4.07zM5.5 6.5c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm8.85 6.25l1.5 2.64-1.5 1.61-1.23-3.08 1.23-1.17z',
    'rocket_launch': 'M9.19 6.35c-2.04 2.29-3.44 5.58-3.57 5.89L2 10.69l4.05-4.05c.47-.47 1.15-.68 1.81-.55l1.33.26zM11.17 17s3.74-1.55 5.89-3.7c5.4-5.4 4.5-9.62 4.21-10.57-.95-.3-5.17-1.19-10.57 4.21C8.55 9.09 7 12.83 7 12.83L11.17 17zm6.48-2.19c-2.29 2.04-5.58 3.44-5.89 3.57L13.31 22l4.05-4.05c.47-.47.68-1.15.55-1.81l-.26-1.33zM9 18c0 .83-.34 1.58-.88 2.12C6.94 21.3 2 22 2 22s.7-4.94 1.88-6.12C4.42 15.34 5.17 15 6 15c1.66 0 3 1.34 3 3zm4-9c0-1.1.9-2 2-2s2 .9 2 2-.9 2-2 2-2-.9-2-2z',
    'share_location': 'M13.02 19.93v2.02c2.01-.2 3.84-1 5.32-2.21l-1.42-1.43c-1.11.86-2.44 1.44-3.9 1.62zM4.03 12c0-4.05 3.03-7.41 6.95-7.93V2.05C5.95 2.58 2.03 6.84 2.03 12c0 5.16 3.92 9.42 8.95 9.95v-2.02c-3.92-.52-6.95-3.88-6.95-7.93zm15.92-1h2.02c-.2-2.01-1-3.84-2.21-5.32l-1.43 1.43c.86 1.1 1.44 2.43 1.62 3.89zm-1.61-6.74c-1.48-1.21-3.32-2.01-5.32-2.21v2.02c1.46.18 2.79.76 3.9 1.62l1.42-1.43zm-.01 12.64l1.43 1.42c1.21-1.48 2.01-3.31 2.21-5.32h-2.02c-.18 1.46-.76 2.79-1.62 3.9zM16 11.1C16 8.61 14.1 7 12 7s-4 1.61-4 4.1c0 1.66 1.33 3.63 4 5.9 2.67-2.27 4-4.24 4-5.9zm-4 1.4c-.59 0-1.07-.48-1.07-1.07 0-.59.48-1.07 1.07-1.07s1.07.48 1.07 1.07c0 .59-.48 1.07-1.07 1.07z',
    'train': 'M12 2c-4 0-8 .5-8 4v9.5C4 17.43 5.57 19 7.5 19L6 20.5v.5h2.23l2-2H14l2 2h2v-.5L16.5 19c1.93 0 3.5-1.57 3.5-3.5V6c0-3.5-3.58-4-8-4zM7.5 17c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm3.5-7H6V6h5v4zm2 0V6h5v4h-5zm3.5 7c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z'
  };

  /**
   * 将 DOM 元素捕获为图片
   * 对于字体图标，生成 SVG 图标
   * @param {Element} element - DOM 元素
   * @param {Document} doc - 元素所在的文档
   * @returns {Promise<string|null>} base64 图片数据（SVG 格式）
   */
  async captureElementToImage(element, doc) {
    try {
      const rect = element.getBoundingClientRect();
      const computedStyle = doc.defaultView.getComputedStyle(element);

      // 获取元素尺寸（至少 48x48）
      const width = Math.max(rect.width, 48);
      const height = Math.max(rect.height, 48);

      // 获取文本内容和样式
      const text = element.textContent?.trim() || '';
      const color = computedStyle.color || '#ffffff';

      // 尝试查找预定义的 Material Icon 路径
      const iconPath = HtmlToPptConverter.MATERIAL_ICON_PATHS[text];

      let svgContent;
      if (iconPath) {
        // 使用预定义的 SVG 路径
        svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 24 24">
          <path d="${iconPath}" fill="${color}"/>
        </svg>`;
      } else {
        // 创建一个占位符圆形图标
        svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" fill="none" stroke="${color}" stroke-width="2"/>
          <text x="12" y="16" text-anchor="middle" font-size="10" fill="${color}">?</text>
        </svg>`;
        console.warn(`Unknown icon: "${text}", using placeholder`);
      }

      // 返回 SVG data URL
      const svgBase64 = btoa(unescape(encodeURIComponent(svgContent)));
      return `data:image/svg+xml;base64,${svgBase64}`;
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
