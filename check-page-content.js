// Script to check page content and Google Maps API loading
// This should be run in the browser console on the driver route page

console.log('🔍 Checking page content and Google Maps API...');

// Check if Google Maps API is loaded
if (typeof google !== 'undefined' && google.maps) {
  console.log('✅ Google Maps API is loaded');
  console.log('Google Maps version:', google.maps.version);
} else {
  console.log('❌ Google Maps API is NOT loaded');
}

// Check for map containers
const mapContainers = document.querySelectorAll('[id*="map"], [class*="map"], .gm-style');
console.log(`Found ${mapContainers.length} potential map containers:`, mapContainers);

// Check for "Map Unavailable" message
const unavailableMessages = document.querySelectorAll('*');
let foundUnavailable = false;
unavailableMessages.forEach(el => {
  if (el.textContent && el.textContent.includes('Map Unavailable')) {
    console.log('❌ Found "Map Unavailable" message:', el.textContent);
    foundUnavailable = true;
  }
});

if (!foundUnavailable) {
  console.log('✅ No "Map Unavailable" message found');
}

// Check for Google Maps API key error
const apiKeyErrors = document.querySelectorAll('*');
apiKeyErrors.forEach(el => {
  if (el.textContent && el.textContent.includes('API key not configured')) {
    console.log('❌ Found API key error:', el.textContent);
  }
});

// Check for any error messages
const errorMessages = document.querySelectorAll('[class*="error"], [class*="red"]');
console.log(`Found ${errorMessages.length} potential error elements:`, errorMessages);

// Check page title and main content
console.log('Page title:', document.title);
console.log('Main content areas:', document.querySelectorAll('main, [role="main"], .main'));

// Check if there are any script tags loading Google Maps
const scripts = document.querySelectorAll('script[src*="maps.googleapis.com"]');
console.log(`Found ${scripts.length} Google Maps script tags:`, scripts);

// Check for React components or debugging info
if (window.React) {
  console.log('✅ React is available');
} else {
  console.log('❌ React not found in global scope');
}

// Check for any coordinate-related data in the page
const pageText = document.body.textContent;
if (pageText.includes('40.7') || pageText.includes('-74.')) {
  console.log('🗽 WARNING: Found potential New York coordinates in page text');
} else {
  console.log('✅ No New York coordinates found in page text');
}

if (pageText.includes('24.7') || pageText.includes('46.6')) {
  console.log('🏜️ Found Riyadh coordinates in page text');
} else {
  console.log('❌ No Riyadh coordinates found in page text');
}

console.log('✅ Page content check complete!');