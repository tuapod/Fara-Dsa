// src/browser.js — Playwright controller for chat.deepseek.com
'use strict';

const { chromium } = require('playwright');
const path = require('path');
const config = require('./config');
const logger = require('./logger');

const SEL = {
  chatInput: ['#chat-input', 'textarea[placeholder]', 'textarea', '[contenteditable="true"][role="textbox"]', '[contenteditable="true"]'],
  sendButton: ['button[aria-label*="Send" i]', '[data-testid="send-button"]', 'button[type="submit"]', '[class*="send-btn"]'],
  newChat: ['button[aria-label*="New chat" i]', 'a[href="/"][aria-label]', '[data-testid="new-chat"]'],
};

class DeepSeekBrowser {
  constructor() {
    this.context = null;
    this.page = null;
    this._closed = false;
  }

  async launch() {
    console.log('🔵 [Browser] Checking session...');
    const sessionDir = path.resolve(config.SESSION_DIR);
    let isLoggedIn = false;

    try {
      console.log('🔵 [Browser] Attempting to launch hidden browser...');
      this.context = await this._createContext(sessionDir, true);
      this.page = await this._setupPage(this.context);
      isLoggedIn = await this._checkLoginStatus();
    } catch (err) {
      console.log('⚠️ [Browser] Hidden launch failed. Will try visible mode.');
      if (this.context) await this.context.close();
    }

    if (!isLoggedIn) {
      console.log('🔐 [Browser] Not logged in (or session expired). Opening visible browser for login...');
      if (this.context) await this.context.close();
      this.context = await this._createContext(sessionDir, false);
      this.page = await this._setupPage(this.context);
      await this._waitForManualLogin();
    }
    console.log('🟢 [Browser] Initialization complete.');
  }

