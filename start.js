const { spawn } = require('child_process')
const path = require('path')
const proc = spawn('cmd', ['/c', 'npm run dev'], {
  cwd: path.resolve(__dirname),
  stdio: 'inherit',
  shell: false
})
proc.on('error', (err) => { console.error('Error:', err); process.exit(1) })
proc.on('exit', (code) => { process.exit(code || 0) })
