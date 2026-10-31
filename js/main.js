const textInput = document.getElementById('textInput');
const filterInput = document.getElementById('filterInput');
const textOutput = document.getElementById('textOutput');
const caseToggle = document.getElementById('caseToggle');
const filterToggle = document.getElementById('filterToggle');
const predefinedToggle = document.getElementById('predefinedToggle');
const inputStats = document.getElementById('inputStats');
const filterStats = document.getElementById('filterStats');
const outputStats = document.getElementById('outputStats');

const modalOverlay = document.getElementById('modalOverlay');
const modalOpenBtn = document.getElementById('modalOpenBtn');
const modalCloseBtn = document.getElementById('modalCloseBtn');
const copyBtn = document.getElementById('copyBtn');

const HIDDEN_STOP_WORDS = new Set(['a', 'am' , 'an', 'as', 'be', 'the', 'and', 'but', 'or', 'nor', 'for', 'so', 'if', 'is', 'it' , 'its' , 'that', 'about', 'at', 'by', 'in', 'into', 'of', 'off', 'on', 'onto', 'out', 'to', 'with', 'within', 'without']);

let db = null;
const DB_NAME = 'RecallRxDB';
const STORE_NAME = 'appState';
const RECORD_ID = 'currentSession';

const request = indexedDB.open(DB_NAME, 1);

request.onupgradeneeded = (e) => {
  db = e.target.result;
  if (!db.objectStoreNames.contains(STORE_NAME)) {
    db.createObjectStore(STORE_NAME, { keyPath: 'id' });
  }
};

request.onsuccess = (e) => {
  db = e.target.result;
  loadState();
};

function saveState() {
  if (!db) return;
  const state = {
    id: RECORD_ID,
    input: textInput.value,
    filter: filterInput.value,
    caseSensitive: caseToggle.checked,
    filterEnabled: filterToggle.checked,
    predefinedEnabled: predefinedToggle.checked,
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
      caseToggle.checked = !!data.caseSensitive;
      filterToggle.checked = !!data.filterEnabled;
      predefinedToggle.checked = !!data.predefinedEnabled;
      
      processText();

      textInput.scrollTop = data.inputScroll || 0;
      filterInput.scrollTop = data.filterScroll || 0;
      textOutput.scrollTop = data.outputScroll || 0;
    }
  };
}

function processText() {
  const rawText = textInput.value;
  // Replace dashes, hyphens, open parentheses, and close parentheses with a blank space
  const structuralClean = rawText.replace(/[-–—()]/g, ' ');
  const rawFilterLines = filterInput.value.split('\n');
  const customStopWordsSet = new Set();
  
  rawFilterLines.forEach(line => {
    const cleanWord = line.replace(/[^\p{L}\p{N}\s\x27\x22\u2018\u2019-]/gu, '').trim();
    if (cleanWord) {
      customStopWordsSet.add(caseToggle.checked ? cleanWord : cleanWord.toLowerCase());
    }
  });
  filterStats.textContent = `Custom Filtered: ${customStopWordsSet.size}`;

  if (!rawText.trim()) {
    textOutput.value = '';
    inputStats.textContent = 'Words: 0';
    outputStats.textContent = 'Unique Words: 0';
    saveState();
    return;
  }

  const cleanText = structuralClean.replace(/[^\p{L}\p{N}\s\x27\x22\u2018\u2019]/gu, '');

  const rawWordsArray = cleanText.split(/\s+/).filter(w => w.length > 0);
  inputStats.textContent = `Total Words: ${rawWordsArray.length}`;

  const finalUniqueWords = [];
  const trackingSet = new Set();

  for (let word of rawWordsArray) {
    word = word.trim();
    
    if (/\d/.test(word)) {
      continue;
    }

    const coreWord = word.replace(/['’]s$/i, '');
    
    if (!coreWord) continue;

    const lowercaseKey = coreWord.toLowerCase();
    const outputWord = caseToggle.checked ? coreWord : lowercaseKey;
    const matchKey = caseToggle.checked ? coreWord : lowercaseKey;

    if (predefinedToggle.checked && HIDDEN_STOP_WORDS.has(lowercaseKey)) {
      continue;
    }

    if (filterToggle.checked && customStopWordsSet.has(matchKey)) {
      continue;
    }

    if (!trackingSet.has(matchKey)) {
      trackingSet.add(matchKey);
      finalUniqueWords.push(outputWord);
    }
  }

  textOutput.value = finalUniqueWords.join('\n');
  outputStats.textContent = `Unique Words: ${finalUniqueWords.length}`;
  saveState();
}

if (modalOpenBtn) modalOpenBtn.addEventListener('click', () => modalOverlay.style.display = 'flex');
if (modalCloseBtn) modalCloseBtn.addEventListener('click', () => modalOverlay.style.display = 'none');
if (modalOverlay) {
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) modalOverlay.style.display = 'none';
  });
}

if (copyBtn) {
  copyBtn.addEventListener('click', () => {
    if (!textOutput.value) return;
    
    navigator.clipboard.writeText(textOutput.value).then(() => {
      copyBtn.textContent = 'Copied!';
      copyBtn.classList.add('success');
      
      setTimeout(() => {
        copyBtn.textContent = 'Copy';
        copyBtn.classList.remove('success');
      }, 1500);
    });
  });
}

textInput.addEventListener('input', processText);
filterInput.addEventListener('input', processText);
caseToggle.addEventListener('change', processText);
filterToggle.addEventListener('change', processText);
predefinedToggle.addEventListener('change', processText);

textInput.addEventListener('scroll', saveState);
filterInput.addEventListener('scroll', saveState);
textOutput.addEventListener('scroll', saveState);
