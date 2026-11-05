---
title: 项目展示
date: 2026-11-05 14:00:00
type: page
---

<style>
.projects-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

.project-section {
  margin-bottom: 60px;
}

.section-title {
  font-size: 24px;
  font-weight: 600;
  color: var(--font-color, #333);
  margin-bottom: 24px;
  padding-bottom: 12px;
  border-bottom: 2px solid var(--theme-color, #2C6BED);
  display: inline-block;
}

.projects-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 24px;
}

.project-card {
  background: var(--card-bg, #fff);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: var(--card-box-shadow, 0 2px 8px rgba(0,0,0,0.1));
  transition: transform 0.3s ease, box-shadow 0.3s ease;
  display: flex;
  flex-direction: column;
}

.project-card:hover {
  transform: translateY(-6px);
  box-shadow: var(--card-hover-box-shadow, 0 8px 24px rgba(0,0,0,0.15));
}

.project-cover {
  width: 100%;
  height: 180px;
  object-fit: cover;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.project-content {
  padding: 20px;
  flex: 1;
  display: flex;
  flex-direction: column;
}

.project-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.project-icon {
  font-size: 32px;
  line-height: 1;
}

.project-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--font-color, #333);
  margin: 0;
}

.project-subtitle {
  font-size: 13px;
  color: var(--card-meta, #666);
  margin-top: 4px;
}

.project-desc {
  font-size: 14px;
  line-height: 1.7;
  color: var(--font-color, #333);
  opacity: 0.85;
  margin-bottom: 16px;
  flex: 1;
}

.project-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}

.project-tag {
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 12px;
  background: var(--tag-bg, rgba(44, 107, 237, 0.1));
  color: var(--theme-color, #2C6BED);
}

.project-links {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.project-link {
  font-size: 13px;
  padding: 6px 14px;
  border-radius: 6px;
  text-decoration: none;
  transition: all 0.2s ease;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.project-link.primary {
  background: var(--theme-color, #2C6BED);
  color: #fff;
}

.project-link.primary:hover {
  opacity: 0.9;
}

.project-link.secondary {
  background: rgba(0, 0, 0, 0.05);
  color: var(--font-color, #333);
}

.project-link.secondary:hover {
  background: rgba(0, 0, 0, 0.1);
}

.project-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 12px;
  margin-bottom: 12px;
}

.project-status.live {
  background: rgba(34, 197, 94, 0.1);
  color: #16a34a;
}

.project-status.dev {
  background: rgba(234, 179, 8, 0.1);
  color: #ca8a04;
}

.project-status::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

/* 深色模式适配 */
[data-theme="dark"] .project-card {
  background: var(--card-bg, #1e1e1e);
}

[data-theme="dark"] .project-link.secondary {
  background: rgba(255, 255, 255, 0.1);
  color: var(--font-color, #e0e0e0);
}

[data-theme="dark"] .project-link.secondary:hover {
  background: rgba(255, 255, 255, 0.15);
}

[data-theme="dark"] .project-tag {
  background: rgba(44, 107, 237, 0.2);
}

/* 焦点状态（无障碍） */
.project-link:focus,
.project-card:focus-within {
  outline: 2px solid var(--theme-color, #2C6BED);
  outline-offset: 2px;
}

/* 激活状态 */
.project-link:active {
  transform: scale(0.98);
}

.project-card:active {
  transform: translateY(-2px);
}

@media (max-width: 768px) {
  .projects-container {
    padding: 12px;
  }
  
  .projects-grid {
    grid-template-columns: 1fr;
    gap: 16px;
  }
  
  .project-cover {
    height: 160px;
  }
  
  .project-content {
    padding: 16px;
  }
  
  .project-title {
    font-size: 17px;
  }
  
  .project-subtitle {
    font-size: 13px;
  }
  
  .project-desc {
    font-size: 14px;
  }
  
  .project-tag {
    font-size: 12px;
    padding: 5px 10px;
  }
  
  .project-link {
    font-size: 14px;
    padding: 8px 14px;
  }
  
  .project-section {
    margin-bottom: 40px;
  }
}
</style>

<div class="projects-container">

## 移动应用

<div class="project-section">
<div class="projects-grid">

<div class="project-card">
<div class="project-cover" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);"></div>
<div class="project-content">
<div class="project-header">
<div class="project-icon">🧩</div>
<div>
<h3 class="project-title">拾光拼影</h3>
<div class="project-subtitle">Purely Collage · 照片拼图工具</div>
</div>
</div>
<div class="project-status live">已上架</div>
<p class="project-desc">
零网络的本地拼图 App。照片从导入到导出全程在本机处理，绝不上传；无账号、无登录、不收集个人信息。用端上 Vision 框架实现「出圈拼图」效果。
</p>
<div class="project-tags">
<span class="project-tag">iOS</span>
<span class="project-tag">SwiftUI</span>
<span class="project-tag">Vision</span>
<span class="project-tag">隐私优先</span>
</div>
<div class="project-links">
<a href="https://apps.apple.com/app/purely-collage" class="project-link primary" target="_blank">
<i class="fab fa-app-store"></i> App Store
</a>
<a href="/2026/10/07/shiguangpinying-appstore-launch/" class="project-link secondary">
<i class="fas fa-book"></i> 上线复盘
</a>
</div>
</div>
</div>

<div class="project-card">
<div class="project-cover" style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);"></div>
<div class="project-content">
<div class="project-header">
<div class="project-icon">🪞</div>
<div>
<h3 class="project-title">渐识</h3>
<div class="project-subtitle">AI 情绪陪伴 App</div>
</div>
</div>
<div class="project-status live">已上架</div>
<p class="project-desc">
一面帮你看懂自己的镜子。AI 陪伴应用，通过对话帮助用户理解自己的情绪状态，提供情感支持和自我认知工具。
</p>
<div class="project-tags">
<span class="project-tag">iOS</span>
<span class="project-tag">AI</span>
<span class="project-tag">情感陪伴</span>
<span class="project-tag">FastAPI</span>
</div>
<div class="project-links">
<a href="https://www.jianshi.xyz/" class="project-link primary" target="_blank">
<i class="fas fa-globe"></i> 官网
</a>
<a href="/link/" class="project-link secondary">
<i class="fas fa-link"></i> 友链
</a>
</div>
</div>
</div>

</div>
</div>

## Web 平台

<div class="project-section">
<div class="projects-grid">

<div class="project-card">
<div class="project-cover" style="background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);"></div>
<div class="project-content">
<div class="project-header">
<div class="project-icon">🐢</div>
<div>
<h3 class="project-title">海龟汤</h3>
<div class="project-subtitle">悬疑推理游戏平台</div>
</div>
</div>
<div class="project-status live">运营中</div>
<p class="project-desc">
AI 驱动的海龟汤悬疑游戏平台。汤面推理、剧本杀、现场出题，支持多人在线游戏。用 AI 生成谜题和判题，让每局游戏都独一无二。
</p>
<div class="project-tags">
<span class="project-tag">Web</span>
<span class="project-tag">AI</span>
<span class="project-tag">游戏</span>
<span class="project-tag">Vue</span>
</div>
<div class="project-links">
<a href="https://soup.jianshi.xyz" class="project-link primary" target="_blank">
<i class="fas fa-gamepad"></i> 开始游戏
</a>
<a href="/2026/09/15/ai-turtle-soup-platform/" class="project-link secondary">
<i class="fas fa-book"></i> 开发记录
</a>
</div>
</div>
</div>

<div class="project-card">
<div class="project-cover" style="background: linear-gradient(135deg, #a8edea 0%, #fed6e3 100%);"></div>
<div class="project-content">
<div class="project-header">
<div class="project-icon">📝</div>
<div>
<h3 class="project-title">张鹏的博客</h3>
<div class="project-subtitle">Hexo + Butterfly 技术博客</div>
</div>
</div>
<div class="project-status live">运营中</div>
<p class="project-desc">
独立开发者技术博客，记录 AI 实战、Linux 运维、独立开发思考。127 篇文章，涵盖 MCP、AI Agent、Docker 等领域。
</p>
<div class="project-tags">
<span class="project-tag">Hexo</span>
<span class="project-tag">Butterfly</span>
<span class="project-tag">GitHub Pages</span>
<span class="project-tag">127 篇</span>
</div>
<div class="project-links">
<a href="/" class="project-link primary">
<i class="fas fa-home"></i> 首页
</a>
<a href="/archives/" class="project-link secondary">
<i class="fas fa-archive"></i> 归档
</a>
</div>
</div>
</div>

</div>
</div>

## 开源工具

<div class="project-section">
<div class="projects-grid">

<div class="project-card">
<div class="project-cover" style="background: linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%);"></div>
<div class="project-content">
<div class="project-header">
<div class="project-icon">🔌</div>
<div>
<h3 class="project-title">1MCP 共享网关</h3>
<div class="project-subtitle">本机 MCP Server 统一管理</div>
</div>
</div>
<div class="project-status live">日常使用</div>
<p class="project-desc">
本机常驻的 MCP 网关，八个 harness 共享同一组上游 server。配置收敛、凭证只存一处，支持健康检查和自动故障转移。
</p>
<div class="project-tags">
<span class="project-tag">Node.js</span>
<span class="project-tag">MCP</span>
<span class="project-tag">launchd</span>
<span class="project-tag">本地服务</span>
</div>
<div class="project-links">
<a href="/2026/09/27/ai-1mcp-gateway-upstream-crash/" class="project-link secondary">
<i class="fas fa-book"></i> 排障记录
</a>
</div>
</div>
</div>

<div class="project-card">
<div class="project-cover" style="background: linear-gradient(135deg, #d299c2 0%, #fef9d7 100%);"></div>
<div class="project-content">
<div class="project-header">
<div class="project-icon">⚡</div>
<div>
<h3 class="project-title">codearts-proxy</h3>
<div class="project-subtitle">多云模型额度聚合代理</div>
</div>
</div>
<div class="project-status live">日常使用</div>
<p class="project-desc">
零依赖的 Node 22 ESM 服务，把华为云 CodeArts、腾讯 CodeBuddy、WorkBuddy 三家免费模型额度拧成一个本地接口，统一 base URL + API key。
</p>
<div class="project-tags">
<span class="project-tag">Node.js</span>
<span class="project-tag">ESM</span>
<span class="project-tag">API Proxy</span>
<span class="project-tag">LLM</span>
</div>
<div class="project-links">
<a href="/2026/09/26/ai-codearts-proxy-gateway/" class="project-link secondary">
<i class="fas fa-book"></i> 设计文档
</a>
</div>
</div>
</div>

<div class="project-card">
<div class="project-cover" style="background: linear-gradient(135deg, #89f7fe 0%, #66a6ff 100%);"></div>
<div class="project-content">
<div class="project-header">
<div class="project-icon">🤖</div>
<div>
<h3 class="project-title">Agent 团队</h3>
<div class="project-subtitle">AI 助手协作系统</div>
</div>
</div>
<div class="project-status live">日常使用</div>
<p class="project-desc">
7 个 AI 助手角色：司南（总管家）、烛龙（试验场）、干将（写代码）、鲁班（干重活）、墨翟（写代码）、白泽（军师）、谛听（干杂活）。全员共享跨工具记忆库。
</p>
<div class="project-tags">
<span class="project-tag">AI Agent</span>
<span class="project-tag">多角色</span>
<span class="project-tag">记忆系统</span>
<span class="project-tag">协作</span>
</div>
<div class="project-links">
<a href="/about/" class="project-link secondary">
<i class="fas fa-users"></i> 团队介绍
</a>
</div>
</div>
</div>

</div>
</div>

## 技术栈

<div class="project-section">
<div class="projects-grid">

<div class="project-card">
<div class="project-cover" style="background: linear-gradient(135deg, #c3cfe2 0%, #f5f7fa 100%);"></div>
<div class="project-content">
<div class="project-header">
<div class="project-icon">🐳</div>
<div>
<h3 class="project-title">Docker 实验田</h3>
<div class="project-subtitle">容器化批量实测</div>
</div>
</div>
<div class="project-status dev">持续探索</div>
<p class="project-desc">
把 Docker 容器当实验田，批量实测各种技术方案。隔离环境、快速重建、可复现，适合做对比测试和边界探索。
</p>
<div class="project-tags">
<span class="project-tag">Docker</span>
<span class="project-tag">容器</span>
<span class="project-tag">测试</span>
<span class="project-tag">自动化</span>
</div>
<div class="project-links">
<a href="/2026/09/15/docker-lab-experiments/" class="project-link secondary">
<i class="fas fa-book"></i> 使用心得
</a>
</div>
</div>
</div>

<div class="project-card">
<div class="project-cover" style="background: linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%);"></div>
<div class="project-content">
<div class="project-header">
<div class="project-icon">📡</div>
<div>
<h3 class="project-title">Hermes 简报系统</h3>
<div class="project-subtitle">自动情报收集与推送</div>
</div>
</div>
<div class="project-status live">日常使用</div>
<p class="project-desc">
Mac 上的 agent 守护进程，每天从 arXiv、GitHub releases、技术博客抓取新内容，整理成中文简报，定时推送到 QQ。
</p>
<div class="project-tags">
<span class="project-tag">Python</span>
<span class="project-tag">cron</span>
<span class="project-tag">LLM</span>
<span class="project-tag">QQ Bot</span>
</div>
<div class="project-links">
<a href="/2026/09/14/cron-brief-system-troubleshooting/" class="project-link secondary">
<i class="fas fa-book"></i> 排障复盘
</a>
</div>
</div>
</div>

</div>
</div>

</div>
