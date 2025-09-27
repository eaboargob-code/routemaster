// Debug script to check the current page state
// Run this in the browser console on the driver route page

console.log('🔍 Debugging Page State...');

// 1. Check if we're on the right page
console.log('\n1. Page Check:');
console.log('Current URL:', window.location.href);
console.log('Page title:', document.title);

// 2. Check for error messages in the DOM
console.log('\n2. Error Message Check:');
const errorTexts = [
  'Map Unavailable',
  'Google Maps API key not configured',
  'School location coordinates are not available'
];

let foundErrors = [];
errorTexts.forEach(errorText => {
  const elements = Array.from(document.querySelectorAll('*')).filter(el => 
    el.textContent && el.textContent.includes(errorText)
  );
  
  if (elements.length > 0) {
    foundErrors.push(errorText);
    console.log(`❌ Found: "${errorText}"`);
    elements.forEach(el => {
      console.log('  Element:', el);
      console.log('  Full text:', el.textContent.trim());
    });
  }
});

if (foundErrors.length === 0) {
  console.log('✅ No error messages found in DOM');
}

// 3. Check for Google Maps elements
console.log('\n3. Google Maps Elements:');
const mapElements = document.querySelectorAll('.gm-style, [data-testid*="map"]');
console.log(`Found ${mapElements.length} Google Maps elements`);

if (mapElements.length > 0) {
  mapElements.forEach((el, index) => {
    console.log(`Map ${index + 1}:`, el);
    console.log(`  Visible: ${el.offsetParent !== null}`);
    console.log(`  Size: ${el.offsetWidth}x${el.offsetHeight}`);
  });
} else {
  console.log('❌ No Google Maps elements found');
}

// 4. Check for loading indicators
console.log('\n4. Loading Indicators:');
const loadingElements = Array.from(document.querySelectorAll('*')).filter(el => 
  el.textContent && el.textContent.toLowerCase().includes('loading')
);

if (loadingElements.length > 0) {
  console.log('⏳ Found loading indicators:');
  loadingElements.forEach(el => console.log('  -', el.textContent.trim()));
} else {
  console.log('✅ No loading indicators found');
}

// 5. Check console for debug messages
console.log('\n5. Console Debug Check:');
console.log('💡 Look for debug messages in the console that start with [DEBUG]');
console.log('💡 These will show school location loading status');

// 6. Check if Google Maps API is loaded
console.log('\n6. Google Maps API Status:');
if (typeof google !== 'undefined' && google.maps) {
  console.log('✅ Google Maps API is loaded');
  console.log('Version:', google.maps.version);
  
  if (google.maps.marker && google.maps.marker.AdvancedMarkerElement) {
    console.log('✅ AdvancedMarkerElement available');
  } else {
    console.log('⚠️ AdvancedMarkerElement not available (using fallback)');
  }
} else {
  console.log('❌ Google Maps API not loaded');
}

// 7. Summary
console.log('\n📋 Summary:');
if (foundErrors.length > 0) {
  console.log('❌ Issues found:');
  foundErrors.forEach(error => console.log(`  - ${error}`));
} else if (mapElements.length === 0) {
  console.log('⚠️ No map elements found - check if data is loading');
} else {
  console.log('✅ Page appears to be working - check map functionality');
}

console.log('\n💡 Next steps:');
console.log('1. Check browser console for [DEBUG] messages');
console.log('2. Look for any network errors in Network tab');
console.log('3. Verify school location data is being fetched');