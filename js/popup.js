/**
 * Element Hider - Popup Script
 * Handles settings UI and rule management
 */

// Translations
const translations = {
  en: {
    settings: 'Settings',
    language: 'Language',
    select_element: 'Select Element to Hide',
    select_hint: 'Click this button, then hover and click on any element in the page to hide it.',
    rules: 'Hidden Elements Rules',
    no_rules: 'No hidden elements yet',
    delete: 'Delete',
    toggle: 'Toggle',
    enabled: 'Enabled',
    disabled: 'Disabled',
    url: 'URL',
    selector: 'Selector',
    clear_all: 'Clear All',
    confirm_clear: 'Are you sure you want to delete all rules?'
  },
  zh_CN: {
    settings: '设置',
    language: '语言',
    select_element: '选择要隐藏的元素',
    select_hint: '点击此按钮，然后在页面上移动鼠标并点击任意元素来隐藏它。',
    rules: '已隐藏元素规则',
    no_rules: '暂无隐藏元素',
    delete: '删除',
    toggle: '切换',
    enabled: '已启用',
    disabled: '已禁用',
    url: '网址',
    selector: '选择器',
    clear_all: '清除全部',
    confirm_clear: '确定要删除所有规则吗？'
  }
};

let currentLanguage = 'en';

function t(key) {
  return translations[currentLanguage]?.[key] || translations.en[key] || key;
}

// Apply translations to all elements with data-i18n attribute
function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    el.textContent = t(key);
  });
}

// Get hostname from URL
function getHostname(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

// Render rules list
function renderRules(rules) {
  const rulesList = document.getElementById('rules-list');
  const noRules = document.getElementById('no-rules');

  rulesList.innerHTML = '';

  if (!rules || rules.length === 0) {
    noRules.style.display = 'block';
    return;
  }

  noRules.style.display = 'none';

  rules.forEach(rule => {
    const ruleItem = document.createElement('div');
    ruleItem.className = 'rule-item';
    if (!rule.isEnabled) {
      ruleItem.classList.add('disabled');
    }

    const ruleInfo = document.createElement('div');
    ruleInfo.className = 'rule-info';

    const selector = document.createElement('div');
    selector.className = 'rule-selector';
    selector.textContent = rule.selector;
    selector.title = rule.selector;

    const url = document.createElement('div');
    url.className = 'rule-url';
    url.textContent = getHostname(rule.url);
    url.title = rule.url;

    ruleInfo.appendChild(selector);
    ruleInfo.appendChild(url);

    const ruleActions = document.createElement('div');
    ruleActions.className = 'rule-actions';

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'btn-toggle';
    toggleBtn.textContent = rule.isEnabled ? t('enabled') : t('disabled');
    toggleBtn.addEventListener('click', () => toggleRule(rule));

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn-delete';
    deleteBtn.textContent = t('delete');
    deleteBtn.addEventListener('click', () => deleteRule(rule));

    ruleActions.appendChild(toggleBtn);
    ruleActions.appendChild(deleteBtn);

    ruleItem.appendChild(ruleInfo);
    ruleItem.appendChild(ruleActions);

    rulesList.appendChild(ruleItem);
  });
}

// Delete a rule
function deleteRule(rule) {
  chrome.runtime.sendMessage({
    type: 'DELETE_RULE',
    selector: rule.selector,
    url: rule.url
  }, (response) => {
    if (response && response.success) {
      renderRules(response.rules);
    }
  });
}

// Toggle rule enabled/disabled
function toggleRule(rule) {
  chrome.runtime.sendMessage({
    type: 'TOGGLE_RULE',
    selector: rule.selector,
    url: rule.url
  }, (response) => {
    if (response && response.success) {
      renderRules(response.rules);
    }
  });
}

// Clear all rules
function clearAllRules() {
  if (confirm(t('confirm_clear'))) {
    chrome.runtime.sendMessage({
      type: 'CLEAR_ALL_RULES'
    }, (response) => {
      if (response && response.success) {
        renderRules([]);
      }
    });
  }
}

// Start element selection mode
function startElementSelection() {
  // Get current active tab
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      // Send message to content script to start selection mode
      chrome.tabs.sendMessage(tabs[0].id, { type: 'START_SELECTION_MODE' }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('Element Hider: Error starting selection mode:', chrome.runtime.lastError.message);
          alert('Please refresh the page and try again.');
        } else if (response && response.success) {
          // Close popup and let user select element
          window.close();
        }
      });
    }
  });
}

// Change language
function changeLanguage(lang) {
  console.log('Popup: Changing language to:', lang);
  currentLanguage = lang;
  chrome.runtime.sendMessage({
    type: 'SET_LANGUAGE',
    language: lang
  }, (response) => {
    console.log('Popup: SET_LANGUAGE response:', response);
    // Reload popup to refresh UI with new language
    location.reload();
  });
}

// Initialize popup
document.addEventListener('DOMContentLoaded', () => {
  // Load language setting
  chrome.runtime.sendMessage({ type: 'GET_LANGUAGE' }, (response) => {
    if (response && response.language) {
      currentLanguage = response.language;
      document.getElementById('language-select').value = currentLanguage;
    }
    applyTranslations();
  });

  // Load rules
  chrome.runtime.sendMessage({ type: 'GET_RULES' }, (response) => {
    if (response && response.rules) {
      renderRules(response.rules);
    }
  });

  // Language select change
  document.getElementById('language-select').addEventListener('change', (e) => {
    changeLanguage(e.target.value);
  });

  // Select element button
  document.getElementById('select-element-btn').addEventListener('click', startElementSelection);

  // Clear all button
  document.getElementById('clear-all-btn').addEventListener('click', clearAllRules);
});
