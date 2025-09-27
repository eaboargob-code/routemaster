// Script to check Google Maps loading status on the driver route page
// Run this in the browser console

console.log('🗺️ Checking Google Maps Status...');

// 1. Check if Google Maps API is loaded
console.log('\n1. Google Maps API Status:');
if (typeof google !== 'undefined' && google.maps) {
  console.log('✅ Google Maps API is loaded');
  console.log('📍 Version:', google.maps.version);
  
  // Check if marker library is loaded
  if (google.maps.marker && google.maps.marker.AdvancedMarkerElement) {
    console.log('✅ AdvancedMarkerElement is available');
  } else {
    console.log('⚠️ AdvancedMarkerElement is NOT available - using fallback');
  }
} else {
  console.log('❌ Google Maps API is NOT loaded');
}

// 2. Check for map containers
console.log('\n2. Map Container Status:');
const mapContainers = document.querySelectorAll('.gm-style, [data-testid*="map"], [id*="map"]');
console.log(`Found ${mapContainers.length} Google Maps containers`);

if (mapContainers.length > 0) {
  mapContainers.forEach((container, index) => {
    console.log(`Map ${index + 1}:`, container);
    console.log(`  - Dimensions: ${container.offsetWidth}x${container.offsetHeight}`);
    console.log(`  - Visible: ${container.offsetParent !== null}`);
  });
} else {
  console.log('❌ No Google Maps containers found');
}

// 3. Check for error messages
console.log('\n3. Error Message Check:');
const errorMessages = [
  'Map Unavailable',
  'API key not configured', 
  'Google Maps API key not configured',
  'School location coordinates are not available'
];

let foundErrors = false;
errorMessages.forEach(errorText => {
  const elements = Array.from(document.querySelectorAll('*')).filter(el => 
    el.textContent && el.textContent.includes(errorText)
  );
  
  if (elements.length > 0) {
    console.log(`❌ Found error: "${errorText}"`);
    elements.forEach(el => console.log('  Element:', el));
    foundErrors = true;
  }
});

if (!foundErrors) {
  console.log('✅ No error messages found');
}

// 4. Check for loading states
console.log('\n4. Loading State Check:');
const loadingElements = Array.from(document.querySelectorAll('*')).filter(el => 
  el.textContent && (el.textContent.includes('Loading') || el.textContent.includes('loading'))
);

if (loadingElements.length > 0) {
  console.log('⏳ Found loading states:');
  loadingElements.forEach(el => console.log('  -', el.textContent.trim()));
} else {
  console.log('✅ No loading states found');
}

// 5. Check React component state (look for map-related props)
console.log('\n5. Component State Check:');
try {
  // Look for React Fiber nodes with map-related props
  const reactElements = Array.from(document.querySelectorAll('*')).filter(el => {
    const keys = Object.keys(el);
    return keys.some(key => key.startsWith('__reactInternalInstance') || key.startsWith('_reactInternalFiber'));
  });
  
  console.log(`Found ${reactElements.length} React elements to inspect`);
  
  // This is a basic check - in a real scenario you'd need React DevTools
  console.log('💡 Use React DevTools to inspect component props for:');
  console.log('  - schoolLocation');
  console.log('  - driverLocation'); 
  console.log('  - students array');
  console.log('  - optimizedStops');
  
} catch (error) {
  console.log('Could not inspect React state:', error.message);
}

// 6. Summary
console.log('\n📋 Summary:');
console.log('Run this script and check the results above.');
console.log('If Google Maps API is loaded but no map containers are found,');
console.log('the issue might be with component rendering or data loading.');