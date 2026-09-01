#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, readFile, rm, stat } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { spawnSync } from 'node:child_process'

const rootDir=process.cwd(),snapshotDir=resolve(rootDir,'catalog-snapshots')
const run=(command,args,options={})=>{const result=spawnSync(command,args,{cwd:rootDir,stdio:'inherit',...options});if(result.error)throw result.error;if(result.status!==0)process.exit(result.status??1);return result}
const digest=(path)=>new Promise((done,fail)=>{const hash=createHash('sha256'),stream=createReadStream(path);stream.on('data',(chunk)=>hash.update(chunk));stream.once('error',fail);stream.once('end',()=>done(hash.digest('hex')))})
const releases=spawnSync('gh',['release','list','--limit','100','--json','tagName,isDraft'],{cwd:rootDir,encoding:'utf8'})
if(releases.error)throw releases.error
if(releases.status!==0)throw new Error(releases.stderr.trim()||'GitHub Releases niet leesbaar')
const releaseTag=JSON.parse(releases.stdout)
  .filter((release)=>!release.isDraft&&/^catalog-snapshot-\d{4}-\d{2}-\d{2}[_-]/i.test(release.tagName))
  .map((release)=>release.tagName)
  .sort((a,b)=>b.localeCompare(a))[0]
if(!releaseTag)throw new Error('Geen afzonderlijke catalogus-snapshotrelease gevonden')
const release=spawnSync('gh',['release','view',releaseTag,'--json','assets'],{cwd:rootDir,encoding:'utf8'})
if(release.error)throw release.error
if(release.status!==0)throw new Error(release.stderr.trim()||`GitHub Release ${releaseTag} niet leesbaar`)
const names=JSON.parse(release.stdout).assets.map((asset)=>asset.name)
const manifestName=names.filter((name)=>/^catalog-snapshot-.*\.zip\.manifest\.json$/i.test(name)).sort((a,b)=>b.localeCompare(a))[0]
await mkdir(snapshotDir,{recursive:true})
let archivePath
if(manifestName){
  run('gh',['release','download',releaseTag,'--pattern',manifestName,'--dir',snapshotDir,'--clobber'])
  const manifest=JSON.parse(await readFile(resolve(snapshotDir,manifestName),'utf8'))
  if(!manifest.archiveName||!Array.isArray(manifest.parts))throw new Error('Ongeldig snapshotmanifest')
  archivePath=resolve(snapshotDir,basename(manifest.archiveName));await rm(archivePath,{force:true})
  for(const part of manifest.parts){
    if(!names.includes(part.name))throw new Error(`Release-asset ontbreekt: ${part.name}`)
    run('gh',['release','download',releaseTag,'--pattern',part.name,'--dir',snapshotDir,'--clobber'])
    const partPath=resolve(snapshotDir,basename(part.name))
    if((await stat(partPath)).size!==part.size||(await digest(partPath))!==part.sha256)throw new Error(`Controle mislukt voor ${part.name}`)
    await pipeline(createReadStream(partPath),createWriteStream(archivePath,{flags:'a'}))
  }
  if((await stat(archivePath)).size!==manifest.size||(await digest(archivePath))!==manifest.sha256)throw new Error('Samengevoegde snapshot komt niet overeen met het manifest')
}else{
  const archiveName=names.filter((name)=>/^catalog-snapshot-.*\.zip$/i.test(name)).sort((a,b)=>b.localeCompare(a))[0]
  if(!archiveName)throw new Error(`Geen catalogus-snapshot in GitHub Release ${releaseTag}`)
  archivePath=resolve(snapshotDir,archiveName);await rm(archivePath,{force:true});run('gh',['release','download',releaseTag,'--pattern',archiveName,'--dir',snapshotDir])
}
run(process.execPath,['./scripts/catalog-restore.mjs',archivePath])
