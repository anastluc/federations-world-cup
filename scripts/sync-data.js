import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_URL = 'https://worldcup26.ir/get/games';
const OUTPUT_DIR = path.join(__dirname, '../public/data');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'games.json');

async function syncData() {
  console.log('Fetching World Cup 2026 games from API...');
  try {
    const response = await fetch(API_URL);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    
    if (!data || !data.games) {
      throw new Error('Invalid data structure received from API');
    }

    // Ensure directory exists
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }
    
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(data, null, 2));
    console.log(`Successfully synced games! Saved to ${OUTPUT_FILE}`);
  } catch (error) {
    console.error('Error syncing games data:', error);
    process.exit(1);
  }
}

syncData();
