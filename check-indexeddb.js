// Script to check IndexedDB for cached coordinates
// Run this in the browser console

console.log('=== CHECKING INDEXEDDB FOR COORDINATES ===');

// Function to check all IndexedDB databases
async function checkAllDatabases() {
  try {
    // Get all databases
    const databases = await indexedDB.databases();
    console.log('Available databases:', databases);
    
    for (const dbInfo of databases) {
      if (dbInfo.name) {
        console.log(`\n--- Checking database: ${dbInfo.name} ---`);
        await checkDatabase(dbInfo.name);
      }
    }
  } catch (error) {
    console.error('Error checking databases:', error);
  }
}

// Function to check a specific database
async function checkDatabase(dbName) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName);
    
    request.onsuccess = function(event) {
      const db = event.target.result;
      console.log(`Database ${dbName} opened successfully`);
      console.log('Object stores:', Array.from(db.objectStoreNames));
      
      // Check each object store
      const transaction = db.transaction(db.objectStoreNames, 'readonly');
      
      for (const storeName of db.objectStoreNames) {
        const store = transaction.objectStore(storeName);
        const getAllRequest = store.getAll();
        
        getAllRequest.onsuccess = function() {
          const data = getAllRequest.result;
          console.log(`Store ${storeName} data:`, data);
          
          // Check for coordinates in the data
          data.forEach((item, index) => {
            const itemStr = JSON.stringify(item);
            if (itemStr.includes('40.7') || itemStr.includes('-74.') || 
                itemStr.includes('lat') || itemStr.includes('lng') ||
                itemStr.includes('latitude') || itemStr.includes('longitude')) {
              console.log(`FOUND COORDINATES in ${storeName}[${index}]:`, item);
            }
          });
        };
      }
      
      db.close();
      resolve();
    };
    
    request.onerror = function() {
      console.error(`Error opening database ${dbName}:`, request.error);
      reject(request.error);
    };
  });
}

// Run the check
checkAllDatabases();

// Also check localStorage and sessionStorage for coordinates
console.log('\n=== CHECKING STORAGE FOR COORDINATES ===');
for (let i = 0; i < localStorage.length; i++) {
  const key = localStorage.key(i);
  const value = localStorage.getItem(key);
  if (value && (value.includes('40.7') || value.includes('-74.') || 
                value.includes('lat') || value.includes('lng'))) {
    console.log(`FOUND COORDINATES in localStorage[${key}]:`, value);
  }
}

for (let i = 0; i < sessionStorage.length; i++) {
  const key = sessionStorage.key(i);
  const value = sessionStorage.getItem(key);
  if (value && (value.includes('40.7') || value.includes('-74.') || 
                value.includes('lat') || value.includes('lng'))) {
    console.log(`FOUND COORDINATES in sessionStorage[${key}]:`, value);
  }
}

console.log('=== END INDEXEDDB CHECK ===');