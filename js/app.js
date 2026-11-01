// ==========================================
// 1. DOM Element Mappings & Layout Safe Guards
// ==========================================
const textInput = document.getElementById('textInput');
const filterInput = document.getElementById('filterInput');
const textOutput = document.getElementById('textOutput');
const caseToggle = document.getElementById('caseToggle');
const predefinedToggle = document.getElementById('predefinedToggle');
const inputStats = document.getElementById('inputStats');
const filterStats = document.getElementById('filterStats');
const outputStats = document.getElementById('outputStats');

const modalOverlay = document.getElementById('modalOverlay');
const modalOpenBtn = document.getElementById('modalOpenBtn');
const modalCloseBtn = document.getElementById('modalCloseBtn');
const copyBtn = document.getElementById('copyBtn');
const clearStorageBtn = document.getElementById('clearStorageBtn');
const fileImport = document.getElementById('fileImport');

const btnFontIncrease = document.getElementById('btnFontIncrease');
const btnFontReset = document.getElementById('btnFontReset');

let db = null;
let textWorker = null;
let currentBaseFontSize = 14; 

const DB_NAME = 'RecallRxDB';
const STORE_NAME = 'appState';
const RECORD_ID = 'currentSession';

// ==========================================
// 2. Input Sanitation Security Strategy
// ==========================================
/**
 * Contextual Escape Sanitizer
 * Blocks XSS injection payloads (e.g., <script>, onload attributes)
 * by safely converting control entities into literal strings.
 */
function sanitizeInput(rawString) {
    if (!rawString) return '';
    return rawString
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/\//g, '&#x2F;');
}

// ==========================================
// 3. Isolated Web Worker Context
// ==========================================
function initWorker() {
  const workerCode = `
    const HIDDEN_STOP_WORDS = new Set(['a', 'an', 'the', 'and', 'but', 'or', 'nor', 'for', 'yet', 'so', 'although', 'because', 'since', 'unless', 'until', 'while', 'whereas', 'standard', 'if', 'whether', 'both', 'either', 'neither', 'code', 'about', 'above', 'across', 'after', 'against', 'along', 'amid', 'among', 'around', 'at', 'before', 'behind', 'below', 'beneath', 'beside', 'besides', 'between', 'beyond', 'by', 'concerning', 'despite', 'down', 'during', 'except', 'from', 'in', 'inside', 'into', 'like', 'near', 'of', 'off', 'on', 'onto', 'out', 'outside', 'over', 'past', 'through', 'throughout', 'till', 'to', 'toward', 'towards', 'under', 'underneath', 'up', 'upon', 'with', 'within', 'without']);

    self.onmessage = function (e) {
      const { rawText, customFilterText, caseSensitive, predefinedEnabled } = e.data;
      const rawFilterLines = customFilterText.split('\\n');
      const customStopWordsSet = new Set();
      
      rawFilterLines.forEach(line => {
        const cleanWord = line.replace(/[^\\p{L}\\p{N}\\s\\x27\\x22\\u2018\\u2019]/gu, '').trim();
        if (cleanWord) {
          customStopWordsSet.add(caseSensitive ? cleanWord : cleanWord.toLowerCase());
        }
      });

      if (!rawText.trim()) {
        self.postMessage({ success: true, outputText: '', inputWordCount: 0, outputWordCount: 0, customFilterCount: customStopWordsSet.size });
        return;
      }

      const structuralClean = rawText.replace(/[-–—()]/g, ' ');
      const cleanText = structuralClean.replace(/[^\\p{L}\\p{N}\\s\\x27\\x22\\u2018\\u2019]/gu, '');
      const rawWordsArray = cleanText.split(/\\s+/).filter(w => w.length > 0);
      const inputWordCount = rawWordsArray.length;

      const finalUniqueWords = [];
      const trackingSet = new Set();

      for (let word of rawWordsArray) {
        word = word.trim();
        if (/\\d/.test(word)) continue;

        const coreWord = word.replace(/['’]s$/i, '');
        if (!coreWord) continue;

        const lowercaseKey = coreWord.toLowerCase();
        const outputWord = caseSensitive ? coreWord : lowercaseKey;
        const matchKey = caseSensitive ? coreWord : lowercaseKey;

        if (predefinedEnabled && HIDDEN_STOP_WORDS.has(lowercaseKey)) continue;
        if (customStopWordsSet.has(matchKey)) continue;

        if (!trackingSet.has(matchKey)) {
          trackingSet.add(matchKey);
          finalUniqueWords.push(outputWord);
        }
      }

      // Sort alpha-numerically alphabetically from structural loop updates
      finalUniqueWords.sort();

      self.postMessage({
        success: true,
        outputText: finalUniqueWords.join('\\n'),
        inputWordCount: inputWordCount,
        outputWordCount: finalUniqueWords.length,
        customFilterCount: customStopWordsSet.size
      });
    };
  `;

  const blob = new Blob([workerCode], { type: 'application/javascript' });
  textWorker = new Worker(URL.createObjectURL(blob));
  
  textWorker.onmessage = function(e) {
    const { outputText, inputWordCount, outputWordCount, customFilterCount } = e.data;
    
    // Safety verification check: sanitize internal output streams
    textOutput.value = sanitizeInput(outputText);
    
    if(inputStats) inputStats.textContent = `Words: ${inputWordCount}`;
    if(outputStats) outputStats.textContent = `Unique Words: ${outputWordCount}`;
    if(filterStats) filterStats.textContent = `Custom Filtered: ${customFilterCount}`;
    saveState();
  };
}

