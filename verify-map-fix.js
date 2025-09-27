// Browser console script to verify if the Google Maps fix is working
// Copy and paste this into the browser console on the driver route page

console.log('🗺️ Verifying Google Maps fix for TRP001...');

// Check for "Map Unavailable" message
const mapUnavailable = document.querySelector('[data-testid="map-unavailable"]') || 
                      Array.from(document.querySelectorAll('*')).find(el => 
                        el.textContent && el.textContent.includes('Map Unavailable')
                      );

if (mapUnavailable) {
  console.log('❌ "Map Unavailable" message still present');
  console.log('Element:', mapUnavailable);
  console.log('Text:', mapUnavailable.textContent);
} else {
  console.log('✅ No "Map Unavailable" message found');
}

// Check for API key error message
const apiKeyError = Array.from(document.querySelectorAll('*')).find(el => 
  el.textContent && (
    el.textContent.includes('API key not configured') ||
    el.textContent.includes('Google Maps API key')
  )
);

if (apiKeyError) {
  console.log('❌ API key error message found');
  console.log('Element:', apiKeyError);
  console.log('Text:', apiKeyError.textContent);
} else {
  console.log('✅ No API key error message found');
}

// Check for Google Maps container
const mapContainer = document.querySelector('[data-testid="google-map"]') ||
                    document.querySelector('.google-map') ||
                    document.querySelector('[id*="map"]') ||
                    document.querySelector('[class*="map"]');

if (mapContainer) {
  console.log('✅ Map container found:', mapContainer);
  console.log('Container dimensions:', {
    width: mapContainer.offsetWidth,
    height: mapContainer.offsetHeight,
    visible: mapContainer.offsetWidth > 0 && mapContainer.offsetHeight > 0
  });
  
  // Check if it has Google Maps content
  const hasGoogleContent = mapContainer.querySelector('[src*="maps.googleapis.com"], [src*="maps.gstatic.com"]') ||
                          mapContainer.querySelector('.gm-style') ||
                          mapContainer.innerHTML.includes('google');
  
  if (hasGoogleContent) {
    console.log('✅ Google Maps content detected in container');
  } else {
    console.log('⚠️ Map container found but no Google Maps content detected');
  }
} else {
  console.log('❌ No map container found');
}

// Check for Google Maps API elements anywhere on page
const googleMapsElements = document.querySelectorAll('[src*="maps.googleapis.com"], [src*="maps.gstatic.com"], .gm-style');
if (googleMapsElements.length > 0) {
  console.log('✅ Google Maps API elements found:', googleMapsElements.length);
  googleMapsElements.forEach((el, i) => {
    console.log(`  ${i+1}. ${el.tagName}:`, el.src || el.className);
  });
} else {
  console.log('⚠️ No Google Maps API elements detected');
}

// Check console for any Google Maps related errors
console.log('\n📋 Check the browser console for any Google Maps related errors');
console.log('Look for messages containing: "Google Maps", "API key", "InvalidKeyMapError", etc.');

// Check if school location data is loaded
console.log('\n📍 Checking school location data...');
if (window.localStorage) {
  const keys = Object.keys(localStorage).filter(key => 
    key.includes('school') || key.includes('location') || key.includes('TRP001')
  );
  if (keys.length > 0) {
    console.log('📦 Found school-related data in localStorage:', keys);
  }
}

// Summary
console.log('\n📊 SUMMARY:');
console.log('- Map Unavailable message:', mapUnavailable ? '❌ Present' : '✅ Not found');
console.log('- API key error:', apiKeyError ? '❌ Present' : '✅ Not found');
console.log('- Map container:', mapContainer ? '✅ Found' : '❌ Not found');
console.log('- Google Maps elements:', googleMapsElements.length > 0 ? '✅ Found' : '❌ Not found');

if (!mapUnavailable && !apiKeyError && mapContainer && googleMapsElements.length > 0) {
  console.log('🎉 SUCCESS: Map appears to be working!');
} else {
  console.log('⚠️ Map may still have issues - check the details above');
}