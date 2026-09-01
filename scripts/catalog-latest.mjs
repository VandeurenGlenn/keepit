#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, readFile, rm, stat } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { spawn, spawnSync } from 'node:child_process'

const rootDir=process.cwd(),snapshotDir=resolve(rootDir,'catalog-snapshots')
const run=(command,args,options={})=>{const result=spawnSync(command,args,{cwd:rootDir,stdio:'inherit',...options});if(result.error)throw result.error;if(result.status!==0)process.exit(result.status??1);return result}
const digest=(path)=>new Promise((done,fail)=>{const hash=createHash('sha256'),stream=createReadStream(path);stream.on('data',(chunk)=>hash.update(chunk));stream.once('error',fail);stream.once('end',()=>done(hash.digest('hex')))})
const size=(bytes)=>bytes>=1024**3?`${(bytes/1024**3).toFixed(2)} GB`:`${(bytes/1024**2).toFixed(1)} MB`
const downloadAsset=async(asset,path,index,total)=>{
  await rm(path,{force:true})
  console.log(`Download ${index}/${total}: ${asset.name}`)
  const child=spawn('gh',['api','-H','Accept: application/octet-stream',`repos/${repository}/releases/assets/${asset.id}`],{cwd:rootDir,stdio:['ignore','pipe','pipe']})
  let received=0,stderr='',lastUpdate=0
  const started=Date.now()
  child.stderr.setEncoding('utf8');child.stderr.on('data',(chunk)=>{stderr+=chunk})
  child.stdout.on('data',(chunk)=>{
    received+=chunk.length
    const now=Date.now()
    if(now-lastUpdate<500&&received<asset.size)return
    lastUpdate=now
    const percent=asset.size?Math.min(100,received/asset.size*100):0
    const speed=received/Math.max(1,(now-started)/1000)
    process.stdout.write(`\r  ${percent.toFixed(1).padStart(5)}%  ${size(received)} / ${size(asset.size)}  ${size(speed)}/s`)
  })
  const transfer=pipeline(child.stdout,createWriteStream(path))
  const exited=new Promise((done,fail)=>{child.once('error',fail);child.once('close',(code)=>code===0?done():fail(new Error(stderr.trim()||`gh api stopte met status ${code}`)))})
  try{await Promise.all([transfer,exited])}finally{process.stdout.write('\n')}
  if((await stat(path)).size!==asset.size)throw new Error(`Onvolledige download voor ${asset.name}`)
}
const remote=spawnSync('git',['config','--get','remote.origin.url'],{cwd:rootDir,encoding:'utf8'})
if(remote.error)throw remote.error
if(remote.status!==0)throw new Error('Git remote origin niet leesbaar')
const repository=process.env.GH_REPO||remote.stdout.trim().match(/github\.com[/:]([^/]+\/[^/.]+)(?:\.git)?$/i)?.[1]
if(!repository)throw new Error('GitHub repository kon niet uit remote origin worden bepaald; stel GH_REPO in')
const releases=spawnSync('gh',['api',`repos/${repository}/releases?per_page=100`],{cwd:rootDir,encoding:'utf8'})
if(releases.error)throw releases.error
if(releases.status!==0)throw new Error(releases.stderr.trim()||'GitHub Releases niet leesbaar')
const release=JSON.parse(releases.stdout)
  .filter((release)=>!release.draft&&/^catalog-snapshot-\d{4}-\d{2}-\d{2}[_-]/i.test(release.tag_name))
  .sort((a,b)=>b.tag_name.localeCompare(a.tag_name))[0]
const releaseTag=release?.tag_name
if(!releaseTag)throw new Error('Geen afzonderlijke catalogus-snapshotrelease gevonden')
const names=release.assets.map((asset)=>asset.name)
const assets=new Map(release.assets.map((asset)=>[asset.name,asset]))
const manifestName=names.filter((name)=>/^catalog-snapshot-.*\.zip\.manifest\.json$/i.test(name)).sort((a,b)=>b.localeCompare(a))[0]
console.log(`Snapshot gevonden: ${releaseTag}`)
await mkdir(snapshotDir,{recursive:true})
let archivePath
if(manifestName){
  await downloadAsset(assets.get(manifestName),resolve(snapshotDir,manifestName),1,release.assets.length)
  const manifest=JSON.parse(await readFile(resolve(snapshotDir,manifestName),'utf8'))
  if(!manifest.archiveName||!Array.isArray(manifest.parts))throw new Error('Ongeldig snapshotmanifest')
  archivePath=resolve(snapshotDir,basename(manifest.archiveName));await rm(archivePath,{force:true})
  for(const [partIndex,part] of manifest.parts.entries()){
    if(!names.includes(part.name))throw new Error(`Release-asset ontbreekt: ${part.name}`)
    const partPath=resolve(snapshotDir,basename(part.name))
    await downloadAsset(assets.get(part.name),partPath,partIndex+2,release.assets.length)
    process.stdout.write(`Verifiëren ${partIndex+1}/${manifest.parts.length}… `)
    if((await stat(partPath)).size!==part.size||(await digest(partPath))!==part.sha256)throw new Error(`\nControle mislukt voor ${part.name}`)
    console.log('ok')
    console.log(`Samenvoegen ${partIndex+1}/${manifest.parts.length}…`)
    await pipeline(createReadStream(partPath),createWriteStream(archivePath,{flags:'a'}))
  }
  process.stdout.write('Volledige snapshot verifiëren… ')
  if((await stat(archivePath)).size!==manifest.size||(await digest(archivePath))!==manifest.sha256)throw new Error('Samengevoegde snapshot komt niet overeen met het manifest')
  console.log('ok')
}else{
  const archiveName=names.filter((name)=>/^catalog-snapshot-.*\.zip$/i.test(name)).sort((a,b)=>b.localeCompare(a))[0]
  if(!archiveName)throw new Error(`Geen catalogus-snapshot in GitHub Release ${releaseTag}`)
  archivePath=resolve(snapshotDir,archiveName);await downloadAsset(assets.get(archiveName),archivePath,1,1)
}
console.log('Catalogus herstellen…')
run(process.execPath,['./scripts/catalog-restore.mjs',archivePath])