function dispatchToWorker() {
  if (!textWorker) return;
  
  textWorker.postMessage({
    rawText: textInput.value,
    customFilterText: filterInput.value,
    caseSensitive: caseToggle ? caseToggle.checked : false,
    predefinedEnabled: predefinedToggle ? predefinedToggle.checked : false
  });
}

// ==========================================
// 4. Persistence Engine (IndexedDB)
// ==========================================
const databaseRequest = indexedDB.open(DB_NAME, 1);

databaseRequest.onupgradeneeded = (e) => {
  db = e.target.result;
  if (!db.objectStoreNames.contains(STORE_NAME)) {
    db.createObjectStore(STORE_NAME, { keyPath: 'id' });
  }
};

databaseRequest.onsuccess = (e) => {
  db = e.target.result;
  initWorker();
  loadState();
};

function saveState() {
  if (!db) return;
  const state = {
    id: RECORD_ID,
    input: textInput.value,
    filter: filterInput.value,
    caseSensitive: caseToggle ? caseToggle.checked : false,
    predefinedEnabled: predefinedToggle ? predefinedToggle.checked : false,
    inputScroll: textInput.scrollTop,
    filterScroll: filterInput.scrollTop,
    outputScroll: textOutput.scrollTop
  };
  
  const transaction = db.transaction([STORE_NAME], 'readwrite');
  transaction.objectStore(STORE_NAME).put(state);
}

function loadState() {
  const transaction = db.transaction([STORE_NAME], 'readonly');
  const request = transaction.objectStore(STORE_NAME).get(RECORD_ID);

  request.onsuccess = () => {
    const data = request.result;
    if (data) {
      textInput.value = data.input || '';
      filterInput.value = data.filter || '';
      if(caseToggle) caseToggle.checked = !!data.caseSensitive;
      if(predefinedToggle) predefinedToggle.checked = !!data.predefinedEnabled;
      
      dispatchToWorker();

      setTimeout(() => {
        textInput.scrollTop = data.inputScroll || 0;
        filterInput.scrollTop = data.filterScroll || 0;
        textOutput.scrollTop = data.outputScroll || 0;
      }, 50);
    }
  };
}

// ==========================================
// 5. Global Unified Event Registries
// ==========================================

// Global Memory Purge Action Tracker
if (clearStorageBtn) {
  clearStorageBtn.addEventListener('click', () => {
    if (!confirm('Are you sure you want to clear all inputs and stored session memory?')) return;
    
    textInput.value = '';
    filterInput.value = '';
    if(caseToggle) caseToggle.checked = false;
    if(predefinedToggle) predefinedToggle.checked = false;
    
    if (db) {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      transaction.objectStore(STORE_NAME).delete(RECORD_ID);
    }
    
    dispatchToWorker();
    if(modalOverlay) modalOverlay.style.display = 'none';
  });
}

// Local Native File Stream Channel Loader
if (fileImport) {
  fileImport.addEventListener('change', (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      textInput.value = event.target.result;
      dispatchToWorker();
    };
    reader.readAsText(files[0]); // Explicit lookup safety mapping fixed
  });
}

// Global Modal Routing Configurations
if (modalOpenBtn && modalOverlay) modalOpenBtn.addEventListener('click', () => modalOverlay.style.display = 'flex');
if (modalCloseBtn && modalOverlay) modalCloseBtn.addEventListener('click', () => modalOverlay.style.display = 'none');
if (modalOverlay) {
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) modalOverlay.style.display = 'none';
  });
}

// Clipboard Export Manager Component 
if (copyBtn) {
  copyBtn.addEventListener('click', () => {
    if (!textOutput.value) return;
    
    navigator.clipboard.writeText(textOutput.value).then(() => {
      const originalText = copyBtn.textContent;
      copyBtn.textContent = 'Copied!';
      copyBtn.classList.add('bg-green-50', 'text-green-700', 'border-green-300');
      
      setTimeout(() => {
        copyBtn.textContent = originalText;
        copyBtn.classList.remove('bg-green-50', 'text-green-700', 'border-green-300');
      }, 1500);
    });
  });
}


// Native Observability Input Sync Loop Handlers
textInput.addEventListener('input', dispatchToWorker);
filterInput.addEventListener('input', dispatchToWorker);
if(caseToggle) caseToggle.addEventListener('change', dispatchToWorker);
if(predefinedToggle) predefinedToggle.addEventListener('change', dispatchToWorker);
textInput.addEventListener('scroll', saveState);
filterInput.addEventListener('scroll', saveState);
textOutput.addEventListener('scroll', saveState);