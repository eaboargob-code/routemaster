// Debug script to find New York coordinates
// Run this in the browser console on the driver route page

console.log('🔍 Starting coordinate debugging...');

// Check localStorage
console.log('\n📦 Checking localStorage:');
for (let i = 0; i < localStorage.length; i++) {
  const key = localStorage.key(i);
  const value = localStorage.getItem(key);
  if (value && (value.includes('40.7') || value.includes('-74.') || 
               value.includes('lat') || value.includes('lng') || 
               value.includes('latitude') || value.includes('longitude'))) {
    console.log(`  ${key}:`, value);
  }
}

// Check sessionStorage
console.log('\n📦 Checking sessionStorage:');
for (let i = 0; i < sessionStorage.length; i++) {
  const key = sessionStorage.key(i);
  const value = sessionStorage.getItem(key);
  if (value && (value.includes('40.7') || value.includes('-74.') || 
               value.includes('lat') || value.includes('lng') || 
               value.includes('latitude') || value.includes('longitude'))) {
    console.log(`  ${key}:`, value);
  }
}

// Check global variables
console.log('\n🌐 Checking global variables:');
const globalVars = ['schoolLocation', 'driverLocation', 'currentDriverLocation', 'activeTrip', 'tripData'];
globalVars.forEach(varName => {
  if (window[varName]) {
    console.log(`  ${varName}:`, window[varName]);
  }
});

// Check React DevTools if available
console.log('\n⚛️ Checking React state (if React DevTools available):');
if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
  console.log('  React DevTools detected - check React state manually');
}

// Check Google Maps instances
console.log('\n🗺️ Checking Google Maps:');
if (window.google && window.google.maps) {
  console.log('  Google Maps API loaded');
  
  // Try to find map instances
  const mapElements = document.querySelectorAll('[data-testid="map"], .google-map, [id*="map"]');
  console.log(`  Found ${mapElements.length} potential map elements`);
  
  // Check for any map center coordinates in the DOM
  const allElements = document.querySelectorAll('*');
  let foundCoords = false;
  allElements.forEach(el => {
    const text = el.textContent || '';
    if (text.includes('40.7') || text.includes('-74.')) {
      console.log('  Found NY coordinates in DOM:', text.substring(0, 100));
      foundCoords = true;
    }
  });
  if (!foundCoords) {
    console.log('  No NY coordinates found in DOM text');
  }
}

// Check page source for hardcoded coordinates
console.log('\n📄 Checking page source:');
const pageText = document.documentElement.outerHTML;
if (pageText.includes('40.7') || pageText.includes('-74.')) {
  console.log('  Found NY coordinates in page source');
  // Find the specific occurrences
  const lines = pageText.split('\n');
  lines.forEach((line, index) => {
    if (line.includes('40.7') || line.includes('-74.')) {
      console.log(`    Line ${index + 1}: ${line.trim().substring(0, 100)}`);
    }
  });
} else {
  console.log('  No NY coordinates found in page source');
}

// Check all script tags
console.log('\n📜 Checking script tags:');
const scripts = document.querySelectorAll('script');
let foundInScripts = false;
scripts.forEach((script, index) => {
  if (script.innerHTML.includes('40.7') || script.innerHTML.includes('-74.')) {
    console.log(`  Found NY coordinates in script ${index}:`, script.innerHTML.substring(0, 200));
    foundInScripts = true;
  }
});
if (!foundInScripts) {
  console.log('  No NY coordinates found in script tags');
}

// Check network requests (if available in console)
console.log('\n🌐 Network requests:');
console.log('  Check Network tab in DevTools for any requests containing coordinates');

// Check for any error messages or console logs
console.log('\n📝 Recent console logs:');
console.log('  Check console for any logs about coordinates, school location, or trip data');

// Final summary
console.log('\n✅ Debugging complete! Check the output above for any NY coordinates.');
console.log('If you found coordinates, they might be coming from:');
console.log('  1. Browser storage (localStorage/sessionStorage)');
console.log('  2. React component state');
console.log('  3. Google Maps default center');
console.log('  4. Network requests/API responses');
console.log('  5. Cached data in IndexedDB');

// Additional check for IndexedDB
console.log('\n💾 Checking IndexedDB...');
if (window.indexedDB) {
  indexedDB.databases().then(databases => {
    console.log('  Available databases:', databases.map(db => db.name));
    databases.forEach(dbInfo => {
      if (dbInfo.name) {
        const request = indexedDB.open(dbInfo.name);
        request.onsuccess = (event) => {
          const db = event.target.result;
          console.log(`  Database ${dbInfo.name} object stores:`, Array.from(db.objectStoreNames));
        };
      }
    });
  }).catch(err => {
    console.log('  Error accessing IndexedDB:', err);
  });
} else {
  console.log('  IndexedDB not available');
}