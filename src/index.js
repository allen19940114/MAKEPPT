/**
 * HTML to PPT 转换器 - 主入口
 */

import { HtmlToPptConverter } from './core/HtmlToPptConverter.js';

class App {
  constructor() {
    this.converter = new HtmlToPptConverter();
    this.currentHtml = '';
    this.previewData = [];

    this.initElements();
    this.bindEvents();
  }

  initElements() {
    // 上传相关
    this.dropZone = document.getElementById('dropZone');
    this.fileInput = document.getElementById('fileInput');
    this.htmlInput = document.getElementById('htmlInput');

    // 预览相关
    this.previewSection = document.getElementById('previewSection');
    this.previewContainer = document.getElementById('previewContainer');
    this.slideCount = document.getElementById('slideCount');

    // 选项相关
    this.optionsSection = document.getElementById('optionsSection');
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
    this.progressFill = document.getElementById('progressFill');
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
        this.handleFile(files[0]);
      }
    });

    // 点击上传
    this.dropZone.addEventListener('click', () => {
      this.fileInput.click();
    });

    this.fileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        this.handleFile(e.target.files[0]);
      }
    });

    // 代码输入
    let inputTimeout;
    this.htmlInput.addEventListener('input', () => {
      clearTimeout(inputTimeout);
      inputTimeout = setTimeout(() => {
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
  }

  async handleFile(file) {
    if (!file.name.match(/\.(html|htm)$/i)) {
      this.showStatus('error', '❌', '请上传 HTML 文件');
      return;
    }

    try {
      this.showStatus('processing', '⏳', '正在读取文件...');

      const reader = new FileReader();
      reader.onload = (e) => {
        this.handleHtmlInput(e.target.result);
      };
      reader.readAsText(file);
    } catch (error) {
      this.showStatus('error', '❌', `读取文件失败: ${error.message}`);
    }
  }

  handleHtmlInput(html) {
    if (!html.trim()) {
      this.hidePreview();
      return;
    }

    this.currentHtml = html;
    this.generatePreview(html);
  }

  generatePreview(html) {
    try {
      this.showStatus('processing', '⏳', '正在解析 HTML...');
      this.updateProgress(30);

      // 获取预览数据
      this.previewData = this.converter.getPreviewData(html);

      this.updateProgress(70);

      // 渲染预览
      this.renderPreview();

      this.updateProgress(100);

      // 显示相关区域
      this.showSections();

      setTimeout(() => {
        this.hideStatus();
      }, 1000);
    } catch (error) {
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
    this.previewSection.style.display = 'block';
    this.optionsSection.style.display = 'block';
    this.actionSection.style.display = 'flex';

    // 添加动画效果
    [this.previewSection, this.optionsSection, this.actionSection].forEach((section, index) => {
      section.classList.add('fade-in');
      section.style.animationDelay = `${index * 0.1}s`;
    });
  }

  async convertAndDownload() {
    if (!this.currentHtml) {
      this.showStatus('error', '❌', '请先输入或上传 HTML');
      return;
    }

    try {
      this.convertBtn.disabled = true;
      this.showStatus('processing', '⏳', '正在生成 PPT...');
      this.updateProgress(0);

      const options = {
        title: this.pptTitle.value || 'Presentation',
        author: this.pptAuthor.value || '',
        preserveAnimations: this.preserveAnimations.checked,
        preserveStyles: this.preserveStyles.checked
      };

      this.updateProgress(20);

      // 转换
      const blob = await this.converter.convert(this.currentHtml, options);

      this.updateProgress(80);

      // 下载
      const filename = `${options.title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_')}.pptx`;
      this.converter.downloadBlob(blob, filename);

      this.updateProgress(100);
      this.showStatus('success', '✅', '转换成功！文件已开始下载');

      setTimeout(() => {
        this.hideStatus();
        this.convertBtn.disabled = false;
      }, 3000);
    } catch (error) {
      console.error('Conversion error:', error);
      this.showStatus('error', '❌', `转换失败: ${error.message}`);
      this.convertBtn.disabled = false;
    }
  }

  reset() {
    this.currentHtml = '';
    this.previewData = [];
    this.htmlInput.value = '';
    this.fileInput.value = '';
    this.pptTitle.value = '';
    this.pptAuthor.value = '';

    this.hidePreview();
    this.hideStatus();
  }

  hidePreview() {
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
  }

  updateProgress(percent) {
    this.progressFill.style.width = `${percent}%`;
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
