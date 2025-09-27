// Comprehensive debugging script for New York coordinates issue
// Copy and paste this entire script into the browser console on the driver route page

console.log('🔍 Starting comprehensive coordinate debugging...');
console.log('='.repeat(60));

// Function to check if coordinates are in New York area
function isNewYorkCoords(lat, lng) {
  return lat >= 40.0 && lat <= 41.0 && lng >= -75.0 && lng <= -73.0;
}

// Function to safely stringify objects
function safeStringify(obj) {
  try {
    return JSON.stringify(obj, null, 2);
  } catch (e) {
    return obj.toString();
  }
}

// 1. Check localStorage and sessionStorage
console.log('\n📦 Checking browser storage...');
['localStorage', 'sessionStorage'].forEach(storageType => {
  const storage = window[storageType];
  console.log(`\n${storageType}:`);
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    const value = storage.getItem(key);
    if (value && (value.includes('40.7') || value.includes('-74.') || value.includes('New York'))) {
      console.warn(`🗽 Found potential NY data in ${storageType}.${key}:`, value);
    }
  }
});

// 2. Check global variables for coordinates
console.log('\n🌐 Checking global variables...');
const suspiciousGlobals = [];
Object.keys(window).forEach(key => {
  try {
    const value = window[key];
    if (value && typeof value === 'object') {
      const str = safeStringify(value);
      if (str.includes('40.7') || str.includes('-74.') || str.includes('New York')) {
        suspiciousGlobals.push({ key, value });
      }
    }
  } catch (e) {
    // Ignore errors
  }
});

if (suspiciousGlobals.length > 0) {
  console.warn('🗽 Found potential NY coordinates in global variables:');
  suspiciousGlobals.forEach(item => {
    console.log(`window.${item.key}:`, item.value);
  });
} else {
  console.log('✅ No NY coordinates found in global variables');
}

// 3. Check Google Maps instances
console.log('\n🗺️ Checking Google Maps instances...');
if (window.google && window.google.maps) {
  console.log('Google Maps API is loaded');
  
  // Try to find map instances
  const mapElements = document.querySelectorAll('[data-map-id], .gm-style');
  console.log(`Found ${mapElements.length} potential map elements`);
  
  mapElements.forEach((element, index) => {
    console.log(`Map element ${index}:`, element);
  });
} else {
  console.log('Google Maps API not yet loaded');
}

// 4. Check React component state (if React DevTools is available)
console.log('\n⚛️ Checking React state...');
if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
  console.log('React DevTools detected - you can manually inspect component state');
  console.log('Look for components with schoolLocation, currentLocation, or driverLocation props');
} else {
  console.log('React DevTools not available');
}

// 5. Check for Firebase/Firestore data
console.log('\n🔥 Checking Firebase data...');
if (window.firebase || window.getFirestore) {
  console.log('Firebase detected - checking for coordinate data...');
  
  // This will be handled by the separate browser-db-check.js script
  console.log('Run the browser-db-check.js script to check database contents');
} else {
  console.log('Firebase not detected in global scope');
}

// 6. Check page source for hardcoded coordinates
console.log('\n📄 Checking page source...');
const pageSource = document.documentElement.outerHTML;
if (pageSource.includes('40.7') || pageSource.includes('-74.')) {
  console.warn('🗽 Found potential NY coordinates in page source');
  // Find the specific locations
  const lines = pageSource.split('\n');
  lines.forEach((line, index) => {
    if (line.includes('40.7') || line.includes('-74.')) {
      console.log(`Line ${index + 1}: ${line.trim()}`);
    }
  });
} else {
  console.log('✅ No NY coordinates found in page source');
}

// 7. Check for any script tags with coordinates
console.log('\n📜 Checking script tags...');
const scripts = document.querySelectorAll('script');
let foundInScripts = false;
scripts.forEach((script, index) => {
  if (script.textContent && (script.textContent.includes('40.7') || script.textContent.includes('-74.'))) {
    console.warn(`🗽 Found potential NY coordinates in script ${index}:`, script.textContent.substring(0, 200) + '...');
    foundInScripts = true;
  }
});
if (!foundInScripts) {
  console.log('✅ No NY coordinates found in script tags');
}

// 8. Monitor for any new coordinate assignments
console.log('\n👀 Setting up coordinate monitoring...');
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

// Override console methods to catch coordinate logs
['log', 'warn', 'error'].forEach(method => {
  const original = console[method];
  console[method] = function(...args) {
    const message = args.join(' ');
    if (message.includes('40.7') || message.includes('-74.') || message.includes('schoolLocation') || message.includes('mapCenter')) {
      console.warn('🎯 COORDINATE LOG DETECTED:', ...args);
    }
    return original.apply(console, args);
  };
});

// 9. Check current URL and query parameters
console.log('\n🔗 Checking URL parameters...');
const urlParams = new URLSearchParams(window.location.search);
urlParams.forEach((value, key) => {
  if (value.includes('40.7') || value.includes('-74.')) {
    console.warn(`🗽 Found potential NY coordinates in URL param ${key}:`, value);
  }
});

console.log('\n✅ Comprehensive debugging setup complete!');
console.log('='.repeat(60));
console.log('📋 Summary:');
console.log('- Browser storage checked');
console.log('- Global variables scanned');
console.log('- Google Maps instances identified');
console.log('- Page source analyzed');
console.log('- Script tags examined');
console.log('- Console monitoring activated');
console.log('- URL parameters checked');
console.log('\n🔍 Now watch the console for any coordinate-related logs...');
console.log('🎯 Any logs containing coordinates will be highlighted with "COORDINATE LOG DETECTED"');

// Return a summary object
return {
  suspiciousGlobals: suspiciousGlobals.length,
  mapElements: document.querySelectorAll('[data-map-id], .gm-style').length,
  googleMapsLoaded: !!(window.google && window.google.maps),
  firebaseDetected: !!(window.firebase || window.getFirestore),
  reactDevTools: !!window.__REACT_DEVTOOLS_GLOBAL_HOOK__
};