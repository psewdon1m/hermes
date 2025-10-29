$ErrorActionPreference = 'Stop'

Write-Host 'Validating Node.js availability...' -ForegroundColor Cyan
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCommand) {
  Write-Error 'Node.js not found. Please install Node.js and ensure it is available in PATH.'
  exit 1
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$webDir = Join-Path $repoRoot 'web'

Write-Host ("Changing directory to {0}" -f $webDir) -ForegroundColor Cyan
Set-Location -Path $webDir

$nodeInlineScript = @'
const http=require('http');
const fs=require('fs');
const path=require('path');
http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  const pathname=url.pathname==='/'?'/index.html':url.pathname;
  const file=path.join(process.cwd(),decodeURIComponent(pathname));
  const types={
    '.html':'text/html; charset=utf-8',
    '.js':'text/javascript; charset=utf-8',
    '.css':'text/css; charset=utf-8',
    '.json':'application/json; charset=utf-8',
    '.png':'image/png',
    '.jpg':'image/jpeg',
    '.svg':'image/svg+xml',
    '.webm':'video/webm',
    '.wav':'audio/wav'
  };
  fs.stat(file,(err,stat)=>{
    if(err||!stat.isFile()){
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});
    fs.createReadStream(file).pipe(res);
  });
}).listen(3000,()=>console.log('http://localhost:3000'));
'@

Write-Host 'Starting test server (Ctrl+C to stop)...' -ForegroundColor Green
Write-Host 'Open this URL to load the frontend:' -ForegroundColor Yellow
Write-Host 'http://localhost:3000/index.html?token=mock-token' -ForegroundColor Magenta

& node -e $nodeInlineScript
