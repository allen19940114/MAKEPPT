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
    } else if (tagName === 'svg') {
      // 提取 SVG 内容用于转换为图片
      elementData.svgContent = element.outerHTML;
      elementData.type = 'svg';
      // 获取 SVG 的填充颜色（从 CSS 或属性）
      elementData.iconColor = this.getSvgColor(element);
    }

    // 如果是图标元素，尝试提取 SVG 或图标信息
    if (elementData.type === 'icon') {
      const svgChild = element.querySelector('svg');
      if (svgChild) {
        elementData.svgContent = svgChild.outerHTML;
        // 获取 SVG 的填充颜色
        elementData.iconColor = this.getSvgColor(svgChild) || this.extractComputedStyles(element).color;
        elementData.isFontIcon = false;
      } else {
        // 这是字体图标，标记为需要后续处理
        // 实际的图片捕获在 HtmlToPptConverter.captureFontIcons 中进行
        elementData.iconColor = this.extractComputedStyles(element).color;
        elementData.isFontIcon = true;
        elementData.iconImageData = null; // 将在渲染阶段填充
        // 保存图标名称（如 "home", "settings"）用于后续匹配正确的图标元素
        elementData.iconName = text;
      }
      // 清空图标元素的文本内容，防止字体图标文本（如 "car", "home"）被当作普通文本输出
      // Material Icons 等字体图标使用文本内容来显示图标，这些文本不应该出现在 PPT 中
      elementData.text = '';
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

    // 检测是否为图标元素
    if (this.isIconElement(element)) {
      return 'icon';
    }

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
   * 检测元素是否为图标元素
   * @param {Element} element - DOM 元素
   * @returns {boolean} 是否为图标
   */
  isIconElement(element) {
    const tagName = element.tagName.toLowerCase();
    const className = element.className || '';
    const classStr = typeof className === 'string' ? className : '';
    const classList = classStr.split(/\s+/).filter(c => c);

    // 精确匹配的图标类名（必须完全匹配类名列表中的某一个）
    const exactIconClasses = [
      'fa', 'fas', 'far', 'fab', 'fal', 'fad',  // Font Awesome
      'material-icons', 'material-icons-outlined', 'material-icons-round', 'material-icons-sharp', 'material-symbols-outlined',  // Material Icons
      'glyphicon', 'bi',  // Bootstrap Icons
      'feather', 'lucide', 'heroicon',  // 其他图标库
      'mdi', 'ion', 'ionicon', 'remixicon'  // 其他图标库
    ];

    // 检查类名是否精确匹配图标类名
    for (const cls of classList) {
      if (exactIconClasses.includes(cls)) {
        return true;
      }
      // Font Awesome 的 fa-* 类名
      if (cls.startsWith('fa-') && cls.length > 3) {
        return true;
      }
      // Bootstrap Icons 的 bi-* 类名
      if (cls.startsWith('bi-') && cls.length > 3) {
        return true;
      }
      // Material Design Icons 的 mdi-* 类名
      if (cls.startsWith('mdi-') && cls.length > 4) {
        return true;
      }
      // Remix Icons 的 ri-* 类名
      if (cls.startsWith('ri-') && cls.length > 3) {
        return true;
      }
    }

    // <i> 标签带有图标类名（已在上面检测）或者内容是简单单词
    if (tagName === 'i') {
      const text = element.textContent.trim();
      // Material Icons 使用单词（如 "home", "car", "settings"）
      // 检测是否是短单词（通常图标名不超过 30 个字符，且只有英文字母和下划线）
      if (text.length > 0 && text.length <= 30 && /^[a-z_]+$/i.test(text)) {
        return true;
      }
    }

    // <span> 标签必须有 material-icons 类名（已在上面检测）

    // SVG 图标
    if (tagName === 'svg') {
      return true;
    }

    return false;
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
   * 获取 SVG 元素的填充颜色
   * @param {SVGElement} svgElement - SVG 元素
   * @returns {string|null} 颜色值
   */
  getSvgColor(svgElement) {
    // 1. 检查 SVG 元素的 fill 属性
    const fillAttr = svgElement.getAttribute('fill');
    if (fillAttr && fillAttr !== 'none' && fillAttr !== 'currentColor') {
      return this.normalizeColor(fillAttr);
    }

    // 2. 检查 SVG 内部 path 元素的 fill 属性
    const paths = svgElement.querySelectorAll('path, circle, rect, polygon');
    for (const path of paths) {
      const pathFill = path.getAttribute('fill');
      if (pathFill && pathFill !== 'none' && pathFill !== 'currentColor') {
        return this.normalizeColor(pathFill);
      }
    }

    // 3. 检查计算样式的 fill
    if (window.getComputedStyle) {
      const style = window.getComputedStyle(svgElement);
      const cssFill = style.fill;
      if (cssFill && cssFill !== 'none' && !cssFill.includes('rgb(0, 0, 0)')) {
        return this.normalizeColor(cssFill);
      }
    }

    // 4. 检查 CSS 的 color 属性（SVG 的 currentColor 会继承）
    if (window.getComputedStyle) {
      const style = window.getComputedStyle(svgElement);
      const cssColor = style.color;
      if (cssColor && cssColor !== 'rgb(0, 0, 0)') {
        return this.normalizeColor(cssColor);
      }
    }

    // 5. 检查父元素的 color
    let parent = svgElement.parentElement;
    while (parent) {
      if (window.getComputedStyle) {
        const parentStyle = window.getComputedStyle(parent);
        const parentColor = parentStyle.color;
        if (parentColor && parentColor !== 'rgb(0, 0, 0)') {
          return this.normalizeColor(parentColor);
        }
      }
      parent = parent.parentElement;
    }

    return null;
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