  async _createContext(sessionDir, isHeadless) {
    return await chromium.launchPersistentContext(sessionDir, {
      headless: isHeadless,
      viewport: { width: 1280, height: 900 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      args: ['--disable-blink-features=AutomationControlled', '--no-first-run'],
      ignoreDefaultArgs: ['--enable-automation'],
    });
  }

  async _setupPage(context) {
    const pages = context.pages();
    const page = pages.length > 0 ? pages[0] : await context.newPage();
    await page.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => false }); });
    await page.goto(config.DEEPSEEK_URL, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(2000);
    return page;
  }

  async _checkLoginStatus() {
    return await this.page.evaluate(() => {
      const needsLogin = (
        window.location.href.includes('/auth') || 
        window.location.href.includes('/login') || 
        !!document.querySelector('input[type="password"]')
      );
      return !needsLogin;
    });
  }

  async _waitForManualLogin() {
    console.log('\n🔐 [Browser] Please log in to DeepSeek in the opened browser window. Waiting...\n');
    const start = Date.now();
    while (Date.now() - start < 300000) {
      await this.page.waitForTimeout(2000);
      const loggedIn = await this._checkLoginStatus();
      if (loggedIn) {
        console.log('\n✅ [Browser] Login successful! Saving session...\n');
        await this.page.waitForTimeout(2000);
        return;
      }
    }
    throw new Error('Login timeout. Please restart the app.');
  }

  async close() {
    if (this._closed) return;
    this._closed = true;
    try { await this.context?.close(); } catch {}
  }

  async newChat() {
    for (const sel of SEL.newChat) {
      try {
        const el = await this.page.$(sel);
        if (el && await el.isVisible()) {
          await el.click(); await this.page.waitForTimeout(1000); return;
        }
      } catch {}
    }
    await this.page.goto(config.DEEPSEEK_URL);
  }

  async getChatHistory() {
    await this.page.waitForTimeout(1000);
    const chats = await this.page.evaluate(() => {
      const selectors = ['aside a[href*="/a/chat/s/"]', 'a[href*="/a/chat/s/"]'];
      let links = [];
      for (const sel of selectors) {
        links = Array.from(document.querySelectorAll(sel));
        if (links.length > 0) break;
      }
      return links.map(link => {
        const href = link.getAttribute('href') || '';
        const match = href.match(/\/a\/chat\/s\/([a-f0-9-]+)/i);
        if (!match) return null;
        return { id: match[1], url: href, title: link.innerText.trim() || '(Untitled)' };
      }).filter(c => c !== null);
    });
    return chats;
  }

  async navigateToChat(chatId) {
    const url = `https://chat.deepseek.com/a/chat/s/${chatId}`;
    console.log(`🔵 [Browser] Navigating to chat: ${url}`);
    await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    try {
      await this.page.waitForSelector('.ds-markdown, [class*="user"]', { timeout: 5000 });
    } catch (e) {
      console.log('⚠️ No messages found in this chat (might be empty).');
    }
    await this.page.waitForTimeout(1000);
    console.log('🟢 [Browser] Chat loaded.');
  }

  async getCurrentChatMessages() {
    await this.page.evaluate(() => {
      const main = document.querySelector('main');
      if (main) main.scrollTop = 0;
    });
    await this.page.waitForTimeout(800);

    return await this.page.evaluate(() => {
      const messages = [];
      const container = document.querySelector('main');
      if (!container) return [];

      const blocks = Array.from(container.querySelectorAll('.ds-markdown, [class*="user-message"], [class*="user-msg"]'));
      const sortedBlocks = blocks.sort((a, b) => {
        const pos = a.compareDocumentPosition(b);
        if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
        if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
        return 0;
      });

      sortedBlocks.forEach(block => {
        const text = block.innerText.trim();
        if (!text) return;
        if (block.classList.contains('ds-markdown')) {
          messages.push({ role: 'ai', content: text });
        } else {
          messages.push({ role: 'user', content: text });
        }
      });

      return messages;
    });
  }

  async deleteChat(chatId) {
    console.log(`🔵 [Browser] Deleting chat: ${chatId}`);
    await this.page.goto(`https://chat.deepseek.com/`, { waitUntil: 'domcontentloaded' });
    await this.page.waitForTimeout(2000);

    const chatSelector = `a[href*="${chatId}"]`;
    try {
      const chatLink = await this.page.waitForSelector(chatSelector, { timeout: 10000 });
      const parent = await chatLink.evaluateHandle(el => el.closest('div[class*="group"]') || el.closest('li') || el.parentElement);
      await parent.hover();
      await this.page.waitForTimeout(800);

      const moreBtn = await parent.$('div[role="button"][class*="ds-button--icon"]');
      if (moreBtn) {
        await moreBtn.click();
      } else {
        await parent.evaluate(el => {
          const btns = el.querySelectorAll('div[role="button"]');
          if (btns.length > 0) btns[btns.length - 1].click();
        });
      }
      
      await this.page.waitForTimeout(1000);

      const menuContainer = await this.page.waitForSelector('.ds-floating-position-wrapper', { timeout: 5000 }).catch(() => null);
      
      let deleteClicked = false;
      if (menuContainer) {
        const deleteOption = await menuContainer.$('div:has-text("Delete"), div:has-text("حذف"), [role="menuitem"]:has-text("Delete")');
        if (deleteOption) {
          await deleteOption.click();
          deleteClicked = true;
        } else {
          const trashIcon = await menuContainer.$('svg path[d^="M3 6h18"]');
          if (trashIcon) {
            const clickable = await trashIcon.evaluateHandle(el => el.closest('div[role="button"]') || el.closest('div[class*="item"]') || el.parentElement);
            await clickable.click();
            deleteClicked = true;
          }
        }
      }

      if (!deleteClicked) throw new Error("Could not find 'Delete' option in context menu.");
      await this.page.waitForSelector('text="This chat can\'t be recovered."', { timeout: 5000 }).catch(() => {});
      
      const confirmBtn = this.page.locator('button', { hasText: 'Delete chat' }).or(this.page.locator('button', { hasText: 'Delete' }));
      try {
        await confirmBtn.click({ force: true, timeout: 5000 });
      } catch (e) {
        const redBtn = this.page.locator('.ds-button--danger, button[class*="red"]').last();
        await redBtn.click({ force: true });
      }

      await this.page.waitForTimeout(3000);

      const stillExists = await this.page.$(chatSelector);
      if (stillExists) throw new Error("Chat still exists after deletion.");

      console.log('🟢 [Browser] Chat deleted successfully.');
      return true;
    } catch (err) {
      console.error('Delete failed:', err.message);
      throw err;
    }
  }

  async sendMessage(text) {
    let el; let isTextarea = false;
    for (const sel of SEL.chatInput) {
      try {
        el = await this.page.waitForSelector(sel, { timeout: 4000, state: 'visible' });
        if (el) { isTextarea = await el.evaluate(e => e.tagName.toLowerCase() === 'textarea'); break; }
      } catch {}
    }
    if (!el) throw new Error('Cannot find chat input box.');

    await el.click({ force: true });
    await this.page.keyboard.press('Control+a');
    
    if (isTextarea) {
      await el.fill(text);
    } else {
      await this.page.evaluate((element, content) => {
        element.focus();
        document.execCommand('selectAll', false, null);
        document.execCommand('delete', false, null);
        document.execCommand('insertText', false, content);
        element.dispatchEvent(new InputEvent('input', { bubbles: true, data: content }));
      }, el, text);
    }

    await this.page.waitForTimeout(config.SEND_DELAY);
    let clicked = false;
    for (const sel of SEL.sendButton) {
      try {
        const btn = await this.page.$(sel);
        if (btn && await btn.isVisible()) { await btn.click(); clicked = true; break; }
      } catch {}
    }
    if (!clicked) await this.page.keyboard.press('Enter');
    await this.page.waitForTimeout(500);
  }

  async waitForResponse(onProgress) {
    const timeout = config.RESPONSE_TIMEOUT;
    const stableDelay = config.STABLE_DELAY;
    const start = Date.now();

    const initialCount = await this._getMessageCount();
    while (Date.now() - start < 12000) {
      if (await this._getMessageCount() > initialCount) break;
      await this.page.waitForTimeout(400);
    }

    let lastText = '';
    let stableStart = null;

    while (Date.now() - start < timeout) {
      const text = await this._extractLastMessage();
      if (text !== lastText) {
        lastText = text;
        stableStart = null;
        if (onProgress) onProgress(text);
      } else if (text.length > 0) {
        if (!stableStart) stableStart = Date.now();
        else if (Date.now() - stableStart >= stableDelay) {
          if (!await this._isGenerating()) break;
          stableStart = null;
        }
      }
      await this.page.waitForTimeout(500);
    }

    const final = await this._extractLastMessage();
    return this._cleanText(final);
  }

  async _getMessageCount() {
    return await this.page.evaluate(() => {
      const sels = ['.ds-markdown', '[class*="assistant"]', '[class*="markdown-content"]', '[class*="chat-message"]'];
      for (const s of sels) { const c = document.querySelectorAll(s).length; if (c > 0) return c; }
      return document.querySelectorAll('[class*="message"]').length;
    });
  }

  async _extractLastMessage() {
    return await this.page.evaluate(() => {
      function getFullText(el) {
        if (!el) return '';
        let result = '';
        function walk(node) {
          if (node.nodeType === Node.TEXT_NODE) { result += node.textContent; return; }
          if (node.nodeType !== Node.ELEMENT_NODE) return;
          const tag = node.tagName.toLowerCase();
          if (tag === 'pre') {
            const code = node.querySelector('code');
            if (code) {
              const lang = (code.className.match(/language-(\S+)/) || [])[1] || '';
              result += '\n```' + lang + '\n' + code.textContent + '\n```\n';
            } else { result += '\n```\n' + node.textContent + '\n```\n'; }
            return;
          }
          if (tag === 'code') { if (node.parentElement?.tagName.toLowerCase() !== 'pre') result += '`' + node.textContent + '`'; return; }
          for (const child of node.childNodes) walk(child);
          if (['p','div','li','br','h1','h2','h3'].includes(tag)) result += '\n';
        }
        walk(el); return result.trim();
      }

      const sels = ['.ds-markdown', '[class*="assistant"] [class*="markdown"]', '[class*="markdown"]', '[class*="message-content"]'];
      for (const s of sels) {
        const els = document.querySelectorAll(s);
        if (els.length > 0) { const t = getFullText(els[els.length - 1]); if (t.length > 0) return t; }
      }
      return '';
    });
  }

  async _isGenerating() {
    return await this.page.evaluate(() => {
      const stopSels = ['button[aria-label*="Stop" i]', '[class*="stop-gen"]', '[class*="generating"]'];
      for (const s of stopSels) {
        const el = document.querySelector(s);
        if (el && window.getComputedStyle(el).display !== 'none') return true;
      }
      return false;
    });
  }

  _cleanText(text) {
    if (!text) return '';
    return text
      .replace(/<think>[\s\S]*?<\/think>\n?/gi, '')
      .replace(/^Thinking\.{0,3}\n[\s\S]*?\n\n/m, '')
      .replace(/<ds_safety>[\s\S]*?<\/ds_safety>\s*Safe/gi, '')
      .replace(/<ds_safety>[\s\S]*?<\/ds_safety>/gi, '')
      .replace(/<ds_safety>[\s\S]*$/gi, '')
      .replace(/\[用户未成年\][\s\S]*$/gi, '')
      .replace(/\[分类\][\s\S]*$/gi, '')
      .replace(/^Safe$/gi, '')
      .trim();
  }

  getCurrentChatId() {
    try {
      const match = this.page.url().match(/\/a\/chat\/s\/([a-f0-9-]+)/i);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }
}

module.exports = DeepSeekBrowser;