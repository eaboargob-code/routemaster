# Scripts

This directory contains maintenance and utility scripts for the project.

## `backfill.ts`

A one-time script to normalize data in the `users` and `routes` collections in Firestore.

### Prerequisites

1.  **Install dependencies:**
    ```sh
    npm install
    ```
    This will install `firebase-admin` and `minimist` as defined in `package.json`.

2.  **Set up authentication:**
    You need a service account key for your project. Download the JSON key from the Firebase Console:
    _Project settings > Service accounts > Generate new private key._
    
    Set the environment variable `GOOGLE_APPLICATION_CREDENTIALS` to point to your key file:
    ```sh
    export GOOGLE_APPLICATION_CREDENTIALS="/path/to/your/serviceAccountKey.json"
    ```

### How to Run

The `package.json` file contains a helper script to compile and run the backfill.

**1. Dry Run (Recommended First)**

To preview changes without writing to Firestore, use the `--dry-run` flag.

```sh
npm run backfill -- --project routemaster-admin-k1thy --dry-run
```

**2. Execute Backfill**

To execute the backfill and apply the changes to your Firestore database:

```sh
npm run backfill -- --project routemaster-admin-k1thy
```

*Note: The `--` after `npm run backfill` is important. It separates the arguments for the npm command from the arguments for the script itself.*
