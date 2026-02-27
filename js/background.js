/**
 * Element Hider - Background Script
 * Handles context menus and message passing
 */

// Menu IDs
const MENU_HIDE = 'element-hider-hide';
const MENU_SHOW = 'element-hider-show';

// Current language
let currentLanguage = 'en';

// Translations
const translations = {
  en: {
    hideElement: 'Hide this element',
    showElement: 'Show this element'
  },
  zh_CN: {
    hideElement: '隐藏这个元素',
    showElement: '显示这个元素'
  }
};

// Get translation
function t(key) {
  return translations[currentLanguage]?.[key] || translations.en[key] || key;
}

// Initialize context menus
function createContextMenus() {
  // Remove existing menus first, then create new ones
  chrome.contextMenus.removeAll(() => {
    console.log('Element Hider: Context menus removed, creating new ones');

    // Create hide menu item - shows for all contexts (page, link, image, etc.)
    chrome.contextMenus.create({
      id: MENU_HIDE,
      title: t('hideElement'),
      contexts: ['all']
    }, () => {
      if (chrome.runtime.lastError) {
        console.error('Element Hider: Error creating hide menu:', chrome.runtime.lastError);
      }
    });

    // Create show menu item
    chrome.contextMenus.create({
      id: MENU_SHOW,
      title: t('showElement'),
      contexts: ['all']
    }, () => {
      if (chrome.runtime.lastError) {
        console.error('Element Hider: Error creating show menu:', chrome.runtime.lastError);
      } else {
        console.log('Element Hider: Context menus created successfully');
      }
    });
  });
}

// Update menu titles based on element state
function updateMenuTitles(isHidden) {
  chrome.contextMenus.update(MENU_HIDE, {
    title: t('hideElement'),
    visible: !isHidden
  });
  chrome.contextMenus.update(MENU_SHOW, {
    title: t('showElement'),
    visible: isHidden
  });
}

// Save rule to storage
async function saveRule(rule) {
  console.log('Element Hider: Saving rule', rule);
  const result = await chrome.storage.sync.get('rules');
  const rules = result.rules || [];
  
  // Check if rule already exists for this selector and URL
  const existingIndex = rules.findIndex(
    r => r.selector === rule.selector && r.url === rule.url
  );

  if (existingIndex >= 0) {
    rules[existingIndex] = rule;
  } else {
    rules.push(rule);
  }

  await chrome.storage.sync.set({ rules });
  console.log('Element Hider: Rules saved, total:', rules.length);
  return rules;
}

// Delete rule from storage
async function deleteRule(selector, url) {
  const result = await chrome.storage.sync.get('rules');
  const rules = result.rules || [];
  
  const filteredRules = rules.filter(
    r => !(r.selector === selector && r.url === url)
  );

  await chrome.storage.sync.set({ rules: filteredRules });
  return filteredRules;
}

// Handle context menu click
async function handleContextMenuClick(info, tab) {
  // Get click coordinates - validate they are valid numbers
  let x = info.mouseX;
  let y = info.mouseY;

  console.log('Element Hider: Context menu clicked', info.menuItemId, 'tabId:', tab.id, 'x:', x, 'y:', y);

  // If coordinates are not valid, use a fallback (center of viewport)
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    console.log('Element Hider: Invalid coordinates, using fallback');
    // Try to get viewport dimensions via content script
    try {
      const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_VIEWPORT_SIZE' });
      if (response && response.width && response.height) {
        x = response.width / 2;
        y = response.height / 2;
        console.log('Element Hider: Using center coordinates:', x, y);
      } else {
        x = 100;
        y = 100;
      }
    } catch (e) {
      x = 100;
      y = 100;
    }
  }

  if (info.menuItemId === MENU_HIDE || info.menuItemId === MENU_SHOW) {
    const messageType = info.menuItemId === MENU_HIDE ? 'HIDE_ELEMENT' : 'SHOW_ELEMENT';

    try {
      // Use chrome.tabs.sendMessage with callback for error handling
      const response = await new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tab.id, {
          type: messageType,
          x: x,
          y: y
        }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
      });

      console.log('Element Hider: Response:', response);

      if (response && response.success) {
        // Save rule if hiding
        if (info.menuItemId === MENU_HIDE) {
          const rule = {
            selector: response.selector,
            url: response.url,
            isHidden: true,
            isEnabled: true,
            createdAt: Date.now()
          };
          await saveRule(rule);
          console.log('Element Hider: Rule saved successfully');
        }
        // Show notification
        showNotification(info.menuItemId === MENU_HIDE ? 'Element hidden' : 'Element shown');
      }
    } catch (error) {
      console.error('Element Hider: Error -', error.message);
      // Show error notification
      showNotification('Error: Content script not loaded. Please refresh the page.');
    }
  }
}

