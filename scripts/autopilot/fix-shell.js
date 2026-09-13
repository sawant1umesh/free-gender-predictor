// This script removes the shadowing powershell.CMD file
const fs = require('fs');
const path = require('path');
const target = path.join(__dirname, 'powershell.CMD');
if (fs.existsSync(target)) {
  fs.unlinkSync(target);
  console.log('Removed powershell.CMD');
} else {
  console.log('powershell.CMD not found');
}
