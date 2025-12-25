/**
 * HTML to PPT 转换器 - 主入口
 */

import { HtmlToPptConverter } from './core/HtmlToPptConverter.js';

class App {
  constructor() {
    this.converter = new HtmlToPptConverter();
    this.currentHtml = '';
    this.previewData = [];
    this.logs = [];
    this.currentSlideIndex = 0;
    this.slidesHtml = [];  // 存储每张幻灯片的 HTML

    this.initElements();
    this.bindEvents();
    this.log('info', '应用初始化完成');
  }

  initElements() {
    // 上传相关
    this.dropZone = document.getElementById('dropZone');
    this.fileInput = document.getElementById('fileInput');
    this.htmlInput = document.getElementById('htmlInput');
    this.uploadBtn = document.getElementById('uploadBtn');

    // 预览相关
    this.previewSection = document.getElementById('previewSection');
    this.previewContainer = document.getElementById('previewContainer');
    this.slideCount = document.getElementById('slideCount');

    // 双排对比预览相关
    this.compareSection = document.getElementById('compareSection');
    this.htmlPreviewFrame = document.getElementById('htmlPreviewFrame');
    this.pptPreviewCanvas = document.getElementById('pptPreviewCanvas');
    this.prevSlideBtn = document.getElementById('prevSlideBtn');
    this.nextSlideBtn = document.getElementById('nextSlideBtn');
    this.slideIndicator = document.getElementById('slideIndicator');

    // 选项相关
    this.optionsSection = document.getElementById('optionsSection');
    this.aspectRatio = document.getElementById('aspectRatio');
    this.pptTitle = document.getElementById('pptTitle');
    this.pptAuthor = document.getElementById('pptAuthor');
    this.preserveAnimations = document.getElementById('preserveAnimations');
    this.preserveStyles = document.getElementById('preserveStyles');

    // 操作按钮
    this.actionSection = document.getElementById('actionSection');
    this.convertBtn = document.getElementById('convertBtn');
    this.resetBtn = document.getElementById('resetBtn');

    // 状态栏
    this.statusBar = document.getElementById('statusBar');
    this.statusIcon = document.getElementById('statusIcon');
    this.statusText = document.getElementById('statusText');
    this.progressDetail = document.getElementById('progressDetail');
    this.progressFill = document.getElementById('progressFill');

    // 日志区域
    this.logSection = document.getElementById('logSection');
    this.logContainer = document.getElementById('logContainer');
    this.logToggle = document.getElementById('logToggle');
  }