// Show notification to user
function showNotification(message) {
  chrome.notifications.create({
    type: 'basic',
    title: 'Element Hider',
    message: message,
    iconUrl: 'icons/icon.svg'
  });
}

// Handle messages from popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Element Hider: Received message:', message.type);
  
  switch (message.type) {
    case 'GET_RULES':
      chrome.storage.sync.get('rules').then(result => {
        console.log('Element Hider: GET_RULES result:', result.rules?.length || 0);
        sendResponse({ rules: result.rules || [] });
      });
      return true;

    case 'DELETE_RULE':
      deleteRule(message.selector, message.url).then(rules => {
        sendResponse({ success: true, rules: rules });
        
        // Also notify content script to remove hidden element
        if (sender.tab?.id) {
          chrome.tabs.sendMessage(sender.tab.id, {
            type: 'REMOVE_HIDDEN_ELEMENT',
            selector: message.selector,
            url: message.url
          });
        }
      });
      return true;

    case 'TOGGLE_RULE':
      chrome.storage.sync.get('rules').then(result => {
        const rules = result.rules || [];
        const ruleIndex = rules.findIndex(
          r => r.selector === message.selector && r.url === message.url
        );
        if (ruleIndex >= 0) {
          rules[ruleIndex].isEnabled = !rules[ruleIndex].isEnabled;
          chrome.storage.sync.set({ rules });
          sendResponse({ success: true, rules: rules });
        } else {
          sendResponse({ success: false });
        }
      });
      return true;

    case 'CLEAR_ALL_RULES':
      chrome.storage.sync.set({ rules: [] }).then(() => {
        sendResponse({ success: true });
      });
      return true;

    case 'GET_LANGUAGE':
      chrome.storage.sync.get('language').then(result => {
        console.log('Element Hider: GET_LANGUAGE result:', result.language);
        sendResponse({ language: result.language || currentLanguage });
      });
      return true;

    case 'SET_LANGUAGE':
      console.log('Element Hider: SET_LANGUAGE, new language:', message.language);
      currentLanguage = message.language;
      chrome.storage.sync.set({ language: message.language }).then(() => {
        // Recreate context menus with new language
        console.log('Element Hider: Storage updated, creating menus with:', t('hideElement'));
        createContextMenus();

        // Notify all tabs to update language
        chrome.tabs.query({}, (tabs) => {
          tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, {
              type: 'SET_LANGUAGE',
              language: message.language
            }).catch(() => {
              // Ignore errors for tabs without content script
            });
          });
        });

        sendResponse({ success: true });
      });
      return true;

    case 'UPDATE_MENU_STATE':
      updateMenuTitles(message.isHidden);
      return false;

    case 'HIDE_ELEMENT_FROM_CONTENT':
      // Handle hide request from content script selection mode
      saveRule({
        selector: message.selector,
        url: message.url,
        isHidden: true,
        isEnabled: true,
        createdAt: Date.now()
      }).then((result) => {
        sendResponse({ success: true, rules: result });
        // Show notification
        showNotification('Element hidden successfully');
      });
      return true;
  }
});

// Initialize on install
chrome.runtime.onInstalled.addListener(() => {
  // Detect browser language
  const browserLang = navigator.language;
  if (browserLang.startsWith('zh')) {
    currentLanguage = 'zh_CN';
  } else {
    currentLanguage = 'en';
  }

  // Save default language
  chrome.storage.sync.set({ language: currentLanguage });

  console.log('Element Hider: Background script initialized');
});

// Initialize on startup
chrome.runtime.onStartup.addListener(() => {
  chrome.storage.sync.get('language').then(result => {
    if (result.language) {
      currentLanguage = result.language;
    }
    createContextMenus();
  });
});

// Context menu click listener
chrome.contextMenus.onClicked.addListener(handleContextMenuClick);

// Listen for tab updates to apply rules
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    // Apply saved rules when page loads
    chrome.storage.sync.get('rules').then(result => {
      const rules = result.rules || [];
      if (rules.length > 0) {
        chrome.tabs.sendMessage(tabId, { type: 'PAGE_LOADED' });
      }
    });
  }
});

console.log('Element Hider: Background service worker started');

// Initialize on load - create context menus immediately
let initialized = false;
(async function initialize() {
  if (initialized) return;
  initialized = true;
  
  try {
    // Load saved language
    const result = await chrome.storage.sync.get('language');
    if (result.language) {
      currentLanguage = result.language;
    }
    // Create context menus
    createContextMenus();
    console.log('Element Hider: Initialized with language:', currentLanguage);
  } catch (error) {
    console.error('Element Hider: Initialization error', error);
  }
})();

// Keep service worker alive with periodic wake-up
// Service workers are terminated after ~30 seconds of inactivity
setInterval(() => {
  chrome.storage.sync.get('rules').then(() => {
    // Just checking storage keeps the service worker alive
  });
}, 25000);
