/**
 * HTML 解析器
 * 负责解析 HTML 内容并识别幻灯片结构
 */

export class HtmlParser {
  constructor() {
    // 常见的幻灯片容器选择器
    this.slideSelectors = [
      'section',
      '.slide',
      '.page',
      '[data-slide]',
      '.swiper-slide',
      '.carousel-item'
    ];
  }

  /**
   * 解析 HTML 字符串
   * @param {string} htmlString - HTML 内容
   * @returns {Document} 解析后的 DOM 文档
   */
  parseHtml(htmlString) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, 'text/html');
    return doc;
  }

  /**
   * 识别并提取幻灯片
   * @param {Document|string} input - DOM 文档或 HTML 字符串
   * @returns {Array<SlideData>} 幻灯片数据数组
   */
  extractSlides(input) {
    const doc = typeof input === 'string' ? this.parseHtml(input) : input;
    const slides = [];

    // 尝试不同的选择器找到幻灯片
    let slideElements = null;
    for (const selector of this.slideSelectors) {
      const elements = doc.querySelectorAll(selector);
      if (elements.length > 0) {
        slideElements = elements;
        break;
      }
    }

    // 如果没找到幻灯片容器，把整个 body 作为单页幻灯片
    if (!slideElements || slideElements.length === 0) {
      slideElements = [doc.body];
    }

    slideElements.forEach((element, index) => {
      slides.push(this.parseSlideElement(element, index));
    });

    return slides;
  }

  /**
   * 解析单个幻灯片元素
   * @param {Element} element - 幻灯片 DOM 元素
   * @param {number} index - 幻灯片索引
   * @returns {SlideData} 幻灯片数据
   */
  parseSlideElement(element, index) {
    const slideData = {
      index,
      title: this.extractTitle(element),
      elements: [],
      background: this.extractBackground(element),
      styles: this.extractComputedStyles(element)
    };

    // 递归提取所有子元素
    this.extractElements(element, slideData.elements);

    return slideData;
  }

  /**
   * 提取幻灯片标题
   * @param {Element} element - 幻灯片元素
   * @returns {string} 标题文本
   */
  extractTitle(element) {
    // 优先查找 h1-h6 标题
    for (let i = 1; i <= 6; i++) {
      const heading = element.querySelector(`h${i}`);
      if (heading) {
        return heading.textContent.trim();
      }
    }
    // 查找 title class
    const titleElement = element.querySelector('.title, [class*="title"]');
    if (titleElement) {
      return titleElement.textContent.trim();
    }
    return `Slide ${element.dataset?.slideIndex || ''}`.trim();
  }

  /**
   * 提取背景样式
   * @param {Element} element - 元素
   * @returns {BackgroundData} 背景数据
   */
  extractBackground(element) {
    const style = window.getComputedStyle ?
      window.getComputedStyle(element) :
      element.style;

    const bgColor = style.backgroundColor || element.style.backgroundColor;
    const bgImage = style.backgroundImage || element.style.backgroundImage;
    const bgGradient = this.parseGradient(bgImage);

    return {
      color: this.normalizeColor(bgColor),
      image: bgImage && !bgImage.includes('gradient') ? bgImage : null,
      gradient: bgGradient
    };
  }

  /**
   * 解析渐变
   * @param {string} value - CSS 渐变值
   * @returns {GradientData|null} 渐变数据
   */
  parseGradient(value) {
    if (!value || !value.includes('gradient')) return null;

    const linearMatch = value.match(/linear-gradient\((.*)\)/);
    if (linearMatch) {
      return {
        type: 'linear',
        value: linearMatch[1]
      };
    }

    const radialMatch = value.match(/radial-gradient\((.*)\)/);
    if (radialMatch) {
      return {
        type: 'radial',
        value: radialMatch[1]
      };
    }

    return null;
  }

  /**
   * 递归提取元素
   * @param {Element} parent - 父元素
   * @param {Array} elementsArray - 存储元素的数组
   * @param {number} depth - 递归深度
   */
  extractElements(parent, elementsArray, depth = 0) {
    const children = parent.children;

    for (const child of children) {
      const elementData = this.parseElement(child, depth);
      if (elementData) {
        elementsArray.push(elementData);
      }
    }
  }

  /**
   * 解析单个元素
   * @param {Element} element - DOM 元素
   * @param {number} depth - 嵌套深度
   * @returns {ElementData} 元素数据
   */
  parseElement(element, depth) {
    const tagName = element.tagName.toLowerCase();

    // 获取元素位置和尺寸
    let rect = { x: 0, y: 0, width: 0, height: 0 };

    // 尝试使用 getBoundingClientRect（仅在实际渲染的 DOM 中有效）
    if (element.getBoundingClientRect) {
      const domRect = element.getBoundingClientRect();
      // 检查是否有有效尺寸（DOMParser 解析的 DOM 返回全 0）
      if (domRect.width > 0 || domRect.height > 0) {
        rect = {
          x: domRect.x,
          y: domRect.y,
          width: domRect.width,
          height: domRect.height
        };
      }
    }

    // 如果没有有效尺寸，尝试从样式获取
    if (rect.width === 0 && rect.height === 0) {
      const style = window.getComputedStyle ?
        window.getComputedStyle(element) : element.style;

      rect = {
        x: parseFloat(element.style.left) || parseFloat(style.left) || 0,
        y: parseFloat(element.style.top) || parseFloat(style.top) || 0,
        width: parseFloat(element.style.width) || parseFloat(style.width) || 0,
        height: parseFloat(element.style.height) || parseFloat(style.height) || 0
      };
    }

    // 对于文本元素，根据文本内容估算宽度
    const text = this.getTextContent(element);
    if (text && rect.width === 0) {
      const style = window.getComputedStyle ?
        window.getComputedStyle(element) : element.style;
      const fontSize = parseFloat(style.fontSize) || 16;
      // 粗略估算：每个字符约 0.6 * fontSize 宽度（考虑中英文混合）
      const avgCharWidth = fontSize * 0.6;
      rect.width = Math.min(text.length * avgCharWidth, 1600); // 最大宽度限制
      rect.height = rect.height || fontSize * 1.5; // 行高约 1.5 倍
    }

    const elementData = {
      type: this.getElementType(element),
      tagName,
      text: text,
      position: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height
      },
      styles: this.extractComputedStyles(element),
      attributes: this.extractAttributes(element),
      children: [],
      depth
    };

    // 特殊处理不同类型的元素
    if (tagName === 'img') {
      elementData.src = element.src || element.getAttribute('src');
      elementData.alt = element.alt;
    } else if (tagName === 'a') {
      elementData.href = element.href;
    } else if (tagName === 'table') {
      elementData.tableData = this.parseTable(element);
    } else if (tagName === 'ul' || tagName === 'ol') {
      elementData.listData = this.parseList(element);
    }

    // 递归处理子元素
    if (element.children.length > 0 && !['table', 'ul', 'ol'].includes(tagName)) {
      this.extractElements(element, elementData.children, depth + 1);
    }

    return elementData;
  }

  /**
   * 确定元素类型
   * @param {Element} element - DOM 元素
   * @returns {string} 元素类型
   */
  getElementType(element) {
    const tagName = element.tagName.toLowerCase();

    const typeMap = {
      'h1': 'heading',
      'h2': 'heading',
      'h3': 'heading',
      'h4': 'heading',
      'h5': 'heading',
      'h6': 'heading',
      'p': 'paragraph',
      'span': 'text',
      'div': 'container',
      'img': 'image',
      'table': 'table',
      'ul': 'list',
      'ol': 'list',
      'li': 'listItem',
      'a': 'link',
      'button': 'button',
      'svg': 'shape',
      'canvas': 'canvas'
    };

    return typeMap[tagName] || 'generic';
  }

  /**
   * 获取文本内容（不包含子元素的文本）
   * @param {Element} element - DOM 元素
   * @returns {string} 文本内容
   */
  getTextContent(element) {
    let text = '';
    for (const node of element.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent;
      }
    }
    return text.trim();
  }

  /**
   * 提取计算后的样式
   * @param {Element} element - DOM 元素
   * @returns {StyleData} 样式数据
   */
  extractComputedStyles(element) {
    const style = window.getComputedStyle ?
      window.getComputedStyle(element) :
      element.style;

    return {
      // 字体样式
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      fontStyle: style.fontStyle,
      textDecoration: style.textDecoration,
      textAlign: style.textAlign,
      lineHeight: style.lineHeight,
      letterSpacing: style.letterSpacing,

      // 颜色
      color: this.normalizeColor(style.color),
      backgroundColor: this.normalizeColor(style.backgroundColor),

      // 边框
      borderWidth: style.borderWidth,
      borderStyle: style.borderStyle,
      borderColor: this.normalizeColor(style.borderColor),
      borderRadius: style.borderRadius,

      // 阴影
      boxShadow: style.boxShadow,
      textShadow: style.textShadow,

      // 透明度
      opacity: style.opacity,

      // 变换
      transform: style.transform,

      // 动画
      animation: style.animation,
      transition: style.transition
    };
  }

  /**
   * 提取元素属性
   * @param {Element} element - DOM 元素
   * @returns {Object} 属性对象
   */
  extractAttributes(element) {
    const attrs = {};
    for (const attr of element.attributes) {
      attrs[attr.name] = attr.value;
    }
    return attrs;
  }

  /**
   * 解析表格
   * @param {HTMLTableElement} table - 表格元素
   * @returns {TableData} 表格数据
   */
  parseTable(table) {
    const rows = [];
    const tableRows = table.querySelectorAll('tr');

    tableRows.forEach(tr => {
      const cells = [];
      const tableCells = tr.querySelectorAll('td, th');

      tableCells.forEach(cell => {
        cells.push({
          text: cell.textContent.trim(),
          isHeader: cell.tagName.toLowerCase() === 'th',
          colspan: parseInt(cell.getAttribute('colspan')) || 1,
          rowspan: parseInt(cell.getAttribute('rowspan')) || 1,
          styles: this.extractComputedStyles(cell)
        });
      });

      rows.push(cells);
    });

    return { rows };
  }

  /**
   * 解析列表
   * @param {HTMLUListElement|HTMLOListElement} list - 列表元素
   * @returns {ListData} 列表数据
   */
  parseList(list) {
    const items = [];
    const isOrdered = list.tagName.toLowerCase() === 'ol';

    list.querySelectorAll(':scope > li').forEach(li => {
      const item = {
        text: this.getTextContent(li),
        styles: this.extractComputedStyles(li),
        children: []
      };

      // 检查嵌套列表
      const nestedList = li.querySelector('ul, ol');
      if (nestedList) {
        item.children = this.parseList(nestedList).items;
      }

      items.push(item);
    });

    return { isOrdered, items };
  }

  /**
   * 标准化颜色值
   * @param {string} color - CSS 颜色值
   * @returns {string} 标准化后的颜色 (hex)
   */
  normalizeColor(color) {
    if (!color || color === 'transparent' || color === 'rgba(0, 0, 0, 0)') {
      return null;
    }

    // 已经是 hex 格式
    if (color.startsWith('#')) {
      return color;
    }

    // RGB/RGBA 格式转 hex
    const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (rgbMatch) {
      const r = parseInt(rgbMatch[1]).toString(16).padStart(2, '0');
      const g = parseInt(rgbMatch[2]).toString(16).padStart(2, '0');
      const b = parseInt(rgbMatch[3]).toString(16).padStart(2, '0');
      return `#${r}${g}${b}`;
    }

    return color;
  }
}

export default HtmlParser;
