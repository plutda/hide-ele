/**
 * Element Hider - Content Script
 * Handles element hiding/showing in page context
 */

(function() {
  'use strict';

  // Track hidden elements with their original visibility
  const hiddenElements = new Map();

  // Current language
  let currentLanguage = 'en';

  // Translations for content script
  const translations = {
    en: {
      elementHidden: 'Element hidden!',
      elementAlreadyHidden: 'Element already hidden',
      selectInstruction: 'Click on any element to hide it. Press Esc to cancel.'
    },
    zh_CN: {
      elementHidden: '元素已隐藏！',
      elementAlreadyHidden: '元素已被隐藏',
      selectInstruction: '点击任意元素进行隐藏。按 Esc 键取消。'
    }
  };

  function t(key) {
    return translations[currentLanguage]?.[key] || translations.en[key] || key;
  }

  // Initialize language from storage
  function initLanguage() {
    chrome.runtime.sendMessage({ type: 'GET_LANGUAGE' }, (response) => {
      if (response && response.language) {
        currentLanguage = response.language;
        console.log('Element Hider: Initial language set to:', currentLanguage);
      }
    });
  }

  // Call initLanguage immediately
  initLanguage();

  // Generate unique selector for an element
  function generateSelector(element) {
    if (element.id) {
      return '#' + CSS.escape(element.id);
    }

    let selector = element.tagName.toLowerCase();
    if (element.className && typeof element.className === 'string') {
      const classes = element.className.trim().split(/\s+/).slice(0, 2);
      if (classes.length > 0 && classes[0]) {
        selector += '.' + classes.map(c => CSS.escape(c)).join('.');
      }
    }

    // Add nth-child for uniqueness
    if (element.parentElement) {
      const children = Array.from(element.parentElement.children).filter(
        child => child.tagName === element.tagName
      );
      if (children.length > 1) {
        const index = children.indexOf(element) + 1;
        selector += ':nth-of-type(' + index + ')';
      }
    }

    return selector;
  }

  // Hide element using visibility property
  function hideElement(element, selector, url) {
    if (hiddenElements.has(element)) {
      return false;
    }

    // Store original visibility
    const originalVisibility = element.style.visibility;
    const originalDataHidden = element.getAttribute('data-element-hider-hidden');

    element.style.visibility = 'hidden';
    element.setAttribute('data-element-hider-hidden', 'true');

    hiddenElements.set(element, {
      selector: selector,
      url: url,
      originalVisibility: originalVisibility,
      originalDataHidden: originalDataHidden
    });

    return true;
  }

  // Show element
  function showElement(element) {
    if (!hiddenElements.has(element)) {
      return false;
    }

    const data = hiddenElements.get(element);
    element.style.visibility = data.originalVisibility || '';
    element.removeAttribute('data-element-hider-hidden');
    hiddenElements.delete(element);

    return true;
  }

// Check if element is hidden by our extension
function isElementHidden(element) {
  return element.getAttribute('data-element-hider-hidden') === 'true';
}

// Element selection mode
let selectionMode = false;
let currentHighlightedElement = null;
let selectionOverlay = null;

// Create selection overlay
function createSelectionOverlay() {
  if (selectionOverlay) return selectionOverlay;

  selectionOverlay = document.createElement('div');
  selectionOverlay.id = 'element-hider-selection-overlay';
  selectionOverlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 2147483647;
    cursor: crosshair;
    pointer-events: none;
  `;

  // Selection info tooltip
  const tooltip = document.createElement('div');
  tooltip.id = 'element-hider-tooltip';
  tooltip.style.cssText = `
    position: fixed;
    background: #333;
    color: #fff;
    padding: 6px 10px;
    border-radius: 4px;
    font-size: 12px;
    font-family: sans-serif;
    z-index: 2147483648;
    pointer-events: none;
    display: none;
    max-width: 300px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  `;
  document.body.appendChild(tooltip);

  selectionOverlay.appendChild(tooltip);
  document.body.appendChild(selectionOverlay);

  return selectionOverlay;
}

// Start selection mode
function startSelectionMode() {
  console.log('Element Hider: Starting selection mode');
  selectionMode = true;
  createSelectionOverlay();

  // Disable scrolling
  document.body.style.overflow = 'hidden';

  // Add event listeners
  document.addEventListener('mouseover', handleSelectionMouseOver, true);
  document.addEventListener('mouseout', handleSelectionMouseOut, true);
  document.addEventListener('click', handleSelectionClick, true);
  document.addEventListener('keydown', handleSelectionKeyDown, true);

  // Show instruction
  showSelectionInstructions();
}

// Stop selection mode
function stopSelectionMode() {
  console.log('Element Hider: Stopping selection mode');
  selectionMode = false;

  // Remove event listeners
  document.removeEventListener('mouseover', handleSelectionMouseOver, true);
  document.removeEventListener('mouseout', handleSelectionMouseOut, true);
  document.removeEventListener('click', handleSelectionClick, true);
  document.removeEventListener('keydown', handleSelectionKeyDown, true);

  // Remove overlay
  if (selectionOverlay) {
    selectionOverlay.remove();
    selectionOverlay = null;
  }

  // Remove highlight
  if (currentHighlightedElement) {
    currentHighlightedElement.style.outline = '';
    currentHighlightedElement = null;
  }

  // Restore page scrolling
  document.body.style.overflow = '';
}

// Handle mouse over during selection
function handleSelectionMouseOver(event) {
  if (!selectionMode) return;

  const target = event.target;

  // Don't highlight our own elements
  if (target.id === 'element-hider-selection-overlay' ||
      target.id === 'element-hider-tooltip' ||
      target.closest('#element-hider-selection-overlay')) {
    return;
  }

  // Remove previous highlight
  if (currentHighlightedElement) {
    currentHighlightedElement.style.outline = '';
  }

  // Add new highlight
  currentHighlightedElement = target;
  target.style.outline = '2px solid #ff5722';

  // Update tooltip
  const tooltip = document.getElementById('element-hider-tooltip');
  if (tooltip) {
    const tagName = target.tagName.toLowerCase();
    const id = target.id ? '#' + target.id : '';
    const classes = target.className ? '.' + target.className.split(' ')[0] : '';
    const selector = tagName + id + classes;

    tooltip.textContent = selector;
    tooltip.style.display = 'block';
    tooltip.style.left = (event.pageX + 10) + 'px';
    tooltip.style.top = (event.pageY + 10) + 'px';
  }
}

// Handle mouse out during selection
function handleSelectionMouseOut(event) {
  if (!selectionMode) return;

  const tooltip = document.getElementById('element-hider-tooltip');
  if (tooltip) {
    tooltip.style.display = 'none';
  }
}

// Handle click during selection
function handleSelectionClick(event) {
  if (!selectionMode) return;

  event.preventDefault();
  event.stopPropagation();

  const target = event.target;

  // Don't select our own elements
  if (target.id === 'element-hider-selection-overlay' ||
      target.id === 'element-hider-tooltip' ||
      target.closest('#element-hider-selection-overlay')) {
    return;
  }

  console.log('Element Hider: Selected element:', target);

  // Generate selector and hide element
  const selector = generateSelector(target);
  const url = window.location.href;
  const success = hideElement(target, selector, url);

  if (success) {
    // Notify background script to save the rule
    chrome.runtime.sendMessage({
      type: 'HIDE_ELEMENT_FROM_CONTENT',
      selector: selector,
      url: url
    }, (response) => {
      console.log('Element Hider: Rule saved from selection mode:', response);
    });

    // Show success feedback
    showSelectionFeedback(t('elementHidden'), true);
  } else {
    showSelectionFeedback(t('elementAlreadyHidden'), false);
  }

  // Stop selection mode
  setTimeout(() => {
    stopSelectionMode();
  }, 500);
}

// Handle keyboard during selection
function handleSelectionKeyDown(event) {
  if (!selectionMode) return;

  // Press Escape to cancel
  if (event.key === 'Escape') {
    stopSelectionMode();
  }
}

// Show selection instructions
function showSelectionInstructions() {
  const instructions = document.createElement('div');
  instructions.id = 'element-hider-instructions';
  instructions.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0, 0, 0, 0.8);
    color: #fff;
    padding: 12px 24px;
    border-radius: 8px;
    font-family: sans-serif;
    font-size: 14px;
    z-index: 2147483647;
    text-align: center;
  `;
  instructions.innerHTML = t('selectInstruction').replace('Esc', '<b>Esc</b>');
  document.body.appendChild(instructions);

  // Auto-remove after 5 seconds
  setTimeout(() => {
    instructions.remove();
  }, 5000);
}

// Show selection feedback
function showSelectionFeedback(message, success) {
  const feedback = document.createElement('div');
  feedback.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: ${success ? 'rgba(76, 175, 80, 0.9)' : 'rgba(244, 67, 54, 0.9)'};
    color: #fff;
    padding: 16px 32px;
    border-radius: 8px;
    font-family: sans-serif;
    font-size: 16px;
    font-weight: bold;
    z-index: 2147483647;
  `;
  feedback.textContent = message;
  document.body.appendChild(feedback);

  // Auto-remove
  setTimeout(() => {
    feedback.remove();
  }, 1000);
}

  // Find element by selector in current page
  function findElementBySelector(selector) {
    try {
      return document.querySelector(selector);
    } catch (e) {
      console.error('Element Hider: Invalid selector', selector);
      return null;
    }
  }

  // Apply saved rules for current page
  async function applySavedRules() {
    try {
      const result = await chrome.storage.sync.get(['rules', 'language']);
      const rules = result.rules || [];
      const currentUrl = window.location.href;
      const currentHostname = window.location.hostname;

      for (const rule of rules) {
        if (!rule.isEnabled) continue;

        // Check if URL matches
        let urlMatch = false;
        try {
          const ruleUrl = new URL(rule.url);
          if (ruleUrl.hostname === currentHostname ||
              currentUrl.startsWith(rule.url)) {
            urlMatch = true;
          }
        } catch (e) {
          // If URL parsing fails, try simple matching
          if (rule.url.includes(currentHostname)) {
            urlMatch = true;
          }
        }

        if (urlMatch) {
          const element = findElementBySelector(rule.selector);
          if (element && rule.isHidden) {
            hideElement(element, rule.selector, rule.url);
          }
        }
      }
    } catch (error) {
      console.error('Element Hider: Error applying saved rules', error);
    }
  }

  // Listen for messages from background script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Element Hider: Content script received message:', message.type);

    switch (message.type) {
      case 'SET_LANGUAGE':
        // Update language setting
        currentLanguage = message.language || 'en';
        console.log('Element Hider: Language set to:', currentLanguage);
        sendResponse({ success: true });
        break;

      case 'GET_ELEMENT_INFO':
        // Called when user right-clicks on an element
        const element = document.elementFromPoint(message.x, message.y);
        if (element) {
          const selector = generateSelector(element);
          sendResponse({
            selector: selector,
            isHidden: isElementHidden(element),
            elementInfo: {
              tag: element.tagName.toLowerCase(),
              id: element.id || null,
              className: element.className || ''
            }
          });
        } else {
          sendResponse({ error: 'No element found' });
        }
        break;

      case 'START_SELECTION_MODE':
        // Start interactive element selection mode
        startSelectionMode();
        sendResponse({ success: true });
        break;

      case 'STOP_SELECTION_MODE':
        // Stop selection mode
        stopSelectionMode();
        sendResponse({ success: true });
        break;

      case 'HIDE_ELEMENT':
        const hideEl = document.elementFromPoint(message.x, message.y);
        console.log('Element Hider: HIDE_ELEMENT at', message.x, message.y, 'element:', hideEl);
        if (hideEl) {
          const selector = generateSelector(hideEl);
          const url = window.location.href;
          const success = hideElement(hideEl, selector, url);
          console.log('Element Hider: Hide result - success:', success, 'selector:', selector);
          sendResponse({ success: success, selector: selector, url: url });
        } else {
          sendResponse({ error: 'No element found' });
        }
        break;

      case 'SHOW_ELEMENT':
        const showEl = document.elementFromPoint(message.x, message.y);
        if (showEl) {
          const success = showElement(showEl);
          sendResponse({ success: success });
        } else {
          sendResponse({ error: 'No element found' });
        }
        break;

      case 'HIDE_BY_SELECTOR':
        const targetEl = findElementBySelector(message.selector);
        if (targetEl) {
          const success = hideElement(targetEl, message.selector, message.url);
          sendResponse({ success: success });
        } else {
          sendResponse({ error: 'Element not found' });
        }
        break;

      case 'SHOW_BY_SELECTOR':
        const showTargetEl = findElementBySelector(message.selector);
        if (showTargetEl) {
          const success = showElement(showTargetEl);
          sendResponse({ success: success });
        } else {
          sendResponse({ error: 'Element not found' });
        }
        break;

      case 'GET_VIEWPORT_SIZE':
        sendResponse({
          width: window.innerWidth,
          height: window.innerHeight
        });
        break;

      case 'GET_HIDDEN_ELEMENTS':
        // Return list of currently hidden elements
        const hiddenList = [];
        hiddenElements.forEach((data, element) => {
          if (element.isConnected) {
            hiddenList.push({
              selector: data.selector,
              url: data.url
            });
          } else {
            // Element no longer in DOM, remove from our map
            hiddenElements.delete(element);
          }
        });
        sendResponse({ hiddenElements: hiddenList });
        break;

      case 'REMOVE_HIDDEN_ELEMENT':
        // Remove from map but don't modify element (used when deleting rule)
        hiddenElements.forEach((data, element) => {
          if (data.selector === message.selector && data.url === message.url) {
            element.style.visibility = data.originalVisibility || '';
            element.removeAttribute('data-element-hider-hidden');
            hiddenElements.delete(element);
          }
        });
        sendResponse({ success: true });
        break;
    }
    return true; // Keep message channel open for async response
  });

  // Initialize - apply saved rules when page loads
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applySavedRules);
  } else {
    applySavedRules();
  }

  // Also apply rules after a short delay to handle dynamic content
  setTimeout(applySavedRules, 1000);
  setTimeout(applySavedRules, 3000);

  console.log('Element Hider: Content script loaded');
})();