  bindEvents() {
    // 拖放事件
    this.dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.dropZone.classList.add('drag-over');
    });

    this.dropZone.addEventListener('dragleave', () => {
      this.dropZone.classList.remove('drag-over');
    });

    this.dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      this.dropZone.classList.remove('drag-over');
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        this.log('info', `拖放文件: ${files[0].name}`);
        this.handleFile(files[0]);
      }
    });

    // 点击上传按钮
    this.uploadBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.fileInput.click();
    });

    // 点击上传区域（非按钮区域）
    this.dropZone.addEventListener('click', (e) => {
      // 如果点击的是按钮或 input，不触发
      if (e.target.id === 'uploadBtn' || e.target.id === 'fileInput') {
        return;
      }
      this.fileInput.click();
    });

    // 文件选择
    this.fileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        this.log('info', `选择文件: ${e.target.files[0].name}`);
        this.handleFile(e.target.files[0]);
      }
    });

    // 代码输入
    let inputTimeout;
    this.htmlInput.addEventListener('input', () => {
      clearTimeout(inputTimeout);
      inputTimeout = setTimeout(() => {
        if (this.htmlInput.value.trim()) {
          this.log('info', '检测到 HTML 代码输入');
        }
        this.handleHtmlInput(this.htmlInput.value);
      }, 500);
    });

    // 转换按钮
    this.convertBtn.addEventListener('click', () => {
      this.convertAndDownload();
    });

    // 重置按钮
    this.resetBtn.addEventListener('click', () => {
      this.reset();
    });

    // 日志折叠
    if (this.logToggle) {
      this.logToggle.addEventListener('click', () => {
        this.logContainer.classList.toggle('collapsed');
        this.logToggle.textContent = this.logContainer.classList.contains('collapsed') ? '展开' : '收起';
      });
    }

    // 幻灯片导航按钮
    if (this.prevSlideBtn) {
      this.prevSlideBtn.addEventListener('click', () => this.navigateSlide(-1));
    }
    if (this.nextSlideBtn) {
      this.nextSlideBtn.addEventListener('click', () => this.navigateSlide(1));
    }
  }

  async handleFile(file) {
    if (!file.name.match(/\.(html|htm)$/i)) {
      this.log('error', `文件格式不支持: ${file.name}`);
      this.showStatus('error', '❌', '请上传 HTML 文件');
      return;
    }

    try {
      this.showStatus('processing', '⏳', '正在读取文件...');
      this.log('info', `开始读取文件: ${file.name} (${(file.size / 1024).toFixed(2)} KB)`);

      const reader = new FileReader();

      reader.onload = (e) => {
        this.log('success', `文件读取成功: ${file.name}`);
        this.handleHtmlInput(e.target.result);
      };

      reader.onerror = (e) => {
        this.log('error', `文件读取失败: ${e.target.error}`);
        this.showStatus('error', '❌', `读取文件失败: ${e.target.error}`);
      };

      reader.readAsText(file);
    } catch (error) {
      this.log('error', `文件处理异常: ${error.message}`);
      this.showStatus('error', '❌', `读取文件失败: ${error.message}`);
    }
  }

  handleHtmlInput(html) {
    if (!html.trim()) {
      this.hidePreview();
      return;
    }

    this.currentHtml = html;
    this.log('info', `HTML 内容长度: ${html.length} 字符`);
    this.generatePreview(html);
  }

  generatePreview(html) {
    try {
      this.showStatus('processing', '⏳', '正在解析 HTML...');
      this.updateProgress(10, '解析中...');
      this.log('info', '开始解析 HTML 结构...');

      // 获取预览数据
      this.previewData = this.converter.getPreviewData(html);
      this.log('success', `识别到 ${this.previewData.length} 张幻灯片`);

      this.updateProgress(50, `识别到 ${this.previewData.length} 张幻灯片`);

      // 渲染预览
      this.renderPreview();
      this.log('info', '预览渲染完成');

      this.updateProgress(100, '解析完成');

      // 显示相关区域
      this.showSections();
      this.showLogSection();

      this.showStatus('success', '✅', `解析成功！识别到 ${this.previewData.length} 张幻灯片`);

      setTimeout(() => {
        this.hideStatus();
      }, 2000);
    } catch (error) {
      this.log('error', `解析失败: ${error.message}`);
      this.showStatus('error', '❌', `解析失败: ${error.message}`);
    }
  }

  renderPreview() {
    this.previewContainer.innerHTML = '';

    this.previewData.forEach((slide, index) => {
      const slideEl = document.createElement('div');
      slideEl.className = 'slide-preview fade-in';
      slideEl.style.animationDelay = `${index * 0.1}s`;

      // 设置背景
      if (slide.hasBackground) {
        slideEl.style.background = slide.backgroundColor || '#f0f0f0';
      }

      slideEl.innerHTML = `
        <div class="slide-number">${index + 1}</div>
        <div class="slide-title">${this.escapeHtml(slide.title)}</div>
        <div class="slide-content">${slide.elementCount} 个元素</div>
      `;

      this.previewContainer.appendChild(slideEl);
    });

    this.slideCount.textContent = `${this.previewData.length} 张幻灯片`;
  }

  showSections() {
    this.compareSection.style.display = 'block';
    this.previewSection.style.display = 'block';
    this.optionsSection.style.display = 'block';
    this.actionSection.style.display = 'flex';

    // 添加动画效果
    [this.compareSection, this.previewSection, this.optionsSection, this.actionSection].forEach((section, index) => {
      section.classList.add('fade-in');
      section.style.animationDelay = `${index * 0.1}s`;
    });

    // 初始化双排预览
    this.initComparePreview();
  }

  // 初始化双排对比预览
  initComparePreview() {
    if (this.previewData.length === 0) return;

    this.currentSlideIndex = 0;
    this.extractSlidesHtml();
    this.updateComparePreview();
    this.updateNavButtons();
  }

  // 从 HTML 中提取每张幻灯片
  extractSlidesHtml() {
    this.slidesHtml = [];
    const parser = new DOMParser();
    const doc = parser.parseFromString(this.currentHtml, 'text/html');

    // 尝试不同的幻灯片选择器
    const selectors = ['section', '.slide', '.page', '[data-slide]', '.swiper-slide'];
    let slideElements = null;

    for (const selector of selectors) {
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

    // 提取样式
    const styles = doc.querySelectorAll('style');
    let styleContent = '';
    styles.forEach(s => styleContent += s.outerHTML);

    // 提取 link 样式表
    const links = doc.querySelectorAll('link[rel="stylesheet"]');
    let linkContent = '';
    links.forEach(l => linkContent += l.outerHTML);

    slideElements.forEach((el) => {
      // 创建完整的 HTML 文档用于 iframe
      const slideHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          ${linkContent}
          ${styleContent}
          <style>
            body {
              margin: 0;
              padding: 0;
              display: flex;
              justify-content: center;
              align-items: center;
              min-height: 100vh;
              overflow: hidden;
            }
            .slide-container {
              width: 100%;
              height: 100%;
              display: flex;
              justify-content: center;
              align-items: center;
            }
          </style>
        </head>
        <body>
          <div class="slide-container">
            ${el.outerHTML}
          </div>
        </body>
        </html>
      `;
      this.slidesHtml.push(slideHtml);
    });
  }

  // 更新双排对比预览
  updateComparePreview() {
    if (this.slidesHtml.length === 0) return;

    const slideHtml = this.slidesHtml[this.currentSlideIndex];

    // 更新 HTML 预览 (iframe)
    if (this.htmlPreviewFrame) {
      const iframeDoc = this.htmlPreviewFrame.contentDocument || this.htmlPreviewFrame.contentWindow.document;
      iframeDoc.open();
      iframeDoc.write(slideHtml);
      iframeDoc.close();
    }

    // 更新 PPT 模拟预览
    this.renderPptPreview(this.currentSlideIndex);

    // 更新指示器
    if (this.slideIndicator) {
      this.slideIndicator.textContent = `${this.currentSlideIndex + 1} / ${this.slidesHtml.length}`;
    }
  }

  // 渲染 PPT 模拟预览
  renderPptPreview(slideIndex) {
    if (!this.pptPreviewCanvas) return;

    this.pptPreviewCanvas.innerHTML = '';

    // 获取解析的幻灯片数据（从 converter 获取实际元素）
    const slides = this.converter.parseHtml(this.currentHtml);
    const slideData = slides[slideIndex];

    if (!slideData) {
      this.pptPreviewCanvas.innerHTML = '<div style="text-align:center;color:#999;padding:20px;">无法加载预览</div>';
      return;
    }

    // 设置背景
    if (slideData.background?.color) {
      this.pptPreviewCanvas.style.background = slideData.background.color;
    } else if (slideData.background?.gradient) {
      this.pptPreviewCanvas.style.background = `linear-gradient(${slideData.background.gradient.value})`;
    } else {
      this.pptPreviewCanvas.style.background = '#ffffff';
    }

    // 获取画布尺寸
    const canvasRect = this.pptPreviewCanvas.getBoundingClientRect();
    const canvasWidth = canvasRect.width || 400;
    const canvasHeight = canvasRect.height || 225;

    // 假设原始 HTML 是 1920x1080，计算缩放
    const scaleX = canvasWidth / 1920;
    const scaleY = canvasHeight / 1080;
    const scale = Math.min(scaleX, scaleY);

    // 渲染元素
    this.renderElements(slideData.elements, scale, canvasWidth, canvasHeight);

    // 创建预览提示（在底部）
    const infoDiv = document.createElement('div');
    infoDiv.style.cssText = `
      position: absolute;
      bottom: 5px;
      right: 5px;
      background: rgba(0,0,0,0.5);
      color: white;
      padding: 3px 8px;
      border-radius: 3px;
      font-size: 10px;
      z-index: 100;
    `;
    infoDiv.textContent = `${slideIndex + 1}/${slides.length} - ${slideData.elements.length} 元素`;
    this.pptPreviewCanvas.appendChild(infoDiv);
  }

  // 渲染幻灯片元素到 PPT 预览区
  renderElements(elements, scale, canvasWidth, canvasHeight) {
    const offsetX = (canvasWidth - 1920 * scale) / 2;
    const offsetY = (canvasHeight - 1080 * scale) / 2;

    for (const element of elements) {
      this.renderElement(element, scale, offsetX, offsetY);

      // 递归渲染子元素
      if (element.children && element.children.length > 0) {
        this.renderElements(element.children, scale, canvasWidth, canvasHeight);
      }
    }
  }

  // 渲染单个元素
  renderElement(element, scale, offsetX, offsetY) {
    const div = document.createElement('div');
    div.className = 'ppt-element';

    // 计算位置
    const x = element.position.x * scale + offsetX;
    const y = element.position.y * scale + offsetY;
    const w = element.position.width * scale;
    const h = element.position.height * scale;

    // 基础样式
    div.style.cssText = `
      position: absolute;
      left: ${x}px;
      top: ${y}px;
      width: ${w > 0 ? w + 'px' : 'auto'};
      height: ${h > 0 ? h + 'px' : 'auto'};
      overflow: hidden;
      box-sizing: border-box;
    `;

    // 根据元素类型渲染
    switch (element.type) {
      case 'heading':
      case 'paragraph':
      case 'text':
        if (element.text) {
          div.classList.add('ppt-element-text');
          div.textContent = element.text;

          // 应用文本样式
          if (element.styles) {
            div.style.fontFamily = element.styles.fontFamily || 'Arial';
            div.style.fontSize = element.styles.fontSize ?
              (parseFloat(element.styles.fontSize) * scale) + 'px' : (14 * scale) + 'px';
            div.style.fontWeight = element.styles.fontWeight || 'normal';
            div.style.color = element.styles.color || '#000';
            div.style.textAlign = element.styles.textAlign || 'left';
          }

          // 标题样式
          if (element.type === 'heading') {
            div.style.fontWeight = 'bold';
            const level = parseInt(element.tagName?.replace('h', '') || '1');
            const sizes = { 1: 32, 2: 28, 3: 24, 4: 20, 5: 18, 6: 16 };
            div.style.fontSize = (sizes[level] || 24) * scale + 'px';
          }
        }
        break;

      case 'image':
        if (element.src && !element.src.startsWith('blob:')) {
          const img = document.createElement('img');
          img.src = element.src;
          img.style.cssText = 'max-width: 100%; max-height: 100%; object-fit: contain;';
          img.onerror = () => { div.innerHTML = '<span style="color:#999;font-size:10px;">图片</span>'; };
          div.appendChild(img);
        } else {
          div.innerHTML = '<span style="color:#999;font-size:10px;">[图片]</span>';
        }
        break;

      case 'container':
        // 容器可能有背景色
        if (element.styles?.backgroundColor) {
          div.style.backgroundColor = element.styles.backgroundColor;
        }
        if (element.styles?.borderRadius) {
          div.style.borderRadius = element.styles.borderRadius;
        }
        break;

      default:
        // 其他类型如果有文本也显示
        if (element.text) {
          div.textContent = element.text;
          div.style.fontSize = (12 * scale) + 'px';
        }
    }

    // 只有当元素有实际内容或有尺寸时才添加
    if (div.textContent || div.children.length > 0 || (w > 5 && h > 5 && element.styles?.backgroundColor)) {
      this.pptPreviewCanvas.appendChild(div);
    }
  }

  // 导航到上一张/下一张幻灯片
  navigateSlide(direction) {
    const newIndex = this.currentSlideIndex + direction;
    if (newIndex >= 0 && newIndex < this.slidesHtml.length) {
      this.currentSlideIndex = newIndex;
      this.updateComparePreview();
      this.updateNavButtons();
    }
  }

  // 更新导航按钮状态
  updateNavButtons() {
    if (this.prevSlideBtn) {
      this.prevSlideBtn.disabled = this.currentSlideIndex <= 0;
    }
    if (this.nextSlideBtn) {
      this.nextSlideBtn.disabled = this.currentSlideIndex >= this.slidesHtml.length - 1;
    }
  }

  async convertAndDownload() {
    if (!this.currentHtml) {
      this.showStatus('error', '❌', '请先输入或上传 HTML');
      return;
    }

    const totalSlides = this.previewData.length;

    try {
      this.convertBtn.disabled = true;
      this.showStatus('processing', '⏳', '正在准备生成 PPT...');
      this.updateProgress(0, `0/${totalSlides} 页`);
      this.showLogSection();
      this.log('info', '开始 PPT 生成流程...');

      const aspectRatio = this.aspectRatio.value || '16:9';
      const options = {
        title: this.pptTitle.value || 'Presentation',
        author: this.pptAuthor.value || '',
        aspectRatio: aspectRatio,
        preserveAnimations: this.preserveAnimations.checked,
        preserveStyles: this.preserveStyles.checked,
        // 添加进度回调
        onProgress: (current, total, message) => {
          const percent = Math.round((current / total) * 100);
          this.updateProgress(percent, `${current}/${total} 页`);
          this.log('info', message || `处理第 ${current}/${total} 页`);
        }
      };

      this.log('info', `配置: 标题="${options.title}", 作者="${options.author}", 比例=${aspectRatio}`);
      this.log('info', `配置: 保留动画=${options.preserveAnimations}, 保留样式=${options.preserveStyles}`);

      this.updateProgress(5, '初始化...');
      this.log('info', '初始化 PPT 文档...');

      // 转换
      const blob = await this.converter.convert(this.currentHtml, options);

      this.log('success', `PPT 生成成功，文件大小: ${(blob.size / 1024).toFixed(2)} KB`);
      this.updateProgress(95, '准备下载...');

      // 下载
      const filename = `${options.title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_')}.pptx`;
      this.converter.downloadBlob(blob, filename);
      this.log('success', `文件下载已触发: ${filename}`);

      this.updateProgress(100, '完成');
      this.showStatus('success', '✅', `转换成功！文件 "${filename}" 已开始下载`);

      setTimeout(() => {
        this.hideStatus();
        this.convertBtn.disabled = false;
      }, 5000);
    } catch (error) {
      console.error('Conversion error:', error);
      this.log('error', `转换失败: ${error.message}`);
      this.log('error', `错误堆栈: ${error.stack}`);
      this.showStatus('error', '❌', `转换失败: ${error.message}`);
      this.convertBtn.disabled = false;
    }
  }

  reset() {
    this.currentHtml = '';
    this.previewData = [];
    this.slidesHtml = [];
    this.currentSlideIndex = 0;
    this.htmlInput.value = '';
    this.fileInput.value = '';
    this.pptTitle.value = '';
    this.pptAuthor.value = '';
    this.logs = [];

    this.hidePreview();
    this.hideStatus();
    this.hideLogSection();
    this.log('info', '已重置所有内容');
  }

  hidePreview() {
    this.compareSection.style.display = 'none';
    this.previewSection.style.display = 'none';
    this.optionsSection.style.display = 'none';
    this.actionSection.style.display = 'none';
  }

  showStatus(type, icon, text) {
    this.statusBar.style.display = 'block';
    this.statusBar.className = `status-bar ${type}`;
    this.statusIcon.textContent = icon;
    this.statusText.textContent = text;

    if (type === 'processing') {
      this.statusBar.classList.add('processing');
    }
  }

  hideStatus() {
    this.statusBar.style.display = 'none';
    this.progressFill.style.width = '0%';
    this.progressDetail.textContent = '';
  }

  updateProgress(percent, detail = '') {
    this.progressFill.style.width = `${percent}%`;
    if (detail) {
      this.progressDetail.textContent = detail;
    }
  }

  showLogSection() {
    if (this.logSection) {
      this.logSection.style.display = 'block';
    }
  }

  hideLogSection() {
    if (this.logSection) {
      this.logSection.style.display = 'none';
    }
    if (this.logContainer) {
      this.logContainer.innerHTML = '';
    }
  }

  log(type, message) {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('zh-CN', { hour12: false });

    const logEntry = { type, message, time: timeStr };
    this.logs.push(logEntry);

    // 控制台输出
    const consoleMethod = type === 'error' ? 'error' : type === 'warning' ? 'warn' : 'log';
    console[consoleMethod](`[${timeStr}] ${message}`);

    // UI 输出
    if (this.logContainer) {
      const entryEl = document.createElement('div');
      entryEl.className = `log-entry ${type}`;
      entryEl.innerHTML = `<span class="log-time">[${timeStr}]</span>${this.escapeHtml(message)}`;
      this.logContainer.appendChild(entryEl);
      this.logContainer.scrollTop = this.logContainer.scrollHeight;
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});
